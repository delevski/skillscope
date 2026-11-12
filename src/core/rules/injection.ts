import { truncate } from "../frontmatter";
import type { Fix, RuleContext, Severity } from "../types";

interface Pattern {
  id: string;
  re: RegExp;
  severity: Severity;
  title: string;
  message: string;
  removable?: boolean;
}

const PATTERNS: Pattern[] = [
  { id: "inj-override", re: /\b(ignore|disregard|forget|override)\b[^.\n]{0,40}\b(previous|prior|above|earlier|all|any)\b[^.\n]{0,30}\b(instructions?|rules?|prompts?|guidelines?|polic(?:y|ies))\b/i, severity: "critical", title: "Instruction override phrase", message: "Tells the model to drop its earlier instructions, a classic prompt injection.", removable: true },
  { id: "inj-conceal", re: /\b(do not|don't|never|without)\b[^.\n]{0,30}\b(tell|inform|notify|alert|show|mention|reveal)\b[^.\n]{0,25}\b(the )?(user|human|operator)\b/i, severity: "critical", title: "Asks the agent to hide actions from the user", message: "Concealment instructions are a strong sign of malicious intent.", removable: true },
  { id: "inj-roleplay", re: /\b(you are now|from now on you (are|will)|act as (an? )?(unrestricted|jailbroken)|developer mode|DAN mode)\b/i, severity: "high", title: "Role hijack phrase", message: "Attempts to replace the agent's identity or safety posture.", removable: true },
  { id: "inj-sysprompt", re: /\b(reveal|print|output|repeat|leak|show)\b[^.\n]{0,30}\b(system prompt|hidden instructions|your instructions|initial prompt)\b/i, severity: "high", title: "Asks to leak the system prompt", message: "Skills should never ask the agent to disclose its own instructions.", removable: true },
  { id: "inj-exfil-cmd", re: /\b(curl|wget|nc|ncat)\b[^\n|]{0,120}(\$\{?[A-Z_]*(KEY|TOKEN|SECRET|PASSWORD)[A-Z_]*\}?|~\/\.(ssh|aws|npmrc)|\.env\b|id_rsa)/i, severity: "critical", title: "Sends secrets over the network", message: "A command posts an environment secret or credential file to a remote host.", removable: true },
  { id: "inj-pipe-shell", re: /\b(curl|wget)\b[^\n]{0,160}\|\s*(sudo\s+)?(ba|z)?sh\b/i, severity: "high", title: "Pipes a download straight into a shell", message: "Remote code runs unreviewed. Pin a version and verify a checksum instead.", removable: false },
  { id: "inj-cred-read", re: /(~|\$HOME)\/\.(ssh|aws|gnupg|config\/gcloud|kube)\b|\bid_rsa\b|\/etc\/(passwd|shadow)\b|cat\s+\.env\b/i, severity: "high", title: "Reads credential files", message: "Skills rarely need your SSH, cloud or shell credentials.", removable: false },
  { id: "inj-img-exfil", re: /!\[[^\]]*\]\(https?:\/\/[^)\s]*[?&][^)\s]*(\{\{|\$\{|%7B)[^)]*\)/i, severity: "high", title: "Markdown image can leak data", message: "A templated image URL sends data to a remote host when rendered.", removable: true },
  { id: "inj-dangerous-flag", re: /--dangerously-skip-permissions|--no-verify\b|--allow-all-tools|bypassPermissions|chmod\s+(-R\s+)?777/i, severity: "high", title: "Disables a safety check", message: "Turns off permission prompts or file protections.", removable: false },
  { id: "inj-eval", re: /\b(eval|exec)\s*\(\s*(atob|base64|Buffer\.from|decode)|base64\s+(-d|--decode)[^\n]*\|\s*(ba|z)?sh/i, severity: "critical", title: "Runs decoded code", message: "Decoding and executing a payload hides what actually runs.", removable: true },
];

const HIDDEN_RE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/;
const TAG_RE = /[\u{E0000}-\u{E007F}]/u;
const B64_RE = /\b[A-Za-z0-9+/]{120,}={0,2}(?![A-Za-z0-9+/])/;
const HTML_COMMENT_RE = /<!--([\s\S]*?)-->/g;

export function injectionRules(ctx: RuleContext): void {
  if (ctx.kind === "mcp" || ctx.kind === "plugin") return;
  const { lines, add } = ctx;
  let inFence = false;
  lines.forEach((line, i) => {
    const ln = i + 1;
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    for (const p of PATTERNS) {
      if (p.re.test(line)) {
        const fix: Fix | undefined = p.removable
          ? { title: "Remove this line", safe: false, description: "Deletes the line. Review before applying.", edits: [{ line: ln, op: "delete" }] }
          : undefined;
        const sev = inFence && p.id === "inj-pipe-shell" ? "medium" : p.severity;
        add({ ruleId: p.id, severity: sev, category: "security", line: ln, title: p.title, message: p.message, snippet: truncate(line.trim(), 140), fix });
      }
    }
    if (HIDDEN_RE.test(line) || TAG_RE.test(line)) {
      const cleaned = line.replace(new RegExp(HIDDEN_RE.source, "g"), "").replace(new RegExp(TAG_RE.source, "gu"), "");
      add({
        ruleId: "inj-hidden-unicode", severity: "high", category: "security", line: ln,
        title: "Hidden Unicode characters", message: "Zero-width or bidirectional control characters can hide instructions from human reviewers.",
        snippet: truncate(visible(line), 140),
        fix: { title: "Strip invisible characters", safe: true, description: "Removes zero-width, bidi and tag characters from the line.", edits: [{ line: ln, op: "replace", text: cleaned }] },
      });
    }
    if (B64_RE.test(line) && !/^\s*(data:|!\[)/.test(line)) {
      add({ ruleId: "inj-base64", severity: "medium", category: "security", line: ln, title: "Long base64-like blob", message: "Encoded blobs make instructions or payloads unreadable to reviewers.", snippet: truncate(line.trim(), 100) });
    }
  });
  const text = lines.join("\n");
  let m: RegExpExecArray | null;
  HTML_COMMENT_RE.lastIndex = 0;
  while ((m = HTML_COMMENT_RE.exec(text))) {
    const body = m[1].trim();
    if (body.length > 25 && /\b(you|agent|assistant|must|always|never|ignore|run|execute|send)\b/i.test(body)) {
      const line = text.slice(0, m.index).split("\n").length;
      add({ ruleId: "inj-html-comment", severity: "high", category: "security", line, title: "Instructions hidden in an HTML comment", message: "Comments are invisible when the Markdown is rendered but still read by the model.", snippet: truncate(body.replace(/\s+/g, " "), 140) });
    }
  }
}

function visible(s: string): string {
  return s.replace(new RegExp(HIDDEN_RE.source, "g"), (c) => `<U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}>`);
}
