import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import {
  CATEGORIES, SEVERITIES, applyEdits, lineDiff, lintFile, parseFrontmatter, estimateTokens,
  type Category, type Finding, type InputFile, type Report, type Severity,
} from "@core/index";
import { copyText, download, useAction } from "../hooks";
import { CategoryBars, ContextBars, FileScoreBars, Heatmap, Radar, ScoreRing, SeverityDonut, scoreColor, shortPath } from "./Charts";
import { Button, ErrorBanner, SEV_COLORS, SevBadge } from "./ui";

export interface TabProps {
  report: Report;
  files: InputFile[];
  originals: Record<string, string>;
  setContent: (path: string, content: string) => void;
  applyFindings: (list: Finding[]) => Promise<void>;
}

const fadeUp = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.35 } };

export function Overview({ report, applyFindings }: TabProps) {
  const safe = report.findings.filter((f) => f.fix?.safe);
  const all = report.findings.filter((f) => f.fix);
  const safeAction = useAction(() => applyFindings(safe));
  const allAction = useAction(() => applyFindings(all));
  const worst = [...report.files].sort((a, b) => a.score - b.score)[0];
  const crit = report.bySeverity.critical;
  return (
    <div className="grid">
      <motion.div className="card hero-card span2" {...fadeUp}>
        <ScoreRing score={report.score} grade={report.grade} />
        <div className="hero-copy">
          <h2>{crit > 0 ? `${crit} critical issue${crit > 1 ? "s" : ""} need attention` : report.findings.length ? "No critical issues" : "Clean scan"}</h2>
          <p className="muted">
            {report.files.length} files, about {report.tokens.toLocaleString("en-US")} tokens, {report.findings.length} findings.
            {worst && report.files.length > 1 && <> Weakest file: <b>{shortPath(worst.path)}</b> ({worst.score}).</>}
          </p>
          <div className="row wrap">
            <Button className="primary" busy={safeAction.busy} disabled={!safe.length} onClick={safeAction.run}>
              Apply {safe.length} safe fix{safe.length === 1 ? "" : "es"}
            </Button>
            <Button busy={allAction.busy} disabled={!all.length} onClick={allAction.run} title="Includes fixes that need review">
              Apply all {all.length} suggestions
            </Button>
          </div>
          {(safeAction.error || allAction.error) && <ErrorBanner message={(safeAction.error || allAction.error)!} onRetry={safe.length ? safeAction.retry : allAction.retry} />}
        </div>
      </motion.div>
      <motion.div className="card" {...fadeUp} transition={{ delay: 0.05 }}><h3>Category scores</h3><Radar scores={report.categoryScores} /></motion.div>
      <motion.div className="card" {...fadeUp} transition={{ delay: 0.1 }}><h3>By severity</h3><SeverityDonut data={report.bySeverity} /></motion.div>
      <motion.div className="card" {...fadeUp} transition={{ delay: 0.15 }}><h3>Findings by category</h3><CategoryBars byCategory={report.byCategory} /></motion.div>
      <motion.div className="card" {...fadeUp} transition={{ delay: 0.2 }}><h3>File scores</h3><FileScoreBars files={report.files} /></motion.div>
      <motion.div className="card span2" {...fadeUp} transition={{ delay: 0.25 }}><h3>Where the problems are</h3><Heatmap files={report.files} /></motion.div>
    </div>
  );
}

export function Findings({ report, applyFindings }: TabProps) {
  const [sev, setSev] = useState<Severity | "all">("all");
  const [cat, setCat] = useState<Category | "all">("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const list = useMemo(() => report.findings.filter((f) => (sev === "all" || f.severity === sev) && (cat === "all" || f.category === cat) && (!q || (f.title + f.message + f.file + (f.snippet ?? "")).toLowerCase().includes(q.toLowerCase()))), [report, sev, cat, q]);
  return (
    <div>
      <div className="filters">
        <div className="chips">
          <button className={`chip ${sev === "all" ? "on" : ""}`} onClick={() => setSev("all")}>All {report.findings.length}</button>
          {SEVERITIES.map((s) => (
            <button key={s} className={`chip ${sev === s ? "on" : ""}`} style={sev === s ? { borderColor: SEV_COLORS[s], color: SEV_COLORS[s] } : undefined} onClick={() => setSev(sev === s ? "all" : s)}>
              <i style={{ background: SEV_COLORS[s] }} />{s} {report.bySeverity[s]}
            </button>
          ))}
        </div>
        <div className="row">
          <select className="input" value={cat} onChange={(e) => setCat(e.target.value as Category | "all")} aria-label="Category filter">
            <option value="all">All categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input className="input" placeholder="Search findings" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search findings" />
        </div>
      </div>
      {list.length === 0 && <div className="card empty">No findings match these filters.<br /><button className="btn small" onClick={() => { setSev("all"); setCat("all"); setQ(""); }}>Reset filters</button></div>}
      <AnimatePresence initial={false}>
        {list.map((f, i) => (
          <motion.div layout key={f.id} className="finding" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ delay: Math.min(i, 12) * 0.025 }}>
            <button className="finding-head" onClick={() => setOpen(open === f.id ? null : f.id)} aria-expanded={open === f.id}>
              <span className="sev-bar" style={{ background: SEV_COLORS[f.severity] }} />
              <span className="finding-title">{f.title}</span>
              <SevBadge s={f.severity} />
              <span className="muted small mono loc">{shortPath(f.file)}{f.line ? `:${f.line}` : ""}</span>
            </button>
            {open === f.id && (
              <div className="finding-body">
                <p>{f.message}</p>
                {f.snippet && <pre className="snip">{f.snippet}</pre>}
                <div className="row wrap"><span className="tag">{f.category}</span><span className="tag mono">{f.ruleId}</span>{f.fix && <FixButton f={f} applyFindings={applyFindings} />}</div>
              </div>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function FixButton({ f, applyFindings }: { f: Finding; applyFindings: (l: Finding[]) => Promise<void> }) {
  const a = useAction(() => applyFindings([f]));
  return (
    <>
      <Button className="small primary" busy={a.busy} onClick={a.run}>{f.fix!.title}{f.fix!.safe ? "" : " (review)"}</Button>
      {a.error && <ErrorBanner message={a.error} onRetry={a.retry} />}
    </>
  );
}

export function Context({ report, files }: TabProps) {
  const rows = report.files.map((fr) => {
    const src = files.find((f) => f.path === fr.path)!;
    const fm = fr.kind === "skill" ? parseFrontmatter(src.content.split(/\r?\n/)) : null;
    const meta = fm?.present && fm.closed ? estimateTokens(src.content.split(/\r?\n/).slice(fm.startLine - 1, fm.endLine).join("\n")) : 0;
    return { path: fr.path, meta, body: Math.max(0, fr.tokens - meta) };
  }).sort((a, b) => b.meta + b.body - (a.meta + a.body));
  const meta = rows.reduce((a, r) => a + r.meta, 0);
  const total = report.tokens;
  const pct = (total / 200_000) * 100;
  return (
    <div className="grid">
      <motion.div className="card span2" {...fadeUp}>
        <h3>Estimated tokens per file</h3>
        <ContextBars rows={rows} warn={4000} high={9000} />
        <p className="muted small">Estimate: characters divided by 4. Real tokenizers differ by 10 to 30 percent.</p>
      </motion.div>
      <motion.div className="card" {...fadeUp} transition={{ delay: 0.08 }}>
        <h3>Always-on cost</h3>
        <div className="big-num">{meta.toLocaleString("en-US")}<small> tokens</small></div>
        <p className="muted">Frontmatter of every skill is read at session start, before the user types anything.</p>
      </motion.div>
      <motion.div className="card" {...fadeUp} transition={{ delay: 0.14 }}>
        <h3>Share of a 200k window</h3>
        <div className="big-num" style={{ color: scoreColor(100 - Math.min(100, pct * 8)) }}>{pct.toFixed(1)}<small>%</small></div>
        <div className="bar-track"><motion.div className="bar-fill" initial={{ width: 0 }} animate={{ width: `${Math.min(100, pct)}%` }} transition={{ duration: 0.8 }} /></div>
        <p className="muted">If every file loaded at once ({total.toLocaleString("en-US")} tokens).</p>
      </motion.div>
    </div>
  );
}

export function Fixes({ report, files, applyFindings }: TabProps) {
  const withFix = report.findings.filter((f) => f.fix);
  const safeCount = withFix.filter((f) => f.fix!.safe).length;
  const safeAction = useAction(() => applyFindings(withFix.filter((f) => f.fix!.safe)));
  if (!withFix.length) return <div className="card empty">No auto-fixes to suggest. Either the files are clean or the remaining findings need a human decision.</div>;
  return (
    <div>
      <div className="row between wrap fixes-head">
        <p className="muted">{withFix.length} suggested fixes. <b>Safe</b> ones are mechanical. <b>Review</b> ones delete or rewrite content, so read the diff first.</p>
        <Button className="primary" busy={safeAction.busy} disabled={!safeCount} onClick={safeAction.run}>Apply {safeCount} safe</Button>
      </div>
      {safeAction.error && <ErrorBanner message={safeAction.error} onRetry={safeAction.retry} />}
      {withFix.map((f, i) => <FixCard key={f.id} f={f} src={files.find((x) => x.path === f.file)!} applyFindings={applyFindings} i={i} />)}
    </div>
  );
}

function FixCard({ f, src, applyFindings, i }: { f: Finding; src: InputFile; applyFindings: (l: Finding[]) => Promise<void>; i: number }) {
  const a = useAction(() => applyFindings([f]));
  const rows = useMemo(() => {
    const after = applyEdits(src.content, f.fix!.edits);
    const diff = lineDiff(src.content, after);
    const keep = new Set<number>();
    diff.forEach((r, idx) => { if (r.kind !== "ctx") for (let k = idx - 1; k <= idx + 1; k++) keep.add(k); });
    return diff.filter((_, idx) => keep.has(idx)).slice(0, 14);
  }, [src.content, f]);
  return (
    <motion.div className="card fix-card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.04 }}>
      <div className="row between wrap">
        <div>
          <div className="row wrap"><SevBadge s={f.severity} /><b>{f.fix!.title}</b><span className={`tag ${f.fix!.safe ? "safe" : "review"}`}>{f.fix!.safe ? "safe" : "review"}</span></div>
          <p className="muted small">{f.title} in <span className="mono">{shortPath(f.file)}{f.line ? `:${f.line}` : ""}</span>. {f.fix!.description}</p>
        </div>
        <Button className="small primary" busy={a.busy} onClick={a.run}>Apply</Button>
      </div>
      <pre className="diff">
        {rows.map((r, k) => <div key={k} className={`d-${r.kind}`}><span>{r.kind === "add" ? "+" : r.kind === "del" ? "-" : " "}</span>{r.text || " "}</div>)}
      </pre>
      {a.error && <ErrorBanner message={a.error} onRetry={a.retry} />}
    </motion.div>
  );
}

export function Editor({ files, originals, setContent }: TabProps) {
  const [path, setPath] = useState(files[0]?.path ?? "");
  const current = files.find((f) => f.path === path) ?? files[0];
  const live = useMemo(() => (current ? lintFile(current) : null), [current]);
  const [msg, setMsg] = useState<string | null>(null);
  const copy = useAction(async () => { await copyText(current.content); setMsg("Copied"); setTimeout(() => setMsg(null), 1500); });
  if (!current || !live) return <div className="card empty">No files loaded.</div>;
  const dirty = originals[current.path] !== current.content;
  return (
    <div className="editor">
      <div className="chips scroll">
        {files.map((f) => (
          <button key={f.path} className={`chip ${f.path === current.path ? "on" : ""}`} onClick={() => setPath(f.path)}>{shortPath(f.path)}</button>
        ))}
      </div>
      <div className="editor-grid">
        <div className="card">
          <div className="row between wrap">
            <span className="mono small">{current.path}</span>
            <div className="row wrap">
              <b style={{ color: scoreColor(live.score) }}>{live.score}/100</b>
              <Button className="small" disabled={!dirty} onClick={() => setContent(current.path, originals[current.path])}>Reset</Button>
              <Button className="small" busy={copy.busy} onClick={copy.run}>{msg ?? "Copy"}</Button>
              <Button className="small" onClick={() => download(current.path.split("/").pop() || "file.txt", current.content)}>Download</Button>
            </div>
          </div>
          {copy.error && <ErrorBanner message={copy.error} onRetry={copy.retry} />}
          <textarea className="input mono editor-area" spellCheck={false} value={current.content} onChange={(e) => setContent(current.path, e.target.value)} aria-label={`Edit ${current.path}`} />
          <p className="muted small">Edits re-scan instantly. Changes stay in this tab only.</p>
        </div>
        <div className="card">
          <h3>{live.findings.length} finding{live.findings.length === 1 ? "" : "s"} in this file</h3>
          {live.findings.length === 0 && <p className="ok-note">All clear.</p>}
          <div className="mini-list">
            {live.findings.map((f) => (
              <div key={f.id} className="mini"><span className="sev-dot" style={{ background: SEV_COLORS[f.severity] }} /><span>{f.title}</span><span className="muted mono small">{f.line ? `L${f.line}` : ""}</span></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
