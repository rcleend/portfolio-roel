/** `navigator.deviceMemory` (GB, coarse, Chromium only), or undefined. */
export function deviceMemory(): number | undefined {
  return (navigator as Navigator & { readonly deviceMemory?: number }).deviceMemory;
}

/** The visitor asked for reduced data use (`Save-Data`). */
export function saveData(): boolean {
  return (
    (navigator as Navigator & { readonly connection?: { readonly saveData?: boolean } }).connection?.saveData === true
  );
}
