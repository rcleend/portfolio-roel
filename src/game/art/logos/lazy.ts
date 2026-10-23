/**
 * Builds a value on first use and hands out the same instance afterwards.
 *
 * Procedural logos are deterministic and immutable, so generating them once
 * per page load is enough; deferring it to first use keeps them off the
 * startup path of scenes that never show them.
 */
export function lazy<T>(build: () => T): () => T {
  let built: { readonly value: T } | null = null;
  return () => {
    built ??= { value: build() };
    return built.value;
  };
}
