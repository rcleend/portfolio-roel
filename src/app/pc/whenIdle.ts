/** Longest a background task waits for an idle moment before it runs anyway. */
const IDLE_TIMEOUT_MS = 2000;

/** Without `requestIdleCallback` (Safari), a short delay still keeps the task clear of the frame that asked. */
const FALLBACK_DELAY_MS = 200;

/** Runs `task` once the main thread is idle (at most two seconds from now) and returns a cancel function. */
export function whenIdle(task: () => void): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const handle = window.requestIdleCallback(task, { timeout: IDLE_TIMEOUT_MS });
    return () => window.cancelIdleCallback(handle);
  }
  const handle = window.setTimeout(task, FALLBACK_DELAY_MS);
  return () => window.clearTimeout(handle);
}

/** The visitor asked to save data (Chrome's Save-Data): nothing loads ahead of need. */
export function saveData(): boolean {
  return (
    (navigator as Navigator & { readonly connection?: { readonly saveData?: boolean } }).connection?.saveData === true
  );
}
