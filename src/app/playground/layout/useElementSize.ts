import { useLayoutEffect, useState } from 'react';

export interface Size {
  readonly width: number;
  readonly height: number;
}

const NONE: Size = { width: 0, height: 0 };

/**
 * The size of `element`, kept current as it resizes and measured before the
 * first paint. For elements without padding or border, whose box is their
 * content.
 */
export function useElementSize(element: Element | null): Size {
  const [size, setSize] = useState(NONE);
  useLayoutEffect(() => {
    if (!element) return;
    const update = (width: number, height: number): void =>
      setSize((current) => (current.width === width && current.height === height ? current : { width, height }));
    const { width, height } = element.getBoundingClientRect();
    update(width, height);
    const observer = new ResizeObserver(([record]) => {
      if (record) update(record.contentRect.width, record.contentRect.height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return size;
}
