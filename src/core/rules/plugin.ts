import type { RuleContext } from "../types";

export function pluginRules(ctx: RuleContext): void {
  if (ctx.kind !== "plugin") return;
  const { file, lines, add } = ctx;
  let data: any;
  try {
    data = JSON.parse(file.content);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const pos = /position (\d+)/.exec(msg);
    const line = pos ? file.content.slice(0, Number(pos[1])).split("\n").length : 1;
    add({ ruleId: "plugin-json", severity: "critical", category: "config", line, title: "Manifest is not valid JSON", message: msg, snippet: lines[line - 1]?.trim() });
    return;
  }
  const lineOf = (needle: string): number => {
    const i = lines.findIndex((l) => l.includes(needle));
    return i === -1 ? 1 : i + 1;
  };
  for (const key of ["name", "description", "version"]) {
    if (typeof data?.[key] !== "string" || !data[key].trim()) {
      add({ ruleId: `plugin-${key}`, severity: key === "name" ? "high" : "medium", category: "config", line: 1, title: `Manifest is missing ${key}`, message: `Marketplaces and installers show the ${key} field.` });
    }
  }
  if (typeof data?.version === "string" && !/^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/.test(data.version)) {
    const line = lineOf('"version"');
    add({ ruleId: "plugin-semver", severity: "low", category: "config", line, title: "Version is not semver", message: `"${data.version}" should look like 1.2.3.`, snippet: lines[line - 1]?.trim() });
  }
  const hooks = JSON.stringify(data?.hooks ?? {});
  const cmdRe = /"command"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = cmdRe.exec(hooks))) {
    const cmd = m[1];
    const line = lineOf(cmd.slice(0, 20));
    if (/\b(curl|wget)\b[^|]*\|\s*(ba|z)?sh\b/.test(cmd)) {
      add({ ruleId: "plugin-hook-pipe", severity: "critical", category: "security", line, title: "Hook pipes a download into a shell", message: "This runs remote code every time the hook fires.", snippet: lines[line - 1]?.trim() });
    } else if (/\b(curl|wget)\b/.test(cmd) && /(\$[A-Z_]*(KEY|TOKEN|SECRET)|\.env|\.ssh)/.test(cmd)) {
      add({ ruleId: "plugin-hook-exfil", severity: "critical", category: "security", line, title: "Hook sends secrets to a remote host", message: "A hook command posts an environment secret or credential file.", snippet: lines[line - 1]?.trim() });
    } else if (/\brm\s+-rf\s+(\/|~|\$HOME)/.test(cmd)) {
      add({ ruleId: "plugin-hook-rm", severity: "critical", category: "security", line, title: "Hook deletes the home or root directory", message: "A destructive rm -rf runs automatically.", snippet: lines[line - 1]?.trim() });
    }
  }
}
