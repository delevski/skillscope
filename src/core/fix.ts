import type { Edit, Finding } from "./types";

/** Apply edits to text. Edits are applied bottom-up so line numbers stay valid. */
export function applyEdits(content: string, edits: Edit[]): string {
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const lines = content.split(/\r?\n/);
  const seen = new Set<string>();
  const sorted = [...edits]
    .filter((e) => {
      const k = `${e.line}:${e.op}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => b.line - a.line);
  for (const e of sorted) {
    const idx = Math.max(0, Math.min(lines.length, e.line - 1));
    if (e.op === "delete") lines.splice(idx, 1);
    else if (e.op === "replace") lines.splice(idx, 1, e.text ?? "");
    else lines.splice(idx, 0, ...(e.text ?? "").split("\n"));
  }
  return lines.join(eol);
}

export function applyFixes(content: string, findings: Finding[], opts: { safeOnly?: boolean } = {}): { content: string; applied: number } {
  const usable = findings.filter((f) => f.fix && (!opts.safeOnly || f.fix.safe));
  const edits = usable.flatMap((f) => f.fix!.edits);
  return { content: edits.length ? applyEdits(content, edits) : content, applied: usable.length };
}

/** Tiny line diff for display: returns rows of kind ctx, add or del. */
export interface DiffRow { kind: "ctx" | "add" | "del"; text: string; line: number }
export function lineDiff(before: string, after: string): DiffRow[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const n = a.length, m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const rows: DiffRow[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { rows.push({ kind: "ctx", text: a[i], line: i + 1 }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { rows.push({ kind: "del", text: a[i], line: i + 1 }); i++; }
    else { rows.push({ kind: "add", text: b[j], line: j + 1 }); j++; }
  }
  while (i < n) rows.push({ kind: "del", text: a[i], line: ++i });
  while (j < m) rows.push({ kind: "add", text: b[j], line: ++j });
  return rows;
}
