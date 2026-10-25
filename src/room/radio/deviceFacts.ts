/** `navigator.deviceMemory` (GB, coarse, Chromium only), or undefined. */
export function deviceMemory(): number | undefined {
  return (navigator as Navigator & { readonly deviceMemory?: number }).deviceMemory;
}

/**
 * The browser estimates the link at 3G or slower (`navigator.connection.effectiveType`, Chromium only: from measured
 * round trips and throughput, so a fast link that briefly stalls does not count).
 */
export function slowLink(): boolean {
  const type = (navigator as Navigator & { readonly connection?: { readonly effectiveType?: string } }).connection
    ?.effectiveType;
  return type === 'slow-2g' || type === '2g' || type === '3g';
}

/** The visitor asked for reduced data use (`Save-Data`). */
export function saveData(): boolean {
  return (
    (navigator as Navigator & { readonly connection?: { readonly saveData?: boolean } }).connection?.saveData === true
  );
}
