import type { RuleContext } from "../types";

const SECRET_RES: [string, RegExp][] = [
  ["OpenAI-style key", /\bsk-[A-Za-z0-9_-]{20,}\b/],
  ["GitHub token", /\b(ghp|gho|ghs|github_pat)_[A-Za-z0-9_]{20,}\b/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["Slack token", /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/],
  ["Bearer token", /\bBearer\s+[A-Za-z0-9._-]{24,}\b/],
];

export function mcpRules(ctx: RuleContext): void {
  if (ctx.kind !== "mcp") return;
  const { file, lines, add } = ctx;
  let data: any;
  try {
    data = JSON.parse(file.content);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const pos = /position (\d+)/.exec(msg);
    const line = pos ? file.content.slice(0, Number(pos[1])).split("\n").length : 1;
    add({ ruleId: "mcp-json", severity: "critical", category: "config", line, title: "Config is not valid JSON", message: msg, snippet: lines[line - 1]?.trim() });
    return;
  }
  const servers = data?.mcpServers ?? data?.servers;
  if (!servers || typeof servers !== "object" || Array.isArray(servers)) {
    add({ ruleId: "mcp-shape", severity: "medium", category: "config", line: 1, title: "No mcpServers object", message: "Expected a top-level mcpServers map of server name to launch config." });
    return;
  }
  const lineOf = (needle: string, from = 0): number => {
    const i = lines.findIndex((l, idx) => idx >= from && l.includes(needle));
    return i === -1 ? 1 : i + 1;
  };
  for (const [name, cfg] of Object.entries<any>(servers)) {
    const base = lineOf(`"${name}"`);
    if (!cfg || typeof cfg !== "object") {
      add({ ruleId: "mcp-server-shape", severity: "high", category: "config", line: base, title: `Server "${name}" is not an object`, message: "Each server needs command or url." });
      continue;
    }
    if (!cfg.command && !cfg.url) {
      add({ ruleId: "mcp-no-launch", severity: "high", category: "config", line: base, title: `Server "${name}" cannot start`, message: "Add a command (stdio) or a url (remote).", snippet: lines[base - 1]?.trim() });
    }
    const args: string[] = Array.isArray(cfg.args) ? cfg.args.map(String) : [];
    const cmd = String(cfg.command ?? "");
    if (/^(npx|bunx|pnpm dlx|uvx)$/.test(cmd) || /^(npx|uvx)\b/.test(cmd)) {
      const pkg = args.find((a) => !a.startsWith("-"));
      if (pkg && !/@\d/.test(pkg.replace(/^@/, "")) && !/==\d/.test(pkg)) {
        const line = lineOf(pkg, base - 1);
        add({
          ruleId: "mcp-unpinned", severity: "medium", category: "security", line,
          title: `Unpinned package for "${name}"`, message: `${pkg} resolves to the latest release on every launch. A compromised release runs on your machine.`,
          snippet: lines[line - 1]?.trim(),
          fix: { title: "Pin to a version", safe: false, description: `Appends @<version> to ${pkg}. Replace x.y.z with the version you reviewed.`, edits: [{ line, op: "replace", text: lines[line - 1].replace(pkg, `${pkg}@x.y.z`) }] },
        });
      }
      if (args.includes("-y") || args.includes("--yes")) {
        add({ ruleId: "mcp-auto-yes", severity: "low", category: "security", line: lineOf('"-y"', base - 1), title: `Auto-confirm install for "${name}"`, message: "-y skips the install prompt so nothing asks before new code downloads." });
      }
    }
    if (/^(sh|bash|zsh|cmd|powershell)(\.exe)?$/.test(cmd) && args.some((a) => a === "-c" || a === "/c")) {
      const line = lineOf(`"${cmd}"`, base - 1);
      add({ ruleId: "mcp-shell", severity: "high", category: "security", line, title: `Server "${name}" launches through a shell`, message: "Shell strings are easy to inject into. Call the binary directly with args.", snippet: lines[line - 1]?.trim() });
    }
    if (typeof cfg.url === "string") {
      if (/^http:\/\//i.test(cfg.url) && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(cfg.url)) {
        const line = lineOf(cfg.url, base - 1);
        add({
          ruleId: "mcp-http", severity: "high", category: "security", line, title: `Server "${name}" uses plain HTTP`,
          message: "Tool calls and tokens travel unencrypted.", snippet: lines[line - 1]?.trim(),
          fix: { title: "Switch to HTTPS", safe: true, description: "Rewrites http:// to https:// for this URL.", edits: [{ line, op: "replace", text: lines[line - 1].replace("http://", "https://") }] },
        });
      }
    }
    for (const a of args) {
      if (a === "/" || a === "~" || a === "C:\\" || a === "$HOME") {
        const line = lineOf(`"${a.replace(/\\/g, "\\\\")}"`, base - 1);
        add({ ruleId: "mcp-fs-root", severity: "high", category: "security", line, title: `Server "${name}" can read the whole disk`, message: `Argument "${a}" gives the server your entire filesystem. Point it at one project folder.`, snippet: lines[line - 1]?.trim() });
      }
    }
    const blob = JSON.stringify({ env: cfg.env, headers: cfg.headers, args: cfg.args });
    for (const [label, re] of SECRET_RES) {
      const hit = re.exec(blob);
      if (hit) {
        const line = lineOf(hit[0].slice(0, 14), base - 1);
        add({
          ruleId: "mcp-secret", severity: "critical", category: "security", line,
          title: `Hardcoded secret in "${name}"`, message: `${label} is stored in the file. Anyone with the repo can use it. Reference an environment variable instead.`,
          snippet: lines[line - 1]?.trim().replace(hit[0], hit[0].slice(0, 6) + "..."),
          fix: { title: "Replace with an env reference", safe: false, description: "Swaps the literal for ${ENV_VAR}. Rotate the exposed key.", edits: [{ line, op: "replace", text: lines[line - 1].replace(hit[0], "${" + envName(name) + "}") }] },
        });
      }
    }
  }
  const names = [...(file.content.matchAll(/"([^"]+)"\s*:\s*\{\s*\n?\s*"(command|url)"/g))].map((m) => m[1]);
  const dup = names.find((n, i) => names.indexOf(n) !== i);
  if (dup) add({ ruleId: "mcp-duplicate", severity: "medium", category: "config", line: lineOf(`"${dup}"`), title: `Duplicate server "${dup}"`, message: "Only the last definition is kept by JSON parsers." });
  if (Object.keys(servers).length > 8) {
    add({ ruleId: "mcp-many", severity: "low", category: "context", line: 1, title: "Many MCP servers configured", message: `${Object.keys(servers).length} servers add tool descriptions to every session. Disable the ones you do not use.` });
  }
}

function envName(server: string): string {
  return server.toUpperCase().replace(/[^A-Z0-9]+/g, "_") + "_API_KEY";
}
