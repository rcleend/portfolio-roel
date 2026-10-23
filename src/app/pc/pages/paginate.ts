export interface PageBlock {
  /** Measured height, margins included, in CSS px at 100 %. */
  readonly height: number;
  /** A section heading: it never ends a page, it moves to the next one with the block after it. */
  readonly keepWithNext: boolean;
}

/**
 * Greedy pagination: fills each page with whole blocks in order and returns
 * the block indices on each page. A heading moves with the block it heads;
 * a block (a job, an education entry) is never split, and one taller than a
 * page gets a page of its own, which then grows (pages use `min-height`).
 */
export function paginate(blocks: readonly PageBlock[], pageHeight: number): number[][] {
  const pages: number[][] = [];
  let page: number[] = [];
  let used = 0;
  let index = 0;
  while (index < blocks.length) {
    // A run of keep-with-next blocks and the block that ends it travel together.
    let end = index;
    while (end < blocks.length - 1 && blocks[end]?.keepWithNext) end++;
    const group = range(index, end);
    const height = group.reduce((sum, member) => sum + (blocks[member]?.height ?? 0), 0);
    if (used + height > pageHeight && page.length > 0) {
      pages.push(page);
      page = [];
      used = 0;
    }
    page.push(...group);
    used += height;
    index = end + 1;
  }
  if (page.length > 0) pages.push(page);
  return pages;
}

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, offset) => from + offset);
}
