import { CATEGORIES, SEVERITIES, type Category, type FileReport, type Finding, type Report, type Severity } from "./types";

export const PENALTY: Record<Severity, number> = { critical: 28, high: 14, medium: 6, low: 2, info: 0 };

export function scoreFindings(findings: Finding[], scale = 1): number {
  const sum = findings.reduce((a, f) => a + PENALTY[f.severity], 0);
  return Math.max(0, Math.round(100 * Math.exp(-sum / (45 * scale))));
}

export function gradeFor(score: number): string {
  if (score >= 95) return "A+";
  if (score >= 88) return "A";
  if (score >= 78) return "B";
  if (score >= 62) return "C";
  if (score >= 40) return "D";
  return "F";
}

export function buildReport(files: FileReport[], now = new Date()): Report {
  const findings = files.flatMap((f) => f.findings);
  const bySeverity = Object.fromEntries(SEVERITIES.map((s) => [s, 0])) as Record<Severity, number>;
  const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
  for (const f of findings) {
    bySeverity[f.severity]++;
    byCategory[f.category]++;
  }
  const scale = Math.sqrt(Math.max(1, files.length));
  const categoryScores = Object.fromEntries(
    CATEGORIES.map((c) => [c, scoreFindings(findings.filter((f) => f.category === c), scale)]),
  ) as Record<Category, number>;
  const fileScores = files.map((f) => f.score);
  const mean = fileScores.length ? fileScores.reduce((a, b) => a + b, 0) / fileScores.length : 100;
  const min = fileScores.length ? Math.min(...fileScores) : 100;
  const score = Math.round(0.6 * mean + 0.4 * min);
  return {
    files, findings, score, grade: gradeFor(score), categoryScores, bySeverity, byCategory,
    tokens: files.reduce((a, f) => a + f.tokens, 0), generatedAt: now.toISOString(),
  };
}
