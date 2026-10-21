/**
 * Combines per-file download progress into one 0–1 fraction. Files report their real size
 * once the server tells us; until then the expected size stands in, so the bar neither
 * jumps backwards when sizes arrive nor stalls on servers without Content-Length.
 */
export class LoadProgress {
  private readonly files = new Map<string, { loaded: number; total: number }>();

  constructor(
    expectedBytes: Readonly<Record<string, number>>,
    private readonly onChange: (fraction: number) => void,
  ) {
    for (const [name, total] of Object.entries(expectedBytes)) this.files.set(name, { loaded: 0, total });
  }

  update(name: string, loaded: number, total?: number): void {
    const file = this.files.get(name);
    if (!file) throw new Error(`Unknown file in load progress: ${name}`);
    if (total !== undefined && total > 0) file.total = total;
    file.loaded = Math.min(loaded, file.total);
    this.onChange(this.fraction);
  }

  complete(name: string): void {
    const file = this.files.get(name);
    if (!file) throw new Error(`Unknown file in load progress: ${name}`);
    this.update(name, file.total);
  }

  get fraction(): number {
    let loaded = 0;
    let total = 0;
    for (const file of this.files.values()) {
      loaded += file.loaded;
      total += file.total;
    }
    return total === 0 ? 1 : loaded / total;
  }
}
