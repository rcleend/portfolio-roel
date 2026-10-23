import type { GameSurface, PointerSink } from '@/engine/core/GameSurface';

const WIDTH = 320;
const HEIGHT = 240;
const BARS = ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'];

/**
 * A stand-in game for the room lab: an animated 320×240 test card with labelled corners
 * (to catch mirrored or flipped mapping) and a crosshair wherever the host says the pointer
 * is (to verify UV → pixel mapping to the exact pixel).
 */
export class MockGameSurface implements GameSurface {
  readonly canvas = document.createElement('canvas');
  readonly width = WIDTH;
  readonly height = HEIGHT;
  readonly pointer: PointerSink;
  /** Recent pointer calls, newest last; the lab exposes them to automated checks. */
  readonly pointerLog: string[] = [];

  private readonly context: CanvasRenderingContext2D;
  private readonly listeners = new Set<() => void>();
  private frame = 0;
  private running = false;
  private inputEnabled = false;
  private handle = 0;
  private cursor: { x: number; y: number; down: boolean } | null = null;

  constructor() {
    this.canvas.width = WIDTH;
    this.canvas.height = HEIGHT;
    const context = this.canvas.getContext('2d');
    if (!context) throw new Error('2D canvas unavailable');
    this.context = context;
    context.imageSmoothingEnabled = false;
    const log = (entry: string): void => {
      this.pointerLog.push(entry);
      if (this.pointerLog.length > 50) this.pointerLog.shift();
    };
    this.pointer = {
      move: (x, y) => {
        this.cursor = { x, y, down: this.cursor?.down ?? false };
        log(`move ${x},${y}`);
        this.redrawIfPaused();
      },
      leave: () => {
        this.cursor = null;
        log('leave');
        this.redrawIfPaused();
      },
      down: () => {
        if (this.cursor) this.cursor.down = true;
        log('down');
        this.redrawIfPaused();
      },
      up: () => {
        if (this.cursor) this.cursor.down = false;
        log('up');
        this.redrawIfPaused();
      },
    };
    this.draw();
  }

  get paused(): boolean {
    return !this.running;
  }

  get input(): boolean {
    return this.inputEnabled;
  }

  onFrame(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  pause(): void {
    this.running = false;
    cancelAnimationFrame(this.handle);
  }

  resume(): void {
    if (this.running) return;
    this.running = true;
    const tick = (): void => {
      if (!this.running) return;
      this.frame++;
      this.draw();
      this.handle = requestAnimationFrame(tick);
    };
    this.handle = requestAnimationFrame(tick);
  }

  setInputEnabled(enabled: boolean): void {
    this.inputEnabled = enabled;
  }

  /** Draws frame `n` without running, for deterministic screenshots. */
  showFrame(n: number): void {
    this.frame = n;
    this.draw();
  }

  private redrawIfPaused(): void {
    if (!this.running) this.draw();
  }

  private draw(): void {
    const g = this.context;
    const t = this.frame;
    g.fillStyle = '#101018';
    g.fillRect(0, 0, WIDTH, HEIGHT);

    // Colour bars across the top half.
    const barWidth = Math.ceil(WIDTH / BARS.length);
    BARS.forEach((color, i) => {
      g.fillStyle = color;
      g.fillRect(i * barWidth, 0, barWidth, 120);
    });

    // A 16 px grid over the lower half for geometry checks.
    g.fillStyle = '#20263a';
    g.fillRect(0, 120, WIDTH, 120);
    g.fillStyle = '#3c4a70';
    for (let x = 0; x < WIDTH; x += 16) g.fillRect(x, 120, 1, 120);
    for (let y = 120; y < HEIGHT; y += 16) g.fillRect(0, y, WIDTH, 1);

    // Moving sprite so a running game is visibly running.
    const bounce = Math.abs(((t * 2) % 280) - 140);
    g.fillStyle = '#ffd23c';
    g.fillRect(20 + bounce * 2, 150, 16, 16);
    g.fillStyle = '#ff6a3c';
    g.fillRect(24 + bounce * 2, 154, 8, 8);

    // White border pixel ring: the outermost rows and columns must be visible on the CRT.
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, WIDTH, 1);
    g.fillRect(0, HEIGHT - 1, WIDTH, 1);
    g.fillRect(0, 0, 1, HEIGHT);
    g.fillRect(WIDTH - 1, 0, 1, HEIGHT);

    // Corner labels: a mirrored or flipped mapping shows up immediately.
    g.font = 'bold 12px monospace';
    g.textBaseline = 'top';
    const label = (text: string, x: number, y: number): void => {
      g.fillStyle = '#000000';
      g.fillRect(x - 2, y - 1, g.measureText(text).width + 4, 14);
      g.fillStyle = '#ffffff';
      g.fillText(text, x, y);
    };
    label('TL', 4, 4);
    label('TR', WIDTH - 22, 4);
    label('BL', 4, HEIGHT - 17);
    label('BR', WIDTH - 22, HEIGHT - 17);
    label(`MOCK 320x240  F${String(t).padStart(5, '0')}`, 88, 196);

    if (this.cursor) {
      const { x, y, down } = this.cursor;
      g.fillStyle = down ? '#ff2d6f' : '#00ff9c';
      g.fillRect(x - 6, y, 13, 1);
      g.fillRect(x, y - 6, 1, 13);
      if (down) g.fillRect(x - 2, y - 2, 5, 5);
      g.fillStyle = '#ffffff';
      g.fillRect(x, y, 1, 1);
    }

    for (const listener of this.listeners) listener();
  }
}
