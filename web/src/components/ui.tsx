import { motion } from "framer-motion";
import type { ReactNode } from "react";
import type { Severity } from "@core/index";

export const SEV_COLORS: Record<Severity, string> = {
  critical: "#ff4d6d", high: "#ff8a3d", medium: "#ffd23f", low: "#4dabf7", info: "#8b93a7",
};

export function Spinner({ size = 16 }: { size?: number }) {
  return <span className="spinner" style={{ width: size, height: size }} aria-hidden />;
}

export function Button({ busy, children, className = "", disabled, onClick, title }: {
  busy?: boolean; children: ReactNode; className?: string; disabled?: boolean; onClick?: () => void; title?: string;
}) {
  return (
    <button className={`btn ${className}`} disabled={disabled || busy} onClick={onClick} title={title} aria-busy={busy}>
      {busy && <Spinner />}
      <span>{children}</span>
    </button>
  );
}

export function ErrorBanner({ message, onRetry, onDismiss }: { message: string; onRetry?: () => void; onDismiss?: () => void }) {
  return (
    <motion.div className="banner error" role="alert" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
      <span>{message}</span>
      <span className="banner-actions">
        {onRetry && <button className="btn small" onClick={onRetry}>Retry</button>}
        {onDismiss && <button className="btn small ghost" onClick={onDismiss}>Dismiss</button>}
      </span>
    </motion.div>
  );
}

export function SevBadge({ s }: { s: Severity }) {
  return <span className="badge" style={{ color: SEV_COLORS[s], borderColor: SEV_COLORS[s] + "66", background: SEV_COLORS[s] + "18" }}>{s}</span>;
}

export function Skeleton() {
  return (
    <div className="skeleton-wrap" aria-busy aria-label="Loading">
      <div className="sk sk-row" style={{ width: "40%" }} />
      <div className="sk-grid">
        <div className="sk sk-card" /><div className="sk sk-card" /><div className="sk sk-card" />
      </div>
      <div className="sk sk-row" style={{ width: "70%" }} />
      <div className="sk sk-row" style={{ width: "55%" }} />
    </div>
  );
}
