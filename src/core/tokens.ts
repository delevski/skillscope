/** Rough token estimate. Real tokenizers differ, so the UI labels this as an estimate. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}
