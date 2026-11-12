import type { Report } from "@core/index";

export function toMarkdown(r: Report): string {
  const out: string[] = [];
  out.push(`# SkillScope report`, "", `Score: **${r.score}/100 (${r.grade})** across ${r.files.length} files, about ${r.tokens} tokens.`, "");
  out.push(`| Severity | Count |`, `| --- | --- |`);
  (["critical", "high", "medium", "low", "info"] as const).forEach((s) => out.push(`| ${s} | ${r.bySeverity[s]} |`));
  for (const f of r.files) {
    out.push("", `## ${f.path} (${f.score}/100)`, "");
    if (!f.findings.length) out.push("No issues.");
    for (const x of f.findings) out.push(`- **${x.severity}** ${x.line ? `L${x.line} ` : ""}${x.title}: ${x.message}${x.fix ? ` Fix: ${x.fix.title}.` : ""}`);
  }
  return out.join("\n") + "\n";
}
