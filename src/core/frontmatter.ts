export interface FrontmatterResult {
  present: boolean;
  closed: boolean;
  /** 1-based line of the opening --- */
  startLine: number;
  /** 1-based line of the closing --- (0 when not closed) */
  endLine: number;
  data: Record<string, string | string[]>;
  /** 1-based line where each key was declared */
  keyLines: Record<string, number>;
  problems: { line: number; message: string }[];
}

const KEY_RE = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/;

export function parseFrontmatter(lines: string[]): FrontmatterResult {
  const res: FrontmatterResult = {
    present: false,
    closed: false,
    startLine: 0,
    endLine: 0,
    data: {},
    keyLines: {},
    problems: [],
  };
  let first = 0;
  while (first < lines.length && lines[first].trim() === "") first++;
  if (first >= lines.length || lines[first].trim() !== "---") return res;
  res.present = true;
  res.startLine = first + 1;
  let end = -1;
  for (let i = first + 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      end = i;
      break;
    }
  }
  const stop = end === -1 ? Math.min(lines.length, first + 40) : end;
  if (end !== -1) {
    res.closed = true;
    res.endLine = end + 1;
  }
  let currentKey: string | null = null;
  for (let i = first + 1; i < stop; i++) {
    const raw = lines[i];
    const ln = i + 1;
    if (raw.trim() === "" || raw.trim().startsWith("#")) continue;
    if (/\t/.test(raw.slice(0, raw.length - raw.trimStart().length))) {
      res.problems.push({ line: ln, message: "Tab indentation is not valid YAML" });
    }
    const m = KEY_RE.exec(raw);
    if (m && !raw.startsWith(" ") && !raw.startsWith("\t")) {
      const [, key, valueRaw] = m;
      const value = valueRaw.trim();
      currentKey = key;
      if (key in res.data) res.problems.push({ line: ln, message: `Duplicate key "${key}"` });
      res.keyLines[key] = ln;
      if (value === ">" || value === "|" || value === ">-" || value === "|-") res.data[key] = "";
      else if (value === "") res.data[key] = "";
      else res.data[key] = stripQuotes(value, ln, res.problems);
      continue;
    }
    if (currentKey && (raw.startsWith(" ") || raw.startsWith("\t") || raw.trimStart().startsWith("- "))) {
      const t = raw.trim();
      const cur = res.data[currentKey];
      if (t.startsWith("- ")) {
        const arr = Array.isArray(cur) ? cur : cur ? [cur] : [];
        arr.push(t.slice(2).trim());
        res.data[currentKey] = arr;
      } else {
        res.data[currentKey] = (Array.isArray(cur) ? cur.join(" ") : cur) + (cur ? " " : "") + t;
      }
      continue;
    }
    res.problems.push({ line: ln, message: `Line is not a valid "key: value" pair: ${truncate(raw.trim(), 50)}` });
  }
  return res;
}

function stripQuotes(v: string, ln: number, problems: { line: number; message: string }[]): string {
  if ((v.startsWith('"') && !v.endsWith('"')) || (v.startsWith("'") && !v.endsWith("'")) || v === '"' || v === "'") {
    problems.push({ line: ln, message: "Unterminated quoted string" });
    return v.slice(1);
  }
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  return v;
}

export function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "..." : s;
}
