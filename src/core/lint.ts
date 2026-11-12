import { contextRules } from "./rules/context";
import { frontmatterRules } from "./rules/frontmatter";
import { injectionRules } from "./rules/injection";
import { mcpRules } from "./rules/mcp";
import { permissionRules } from "./rules/permissions";
import { pluginRules } from "./rules/plugin";
import { buildReport, scoreFindings } from "./score";
import { estimateTokens } from "./tokens";
import type { FileKind, FileReport, Finding, InputFile, Report, RuleContext, Severity } from "./types";

const ORDER: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

export function detectKind(file: InputFile): FileKind {
  const p = file.path.replace(/\\/g, "/");
  const base = p.split("/").pop() ?? p;
  if (/^skill\.md$/i.test(base)) return "skill";
  if (/^(claude|agents|gemini|copilot-instructions)\.md$/i.test(base) || /^\.cursorrules$/.test(base) || /\.mdc$/.test(base)) return "agent-md";
  if (/^\.?mcp\.json$/i.test(base) || /claude_desktop_config\.json$/i.test(base) || /(^|\/)\.cursor\/mcp\.json$/.test(p)) return "mcp";
  if (/^(plugin|marketplace)\.json$/i.test(base)) return "plugin";
  if (base.endsWith(".json")) {
    try {
      const d = JSON.parse(file.content);
      if (d && (d.mcpServers || d.servers)) return "mcp";
      if (d && d.hooks && d.name) return "plugin";
    } catch {
      if (/mcpServers/.test(file.content)) return "mcp";
    }
    return "unknown";
  }
  if (base.endsWith(".md")) return /^\s*---\s*\n/.test(file.content) ? "skill" : "agent-md";
  return "unknown";
}

export function lintFile(file: InputFile): FileReport {
  const kind = detectKind(file);
  const lines = file.content.split(/\r?\n/);
  const findings: Finding[] = [];
  let n = 0;
  const ctx: RuleContext = {
    file, kind, lines,
    add: (f) => {
      const ruleId = f.ruleId ?? "rule";
      findings.push({ ...f, ruleId, file: file.path, id: `${file.path}#${ruleId}#${f.line ?? 0}#${n++}` });
    },
  };
  if (kind !== "unknown") {
    for (const rule of [frontmatterRules, permissionRules, injectionRules, contextRules, mcpRules, pluginRules]) rule(ctx);
  }
  findings.sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || (a.line ?? 0) - (b.line ?? 0));
  return { path: file.path, kind, tokens: estimateTokens(file.content), lines: lines.length, score: scoreFindings(findings), findings };
}

export function lint(files: InputFile[]): Report {
  return buildReport(files.map(lintFile));
}
