import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { lint, applyEdits, type Finding, type InputFile } from "@core/index";
import { Intake } from "./components/Intake";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Context, Editor, Findings, Fixes, Overview, type TabProps } from "./components/Tabs";
import { Button, ErrorBanner, Skeleton, Spinner } from "./components/ui";
import { download, sleep, useAction } from "./hooks";
import { toMarkdown } from "./export";

type Tab = "overview" | "findings" | "context" | "fixes" | "editor";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" }, { id: "findings", label: "Findings" }, { id: "context", label: "Context" }, { id: "fixes", label: "Fixes" }, { id: "editor", label: "Live editor" },
];
const STEPS = ["Parsing files", "Scanning for prompt injection", "Measuring context weight", "Checking frontmatter and configs", "Scoring"];

export default function App() {
  const [files, setFiles] = useState<InputFile[]>([]);
  const [originals, setOriginals] = useState<Record<string, string>>({});
  const [stage, setStage] = useState<"intake" | "results">("intake");
  const [tab, setTab] = useState<Tab>("overview");
  const [tabBusy, setTabBusy] = useState(false);
  const [step, setStep] = useState(-1);
  const [toast, setToast] = useState<string | null>(null);

  const report = useMemo(() => (stage === "results" ? lint(files) : null), [files, stage]);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast((t) => (t === m ? null : t)), 3200); };

  const analyze = useAction(async () => {
    if (!files.length) throw new Error("Add at least one file first.");
    setStep(0);
    for (let i = 0; i < STEPS.length; i++) { setStep(i); await sleep(340); }
    const r = lint(files);
    if (!r.files.length) throw new Error("Nothing could be analyzed.");
    setOriginals(Object.fromEntries(files.map((f) => [f.path, f.content])));
    setTab("overview");
    setStage("results");
    setStep(-1);
  });
  const analyzeRun = async () => { await analyze.run(); setStep(-1); };

  const switchTab = async (t: Tab) => {
    if (tabBusy || t === tab) return;
    setTabBusy(true);
    await sleep(380);
    setTab(t);
    setTabBusy(false);
  };

  const setContent = (path: string, content: string) => setFiles((fs) => fs.map((f) => (f.path === path ? { ...f, content } : f)));

  const applyFindings = async (list: Finding[]) => {
    if (!report) return;
    const withFix = list.filter((f) => f.fix);
    if (!withFix.length) throw new Error("Those findings have no automatic fix.");
    await sleep(450);
    const before = report.score;
    const byFile = new Map<string, Finding[]>();
    withFix.forEach((f) => byFile.set(f.file, [...(byFile.get(f.file) ?? []), f]));
    const next = files.map((f) => (byFile.has(f.path) ? { ...f, content: applyEdits(f.content, byFile.get(f.path)!.flatMap((x) => x.fix!.edits)) } : f));
    const after = lint(next).score;
    setFiles(next);
    flash(`Applied ${withFix.length} fix${withFix.length === 1 ? "" : "es"}. Score ${before} to ${after}.`);
  };

  const exportJson = useAction(async () => { if (report) download("skillscope-report.json", JSON.stringify(report, null, 2), "application/json"); });
  const exportMd = useAction(async () => { if (report) download("skillscope-report.md", toMarkdown(report), "text/markdown"); });

  const props: TabProps | null = report ? { report, files, originals, setContent, applyFindings } : null;

  return (
    <div className="shell">
      <div className="aurora" aria-hidden />
      <header className="top">
        <div className="brand">
          <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden><rect width="32" height="32" rx="8" fill="#7c5cff" /><circle cx="16" cy="16" r="8" fill="none" stroke="#fff" strokeWidth="3" /><circle cx="16" cy="16" r="2.5" fill="#22d3a6" /></svg>
          <span>SkillScope</span>
        </div>
        <nav className="top-links">
          {stage === "results" && <Button className="small" onClick={() => { setStage("intake"); }}>New scan</Button>}
          <a className="btn small ghost" href="https://github.com/delevski/skillscope" target="_blank" rel="noreferrer">GitHub</a>
        </nav>
      </header>

      <main className="main">
        <AnimatePresence mode="wait">
          {stage === "intake" && (
            <motion.section key="intake" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <div className="hero">
                <span className="pill">Lint for agent skills</span>
                <h1>Catch the bad stuff in your agent skills <span className="grad">before your agent does.</span></h1>
                <p className="lead">Scans SKILL.md, plugin manifests and MCP configs for prompt injection, hidden characters, leaked secrets, context bloat and broken frontmatter. Fix it with one click.</p>
                <code className="install">npx github:delevski/skillscope ./skills</code>
              </div>
              <Intake files={files} setFiles={setFiles} onAnalyze={analyzeRun} analyzing={analyze.busy} analyzeError={analyze.error} retryAnalyze={analyzeRun} />
              <p className="fine">Everything runs in your browser. Demo data is fictional. Token counts are estimates.</p>
            </motion.section>
          )}

          {stage === "results" && props && report && (
            <motion.section key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="results-head">
                <div className="tabs" role="tablist">
                  {TABS.map((t) => (
                    <button key={t.id} role="tab" aria-selected={tab === t.id} className={`tab ${tab === t.id ? "on" : ""}`} onClick={() => switchTab(t.id)}>
                      {tab === t.id && <motion.span layoutId="tabpill" className="tab-pill" />}
                      <span className="tab-label">{t.label}{t.id === "findings" ? ` ${report.findings.length}` : ""}</span>
                    </button>
                  ))}
                </div>
                <div className="row wrap">
                  <Button className="small" busy={exportMd.busy} onClick={exportMd.run}>Markdown</Button>
                  <Button className="small" busy={exportJson.busy} onClick={exportJson.run}>JSON</Button>
                </div>
              </div>
              {(exportMd.error || exportJson.error) && <ErrorBanner message={(exportMd.error || exportJson.error)!} onRetry={exportMd.error ? exportMd.retry : exportJson.retry} />}
              <div className="tab-panel">
                {tabBusy ? <Skeleton /> : (
                  <ErrorBoundary label="This tab" key={tab}>
                    {tab === "overview" && <Overview {...props} />}
                    {tab === "findings" && <Findings {...props} />}
                    {tab === "context" && <Context {...props} />}
                    {tab === "fixes" && <Fixes {...props} />}
                    {tab === "editor" && <Editor {...props} />}
                  </ErrorBoundary>
                )}
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {analyze.busy && step >= 0 && (
          <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="status" aria-live="polite">
            <div className="overlay-card">
              <div className="scan-ring"><Spinner size={44} /></div>
              <h3>Scanning {files.length} file{files.length === 1 ? "" : "s"}</h3>
              <ul className="steps">
                {STEPS.map((s, i) => (
                  <li key={s} className={i < step ? "done" : i === step ? "now" : ""}>
                    <span className="dot">{i < step ? "✓" : ""}</span>{s}
                  </li>
                ))}
              </ul>
              <div className="progress"><motion.div initial={{ width: 0 }} animate={{ width: `${((step + 1) / STEPS.length) * 100}%` }} /></div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && <motion.div className="toast" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} role="status">{toast}</motion.div>}
      </AnimatePresence>
    </div>
  );
}
