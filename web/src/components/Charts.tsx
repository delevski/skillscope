import { motion } from "framer-motion";
import { CATEGORIES, SEVERITIES, type Category, type FileReport, type Report } from "@core/index";
import { useCountUp } from "../hooks";
import { SEV_COLORS } from "./ui";

export function scoreColor(s: number): string {
  return s >= 88 ? "#22d3a6" : s >= 70 ? "#a3e635" : s >= 50 ? "#ffd23f" : s >= 30 ? "#ff8a3d" : "#ff4d6d";
}

export function ScoreRing({ score, grade, size = 190 }: { score: number; grade: string; size?: number }) {
  const r = size / 2 - 14;
  const c = 2 * Math.PI * r;
  const shown = useCountUp(score);
  const col = scoreColor(score);
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id="ringg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={col} /><stop offset="100%" stopColor="#7c5cff" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="12" />
        <motion.circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#ringg)" strokeWidth="12" strokeLinecap="round"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - score / 100) }}
          transition={{ duration: 1.1, ease: "easeOut" }} transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="ring-text">
        <div className="ring-num" style={{ color: col }}>{shown}</div>
        <div className="ring-sub">Grade {grade}</div>
      </div>
    </div>
  );
}

const CAT_LABEL: Record<Category, string> = { security: "Security", frontmatter: "Frontmatter", context: "Context", config: "Config" };

export function Radar({ scores }: { scores: Record<Category, number> }) {
  const size = 260, cx = size / 2, cy = size / 2, R = 92;
  const pt = (i: number, v: number) => {
    const a = (-90 + i * 90) * (Math.PI / 180);
    return [cx + Math.cos(a) * R * v, cy + Math.sin(a) * R * v] as const;
  };
  const poly = (v: number[]) => v.map((x, i) => pt(i, x).join(",")).join(" ");
  const vals = CATEGORIES.map((c) => scores[c] / 100);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="radar" role="img" aria-label="Category scores radar">
      {[0.25, 0.5, 0.75, 1].map((k) => <polygon key={k} points={poly([k, k, k, k])} fill="none" stroke="rgba(255,255,255,0.09)" />)}
      {CATEGORIES.map((_, i) => { const [x, y] = pt(i, 1); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(255,255,255,0.09)" />; })}
      <motion.polygon
        points={poly(vals)} fill="rgba(124,92,255,0.28)" stroke="#7c5cff" strokeWidth="2"
        initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} style={{ transformOrigin: `${cx}px ${cy}px` }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      />
      {CATEGORIES.map((c, i) => {
        const [x, y] = pt(i, vals[i]);
        const [lx, ly] = pt(i, 1.28);
        return (
          <g key={c}>
            <motion.circle cx={x} cy={y} r="5" fill={scoreColor(scores[c])} initial={{ r: 0 }} animate={{ r: 5 }} transition={{ delay: 0.5 }} />
            <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" className="radar-label">{CAT_LABEL[c]}</text>
            <text x={lx} y={ly + 14} textAnchor="middle" dominantBaseline="middle" className="radar-val" fill={scoreColor(scores[c])}>{scores[c]}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function SeverityDonut({ data }: { data: Report["bySeverity"] }) {
  const total = SEVERITIES.reduce((a, s) => a + data[s], 0);
  const size = 170, r = 62, c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="donut-wrap">
      <svg width={size} height={size} viewBox="0 0 170 170" role="img" aria-label="Findings by severity">
        <circle cx="85" cy="85" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="22" />
        {total > 0 && SEVERITIES.map((s) => {
          const len = (data[s] / total) * c;
          const el = (
            <motion.circle key={s} cx="85" cy="85" r={r} fill="none" stroke={SEV_COLORS[s]} strokeWidth="22"
              strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-acc} transform="rotate(-90 85 85)"
              initial={{ opacity: 0 }} animate={{ opacity: len > 0 ? 1 : 0 }} transition={{ duration: 0.6, delay: acc / c }} />
          );
          acc += len;
          return el;
        })}
        <text x="85" y="82" textAnchor="middle" className="donut-num">{total}</text>
        <text x="85" y="102" textAnchor="middle" className="donut-sub">findings</text>
      </svg>
      <ul className="legend">
        {SEVERITIES.map((s) => (
          <li key={s}><i style={{ background: SEV_COLORS[s] }} />{s}<b>{data[s]}</b></li>
        ))}
      </ul>
    </div>
  );
}

export function CategoryBars({ byCategory }: { byCategory: Report["byCategory"] }) {
  const max = Math.max(1, ...CATEGORIES.map((c) => byCategory[c]));
  return (
    <div className="bars">
      {CATEGORIES.map((c, i) => (
        <div className="bar-row" key={c}>
          <span className="bar-label">{CAT_LABEL[c]}</span>
          <div className="bar-track">
            <motion.div className="bar-fill" initial={{ width: 0 }} animate={{ width: `${(byCategory[c] / max) * 100}%` }} transition={{ duration: 0.7, delay: i * 0.08 }} />
          </div>
          <b>{byCategory[c]}</b>
        </div>
      ))}
    </div>
  );
}

export function Heatmap({ files }: { files: FileReport[] }) {
  const cell = (n: number) => (n === 0 ? "rgba(255,255,255,0.04)" : `rgba(255,${Math.max(60, 180 - n * 30)},${Math.max(90, 120 - n * 12)},${Math.min(0.9, 0.25 + n * 0.15)})`);
  return (
    <div className="heat" role="table" aria-label="Findings per file and category">
      <div className="heat-row heat-head" role="row">
        <span />
        {CATEGORIES.map((c) => <span key={c}>{CAT_LABEL[c]}</span>)}
      </div>
      {files.map((f, r) => (
        <div className="heat-row" role="row" key={f.path}>
          <span className="heat-name" title={f.path}>{shortPath(f.path)}</span>
          {CATEGORIES.map((c, i) => {
            const n = f.findings.filter((x) => x.category === c).length;
            return (
              <motion.span key={c} className="heat-cell" style={{ background: cell(n) }} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: r * 0.05 + i * 0.03 }}>
                {n || ""}
              </motion.span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function shortPath(p: string): string {
  const parts = p.split("/");
  return parts.length > 2 ? parts.slice(-2).join("/") : p;
}

export function FileScoreBars({ files }: { files: FileReport[] }) {
  const sorted = [...files].sort((a, b) => a.score - b.score);
  return (
    <div className="bars">
      {sorted.map((f, i) => (
        <div className="bar-row" key={f.path}>
          <span className="bar-label wide" title={f.path}>{shortPath(f.path)}</span>
          <div className="bar-track">
            <motion.div className="bar-fill" style={{ background: scoreColor(f.score) }} initial={{ width: 0 }} animate={{ width: `${Math.max(3, f.score)}%` }} transition={{ duration: 0.7, delay: i * 0.06 }} />
          </div>
          <b style={{ color: scoreColor(f.score) }}>{f.score}</b>
        </div>
      ))}
    </div>
  );
}

export interface ContextRow { path: string; meta: number; body: number }

export function ContextBars({ rows, warn, high }: { rows: ContextRow[]; warn: number; high: number }) {
  const max = Math.max(high * 1.15, ...rows.map((r) => r.meta + r.body));
  return (
    <div className="ctx">
      {rows.map((r, i) => {
        const total = r.meta + r.body;
        return (
          <div className="ctx-row" key={r.path}>
            <span className="bar-label wide" title={r.path}>{shortPath(r.path)}</span>
            <div className="ctx-track">
              <div className="ctx-mark" style={{ left: `${(warn / max) * 100}%` }} title={`${warn} warn`} />
              <div className="ctx-mark hi" style={{ left: `${(high / max) * 100}%` }} title={`${high} high`} />
              <motion.div className="ctx-seg meta" initial={{ width: 0 }} animate={{ width: `${(r.meta / max) * 100}%` }} transition={{ duration: 0.7, delay: i * 0.06 }} />
              <motion.div className="ctx-seg body" initial={{ width: 0 }} animate={{ width: `${(r.body / max) * 100}%` }} transition={{ duration: 0.7, delay: i * 0.06 + 0.1 }} />
            </div>
            <b>{total.toLocaleString("en-US")}</b>
          </div>
        );
      })}
      <div className="ctx-legend">
        <span><i className="meta" />always loaded (frontmatter)</span>
        <span><i className="body" />loaded on use (body)</span>
        <span><i className="mk" />4k warn</span>
        <span><i className="mk hi" />9k high</span>
      </div>
    </div>
  );
}
