import { AnimatePresence, motion } from "framer-motion";
import { useRef, useState } from "react";
import { SAMPLE_FILES, detectKind, estimateTokens, type InputFile } from "@core/index";
import { fetchRepoFiles } from "../github";
import { useAction } from "../hooks";
import { Button, ErrorBanner } from "./ui";

type Source = "demo" | "paste" | "upload" | "github";
const SOURCES: { id: Source; label: string }[] = [
  { id: "demo", label: "Demo set" }, { id: "paste", label: "Paste" }, { id: "upload", label: "Upload" }, { id: "github", label: "GitHub repo" },
];

export function Intake({ files, setFiles, onAnalyze, analyzing, analyzeError, retryAnalyze }: {
  files: InputFile[]; setFiles: (f: InputFile[]) => void; onAnalyze: () => void; analyzing: boolean; analyzeError: string | null; retryAnalyze: () => void;
}) {
  const [source, setSource] = useState<Source>("demo");
  const [name, setName] = useState("skills/my-skill/SKILL.md");
  const [text, setText] = useState("");
  const [repo, setRepo] = useState("");
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const merge = (incoming: InputFile[]) => {
    const map = new Map(files.map((f) => [f.path, f]));
    incoming.forEach((f) => map.set(f.path, f));
    setFiles([...map.values()]);
  };

  const demo = useAction(async () => { merge(SAMPLE_FILES); });
  const paste = useAction(async () => {
    if (!text.trim()) throw new Error("Paste some file content first.");
    if (!name.trim()) throw new Error("Give the file a path such as skills/foo/SKILL.md.");
    merge([{ path: name.trim(), content: text }]);
    setText("");
  });
  const gh = useAction(async () => {
    if (!repo.trim()) throw new Error("Enter a repo like owner/name.");
    merge(await fetchRepoFiles(repo));
  });
  const readFiles = async (list: FileList | File[]) => {
    const arr = Array.from(list);
    if (!arr.length) return;
    const out: InputFile[] = [];
    for (const f of arr) {
      if (f.size > 2_000_000) throw new Error(`${f.name} is larger than 2 MB.`);
      const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
      out.push({ path: /skill\.md$/i.test(f.name) && !rel.includes("/") ? `skills/${f.name.replace(/\.md$/i, "")}/SKILL.md` : rel, content: await f.text() });
    }
    merge(out);
  };
  const [upErr, setUpErr] = useState<string | null>(null);
  const onFiles = async (list: FileList | File[]) => {
    setUpErr(null);
    try { await readFiles(list); } catch (e) { setUpErr(e instanceof Error ? e.message : String(e)); }
  };

  const err = demo.error || paste.error || gh.error || upErr;
  const dismiss = () => { demo.clear(); paste.clear(); gh.clear(); setUpErr(null); };

  return (
    <div className="card intake">
      <div className="tabs small" role="tablist">
        {SOURCES.map((s) => (
          <button key={s.id} role="tab" aria-selected={source === s.id} className={`tab ${source === s.id ? "on" : ""}`} onClick={() => { setSource(s.id); dismiss(); }}>{s.label}</button>
        ))}
      </div>

      <div className="intake-body">
        {source === "demo" && (
          <div>
            <p className="muted">Seven fictional files from the made-up company Acme: poisoned skills, a leaky MCP config, a bad plugin hook and a bloated notes file. Nothing here is real.</p>
            <Button className="primary" busy={demo.busy} onClick={demo.run}>Load the demo set</Button>
          </div>
        )}
        {source === "paste" && (
          <div className="stack">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} aria-label="File path" placeholder="skills/my-skill/SKILL.md" />
            <textarea className="input mono" rows={8} value={text} onChange={(e) => setText(e.target.value)} aria-label="File content" placeholder={"---\nname: my-skill\ndescription: ...\n---\n"} />
            <Button className="primary" busy={paste.busy} onClick={paste.run}>Add file</Button>
          </div>
        )}
        {source === "upload" && (
          <div
            className={`drop ${dragging ? "on" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); void onFiles(e.dataTransfer.files); }}
          >
            <p>Drop SKILL.md, CLAUDE.md, .mcp.json or plugin.json files here</p>
            <Button className="primary" onClick={() => input.current?.click()}>Choose files</Button>
            <input ref={input} type="file" multiple hidden accept=".md,.mdc,.json,.cursorrules" onChange={(e) => { void onFiles(e.target.files ?? []); e.target.value = ""; }} />
          </div>
        )}
        {source === "github" && (
          <div className="stack">
            <p className="muted">Public repos only. Reads the tree through the GitHub API in your browser. Nothing is sent to any other server.</p>
            <input className="input" value={repo} onChange={(e) => setRepo(e.target.value)} aria-label="GitHub repository" placeholder="owner/repo or https://github.com/owner/repo" onKeyDown={(e) => e.key === "Enter" && gh.run()} />
            <Button className="primary" busy={gh.busy} onClick={gh.run}>Fetch files</Button>
          </div>
        )}
        <AnimatePresence>{err && <ErrorBanner message={err} onRetry={source === "github" ? gh.retry : undefined} onDismiss={dismiss} />}</AnimatePresence>
      </div>

      <div className="staged">
        <div className="staged-head">
          <b>{files.length} file{files.length === 1 ? "" : "s"} ready</b>
          {files.length > 0 && <button className="link" onClick={() => setFiles([])}>Clear all</button>}
        </div>
        <AnimatePresence initial={false}>
          {files.map((f) => (
            <motion.div key={f.path} className="staged-row" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
              <span className="mono path">{f.path}</span>
              <span className="muted small">{detectKind(f)} / ~{estimateTokens(f.content)} tok</span>
              <button className="x" aria-label={`Remove ${f.path}`} onClick={() => setFiles(files.filter((x) => x.path !== f.path))}>x</button>
            </motion.div>
          ))}
        </AnimatePresence>
        {files.length === 0 && <p className="muted">Nothing yet. Pick a source above.</p>}
      </div>

      {analyzeError && <ErrorBanner message={analyzeError} onRetry={retryAnalyze} />}
      <Button className="primary big" busy={analyzing} disabled={files.length === 0} onClick={onAnalyze}>
        {analyzing ? "Analyzing..." : files.length ? `Analyze ${files.length} file${files.length === 1 ? "" : "s"}` : "Add files to analyze"}
      </Button>
    </div>
  );
}
