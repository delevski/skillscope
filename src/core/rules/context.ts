import { truncate } from "../frontmatter";
import { estimateTokens } from "../tokens";
import type { RuleContext } from "../types";

export const TOKEN_WARN = 4000;
export const TOKEN_ERROR = 9000;

export function contextRules(ctx: RuleContext): void {
  if (ctx.kind === "mcp" || ctx.kind === "plugin") return;
  const { lines, add } = ctx;
  const text = lines.join("\n");
  const tokens = estimateTokens(text);

  if (tokens > TOKEN_ERROR) {
    add({ ruleId: "ctx-huge", severity: "high", category: "context", line: 1, title: "File is very large", message: `About ${tokens.toLocaleString("en-US")} tokens. Everything here competes with the user's task for context. Move reference material into separate files that load on demand.` });
  } else if (tokens > TOKEN_WARN) {
    add({ ruleId: "ctx-large", severity: "medium", category: "context", line: 1, title: "File is getting large", message: `About ${tokens.toLocaleString("en-US")} tokens. Consider splitting rarely used sections into referenced files.` });
  }

  // duplicated paragraphs
  const paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p.length > 80);
  const seen = new Map<string, number>();
  for (const p of paras) seen.set(p, (seen.get(p) ?? 0) + 1);
  for (const [p, n] of seen) {
    if (n > 1) {
      const line = lines.findIndex((l) => l.trim() === p.split("\n")[0].trim()) + 1 || 1;
      add({ ruleId: "ctx-duplicate", severity: "medium", category: "context", line, title: `Paragraph repeated ${n} times`, message: `${estimateTokens(p) * (n - 1)} tokens are wasted on exact repeats.`, snippet: truncate(p.replace(/\s+/g, " "), 120) });
    }
  }

  // shouting
  const shout = (text.match(/\b(NEVER|ALWAYS|MUST|CRITICAL|IMPORTANT|DO NOT)\b/g) ?? []).length;
  if (shout >= 8) {
    add({ ruleId: "ctx-shouting", severity: "low", category: "context", line: 1, title: "Heavy use of ALL-CAPS emphasis", message: `${shout} uppercase directives. Modern models follow calm, specific instructions and over-trigger on shouting.` });
  }

  // very long lines
  lines.forEach((l, i) => {
    if (l.length > 1200 && !/^\s*(\||```)/.test(l)) {
      add({ ruleId: "ctx-long-line", severity: "low", category: "context", line: i + 1, title: "Extremely long line", message: `${l.length} characters on one line are hard to review and diff.`, snippet: truncate(l.trim(), 100) });
    }
  });

  // large inline code blocks
  let start = -1;
  lines.forEach((l, i) => {
    if (/^\s*```/.test(l)) {
      if (start === -1) start = i;
      else {
        const size = i - start - 1;
        if (size > 120) add({ ruleId: "ctx-big-code", severity: "low", category: "context", line: start + 1, title: "Large inline code block", message: `${size} lines of code sit in the instructions. Ship it as a script and reference it.` });
        start = -1;
      }
    }
  });
}
