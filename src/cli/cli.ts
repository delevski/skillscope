import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve, basename } from "node:path";
import { applyFixes, lint, lineDiff, type Finding, type InputFile, type Report, type Severity } from "../core/index";
import { SAMPLE_FILES } from "../core/samples";

const VERSION = "0.1.0";
const C = process.stdout.isTTY && !process.env.NO_COLOR
  ? { r: "\x1b[31m", y: "\x1b[33m", g: "\x1b[32m", b: "\x1b[34m", m: "\x1b[35m", d: "\x1b[2m", B: "\x1b[1m", x: "\x1b[0m" }
  : { r: "", y: "", g: "", b: "", m: "", d: "", B: "", x: "" };
const SEV_COLOR: Record<Severity, string> = { critical: C.r, high: C.r, medium: C.y, low: C.b, info: C.d };
const SKIP = new Set(["node_modules", ".git", "dist", "build", ".next"]);
const MATCH = /(^skill\.md$|^claude\.md$|^agents\.md$|^gemini\.md$|^\.cursorrules$|\.mdc$|^\.?mcp\.json$|claude_desktop_config\.json$|^plugin\.json$|^marketplace\.json$)/i;

const HELP = `skillscope ${VERSION}
Lint agent skills, plugins and MCP configs.

Usage
  skillscope [paths...] [options]

Options
  --json              print the full report as JSON
  --fix               apply safe auto-fixes in place
  --fix-all           apply every suggested fix (review the diff first)
  --dry-run           with --fix, print the diff and change nothing
  --fail-on <level>   exit 1 at or above: critical | high | medium | low (default: high)
  --demo              lint the built-in fictional sample files
  --write-demo <dir>  write the fictional samples to a folder and exit
  -v, --version       print version
  -h, --help          show this help

Live report: https://delevski.github.io/skillscope/
`;

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (MATCH.test(name) || /(^|\/)\.claude-plugin\/plugin\.json$/.test(full.replace(/\\/g, "/"))) out.push(full);
  }
}

function collect(paths: string[]): InputFile[] {
  const found: string[] = [];
  for (const p of paths) {
    const abs = resolve(p);
    const st = statSync(abs);
    if (st.isDirectory()) walk(abs, found);
    else found.push(abs);
  }
  const cwd = process.cwd();
  return found.map((f) => ({ path: relative(cwd, f) || basename(f), content: readFileSync(f, "utf8") }));
}

function printReport(r: Report): void {
  for (const f of r.files) {
    const col = f.score >= 85 ? C.g : f.score >= 60 ? C.y : C.r;
    console.log(`\n${C.B}${f.path}${C.x} ${C.d}(${f.kind}, ~${f.tokens} tokens)${C.x}  ${col}${f.score}/100${C.x}`);
    if (!f.findings.length) console.log(`  ${C.g}no issues${C.x}`);
    for (const x of f.findings) {
      console.log(`  ${SEV_COLOR[x.severity]}${x.severity.padEnd(8)}${C.x} ${x.line ? `L${x.line}`.padEnd(5) : "     "} ${x.title} ${C.d}[${x.ruleId}]${C.x}`);
      if (x.snippet) console.log(`           ${C.d}${x.snippet}${C.x}`);
      if (x.fix) console.log(`           ${C.m}fix${x.fix.safe ? " (safe)" : ""}: ${x.fix.title}${C.x}`);
    }
  }
  const s = r.bySeverity;
  console.log(`\n${C.B}Score ${r.score}/100 (${r.grade})${C.x}  ${r.files.length} files, ~${r.tokens} tokens`);
  console.log(`${s.critical} critical, ${s.high} high, ${s.medium} medium, ${s.low} low, ${s.info} info`);
}

function main(): number {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith("-")));
  const failIdx = args.indexOf("--fail-on");
  const failOn = (failIdx >= 0 ? args[failIdx + 1] : "high") as Severity;
  const wdIdx = args.indexOf("--write-demo");
  const skip = new Set([failIdx + 1, wdIdx + 1].filter((n) => n > 0));
  const paths = args.filter((a, i) => !a.startsWith("-") && !skip.has(i));

  if (flags.has("-h") || flags.has("--help")) { console.log(HELP); return 0; }
  if (flags.has("-v") || flags.has("--version")) { console.log(VERSION); return 0; }
  if (wdIdx >= 0) {
    const dir = resolve(args[wdIdx + 1] ?? "skillscope-demo");
    for (const f of SAMPLE_FILES) {
      const target = join(dir, f.path);
      mkdirSync(join(target, ".."), { recursive: true });
      writeFileSync(target, f.content);
    }
    console.log(`Wrote ${SAMPLE_FILES.length} fictional sample files to ${dir}`);
    return 0;
  }

  let files: InputFile[];
  try {
    files = flags.has("--demo") ? SAMPLE_FILES : collect(paths.length ? paths : ["."]);
  } catch (e) {
    console.error(`skillscope: ${(e as Error).message}`);
    return 2;
  }
  if (!files.length) { console.error("skillscope: no SKILL.md, MCP or plugin files found"); return 2; }

  let report = lint(files);
  if (flags.has("--fix") || flags.has("--fix-all")) {
    const safeOnly = !flags.has("--fix-all");
    let total = 0;
    for (const fr of report.files) {
      const src = files.find((f) => f.path === fr.path)!;
      const { content, applied } = applyFixes(src.content, fr.findings as Finding[], { safeOnly });
      if (!applied || content === src.content) continue;
      total += applied;
      if (flags.has("--dry-run") || flags.has("--demo")) {
        console.log(`\n${C.B}${fr.path}${C.x}`);
        for (const row of lineDiff(src.content, content)) {
          if (row.kind === "add") console.log(`${C.g}+ ${row.text}${C.x}`);
          else if (row.kind === "del") console.log(`${C.r}- ${row.text}${C.x}`);
        }
      } else writeFileSync(resolve(fr.path), content);
    }
    console.log(`\n${total} fix${total === 1 ? "" : "es"} ${flags.has("--dry-run") || flags.has("--demo") ? "previewed" : "applied"}`);
    if (!flags.has("--dry-run") && !flags.has("--demo")) report = lint(collect(paths.length ? paths : ["."]));
  }

  if (flags.has("--json")) console.log(JSON.stringify(report, null, 2));
  else printReport(report);

  const rank: Severity[] = ["critical", "high", "medium", "low"];
  const limit = rank.indexOf(failOn);
  const bad = report.findings.some((f) => rank.indexOf(f.severity) !== -1 && rank.indexOf(f.severity) <= (limit === -1 ? 1 : limit));
  return bad ? 1 : 0;
}

process.exit(main());
