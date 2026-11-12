import { parseFrontmatter } from "../frontmatter";
import type { RuleContext } from "../types";

export function permissionRules(ctx: RuleContext): void {
  if (ctx.kind !== "skill") return;
  const fm = parseFrontmatter(ctx.lines);
  if (!fm.present) return;
  for (const key of ["allowed-tools", "tools"]) {
    const v = fm.data[key];
    if (v === undefined) continue;
    const value = Array.isArray(v) ? v.join(", ") : v;
    const line = fm.keyLines[key];
    if (/(^|[\s,\[])(\*|Bash\(\*\)|Bash\(:\*\)|Bash)([\s,\]]|$)/.test(value) || /Bash\(\s*\*\s*\)/.test(value)) {
      ctx.add({
        ruleId: "perm-wildcard", severity: "high", category: "security", line,
        title: "Unrestricted tool access", message: `${key} grants every shell command without a prompt. Scope it to the commands this skill needs.`,
        snippet: ctx.lines[line - 1],
        fix: { title: "Narrow to read-only tools", safe: false, description: "Replaces the grant with Read, Grep and Glob. Add specific Bash(...) patterns if needed.", edits: [{ line, op: "replace", text: `${key}: Read, Grep, Glob` }] },
      });
    }
  }
}
