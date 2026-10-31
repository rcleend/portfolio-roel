import { ROOM_MOODS, type RoomMood, SCREEN_FINISH_STRENGTH } from './moods';

const SVG = 'http://www.w3.org/2000/svg';
let nextId = 0;

function node(name: string, attributes: Record<string, string | number>): SVGElement {
  const element = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
}

function tint(rgb: readonly number[], gain = 1): string {
  return `${(rgb[0] ?? 0) * gain} 0 0 0 0 0 ${(rgb[1] ?? 0) * gain} 0 0 0 0 0 ${(rgb[2] ?? 0) * gain} 0 0 0 0 0 1 0`;
}

function weights(from: number, to: number, inverted = false): string {
  return Array.from({ length: 65 }, (_, index) => {
    const t = Math.max(0, Math.min(1, (index / 64 - from) / (to - from)));
    const value = t * t * (3 - 2 * t);
    return (inverted ? 1 - value : value).toFixed(4);
  }).join(' ');
}

function transfer(input: string, result: string, values: string): SVGElement {
  const element = node('feComponentTransfer', { in: input, result });
  for (const channel of ['R', 'G', 'B'])
    element.append(node(`feFunc${channel}`, { type: 'table', tableValues: values }));
  return element;
}

/**
 * The PC's live screen is DOM, above WebGL. Match the display's subtle linear-light tint when the camera lands.
 * No diffusion over type: preserve the source's sharpness and contrast without adding WebGL frames.
 */
export class LiveScreenMood {
  private readonly id = `room-screen-mood-${nextId++}`;
  private svg: SVGElement | null = null;
  private mood: RoomMood = 'original';

  constructor(
    private readonly screen: HTMLElement,
    private readonly container: HTMLElement,
  ) {}

  setMood(mood: RoomMood): void {
    this.mood = mood;
    this.screen.dataset.mood = mood;
    this.refresh();
  }

  private refresh(): void {
    if (this.mood === 'original') {
      this.screen.style.removeProperty('filter');
      this.svg?.remove();
      this.svg = null;
      return;
    }
    const finish = ROOM_MOODS[this.mood].finish;
    this.svg ??= node('svg', { width: 0, height: 0, 'aria-hidden': 'true', focusable: 'false' });
    this.svg.style.cssText = 'position:absolute;pointer-events:none';
    const filter = node('filter', {
      id: this.id,
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      'color-interpolation-filters': 'linearRGB',
    });
    const matrix = (input: string, result: string, values: string) =>
      node('feColorMatrix', { in: input, result, type: 'matrix', values });
    const multiply = (a: string, b: string, result: string) =>
      node('feComposite', { in: a, in2: b, result, operator: 'arithmetic', k1: 1, k2: 0, k3: 0, k4: 0 });
    const add = (a: string, b: string, result: string) =>
      node('feComposite', { in: a, in2: b, result, operator: 'arithmetic', k1: 0, k2: 1, k3: 1, k4: 0 });
    const gain = finish.exposure;
    filter.append(
      matrix(
        'SourceGraphic',
        'luma',
        '0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0 0 0 1 0',
      ),
      transfer('luma', 'low', weights(0.015, 0.35, true)),
      transfer('luma', 'high', weights(0.015, 0.35)),
      matrix('SourceGraphic', 'shadow', tint(finish.shadows, gain)),
      matrix('SourceGraphic', 'light', tint(finish.highlights, gain)),
      multiply('shadow', 'low', 'dark'),
      multiply('light', 'high', 'bright'),
      add('dark', 'bright', 'tone'),
      node('feColorMatrix', { in: 'tone', result: 'grade', type: 'saturate', values: finish.saturation }),
      node('feComposite', {
        in: 'grade',
        in2: 'SourceGraphic',
        operator: 'arithmetic',
        k1: 0,
        k2: SCREEN_FINISH_STRENGTH,
        k3: 1 - SCREEN_FINISH_STRENGTH,
        k4: 0,
      }),
    );
    this.svg.replaceChildren(filter);
    if (!this.svg.parentElement) this.container.append(this.svg);
    this.screen.style.filter = `url("#${this.id}")`;
  }

  dispose(): void {
    this.screen.style.removeProperty('filter');
    delete this.screen.dataset.mood;
    this.svg?.remove();
  }
}
