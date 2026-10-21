/**
 * Defers building a value until it is first needed, then reuses it.
 * Sprite atlases need a canvas, so compiling them on first draw (rather than
 * in a constructor) keeps the scene's logic constructible in plain unit tests.
 */
export function lazy<T>(create: () => T): () => T {
  let value: { readonly current: T } | null = null;
  return () => {
    value ??= { current: create() };
    return value.current;
  };
}
