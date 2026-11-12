import { animate } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";

export interface ActionState {
  busy: boolean;
  error: string | null;
  run: () => Promise<void>;
  retry: () => Promise<void>;
  clear: () => void;
}

/**
 * Wraps an async action with a double-click guard, a busy flag and a retryable error.
 * Calls made while busy are ignored.
 */
export function useAction(fn: () => Promise<void> | void): ActionState {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const run = useCallback(async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      await fnRef.current();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }, []);
  return { busy, error, run, retry: run, clear: () => setError(null) };
}

export function useCountUp(value: number, ms = 900): number {
  const [shown, setShown] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const c = animate(prev.current, value, {
      duration: ms / 1000,
      ease: "easeOut",
      onUpdate: (v) => setShown(Math.round(v)),
      onComplete: () => { prev.current = value; },
    });
    return () => { prev.current = value; c.stop(); };
  }, [value, ms]);
  return shown;
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function download(name: string, text: string, mime = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand("copy");
  ta.remove();
  if (!ok) throw new Error("Copy is blocked by this browser");
}
