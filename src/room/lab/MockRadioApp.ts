import type { DeckState, DiscArt, LcdReadout, RadioCueEvent, RadioDeck, RadioKey } from '../radio/RadioDeck';

/** Five numbered discs in five colours: what the lab hands the radio instead of the app's albums. */
const DISCS = [
  { id: 'mock-1', colour: '#d9485f' },
  { id: 'mock-2', colour: '#3f88c5' },
  { id: 'mock-3', colour: '#f2a541' },
  { id: 'mock-4', colour: '#44a687' },
  { id: 'mock-5', colour: '#8e6cc9' },
] as const;
const TRACKS = 3;
const TRACK_SECONDS = 40;

/**
 * A stand-in for the app's player in the room lab (`?mockradio=1`): five numbered prints, and a fake player that
 * answers the radio the way the app does — a pick loads the disc and starts it, `seated` starts the "sound" (a
 * clock on the LCD), the keys play, pause, stop and skip. Every cue and seated moment is logged with its time on
 * `window.__radioLog`, so end-to-end tests can check the storyboard's timing.
 */
export class MockRadioApp {
  readonly log: { readonly at: number; readonly event: string; readonly detail?: string }[] = [];
  private state: DeckState = { loaded: null, transport: 'stopped', lcd: { kind: 'off' } };

  /** What the fake player last handed the deck (for the shots and tests). */
  get deckState(): DeckState {
    return this.state;
  }
  private track = 1;
  private seconds = 0;
  private sounding = false;
  private clock: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly deck: RadioDeck) {
    deck.onIntent((intent) => {
      this.record('intent', intent.type === 'pick' ? `pick ${intent.disc}` : `press ${intent.key}`);
      if (intent.type === 'pick') this.pick(intent.disc);
      else this.act(intent.key);
    });
    deck.onSeated((disc) => {
      this.record('seated', disc);
      if (disc !== this.state.loaded) return;
      this.seconds = 0;
      this.sounding = this.state.transport === 'playing';
      this.publish();
    });
    deck.onCue((event: RadioCueEvent) =>
      this.record('cue', `${event.cue}${event.order === undefined ? '' : ` ${event.order}`}`),
    );
    deck.onAttentionChange((disc) => this.record('attention', disc ?? 'none'));
  }

  /** Paints the prints at the radio's label size and hands them over. */
  setDiscs(): void {
    const size = this.deck.labelSize;
    const discs: DiscArt[] = DISCS.map((disc, i) => ({ id: disc.id, label: paintLabel(size, i + 1, disc.colour) }));
    this.deck.setDiscs(discs);
    this.publish();
  }

  /** Presses a key as the app's DOM controls would: the key animates and the transport acts. */
  press(key: RadioKey): void {
    this.deck.press(key);
    this.act(key);
  }

  dispose(): void {
    if (this.clock !== null) clearInterval(this.clock);
  }

  private pick(disc: string): void {
    this.track = 1;
    this.seconds = 0;
    this.sounding = false;
    this.state = { ...this.state, loaded: disc, transport: 'playing' };
    this.publish();
  }

  private act(key: RadioKey): void {
    const { loaded, transport } = this.state;
    if (loaded === null) return;
    if (key === 'play-pause') this.state = { ...this.state, transport: transport === 'playing' ? 'paused' : 'playing' };
    if (key === 'stop') {
      this.state = { ...this.state, transport: 'stopped' };
      this.track = 1;
      this.seconds = 0;
    }
    if (key === 'next' && this.track < TRACKS) this.track++;
    if (key === 'previous') {
      if (this.seconds > 3) this.seconds = 0;
      else this.track = Math.max(1, this.track - 1);
    }
    this.sounding = this.state.transport === 'playing';
    this.publish();
  }

  private publish(): void {
    const { loaded, transport } = this.state;
    let lcd: LcdReadout;
    // Empty, the display is off; the radio shows "no dISC" itself while the visitor is there.
    if (loaded === null) lcd = { kind: 'off' };
    else if (transport === 'stopped') lcd = { kind: 'total', tracks: TRACKS, seconds: TRACKS * TRACK_SECONDS };
    else if (!this.sounding && transport === 'playing') lcd = { kind: 'reading' };
    else lcd = { kind: 'track', track: this.track, seconds: this.seconds, transport };
    this.state = { loaded, transport, lcd };
    this.deck.setState(this.state);
    const ticking = this.sounding && transport === 'playing';
    if (ticking && this.clock === null) {
      this.clock = setInterval(() => {
        this.seconds++;
        this.publish();
      }, 1000);
    } else if (!ticking && this.clock !== null) {
      clearInterval(this.clock);
      this.clock = null;
    }
  }

  private record(event: string, detail?: string): void {
    this.log.push({ at: performance.now(), event, ...(detail === undefined ? {} : { detail }) });
  }
}

/** A disc print: a coloured ring of ink with a big number and bare foil showing through stripes and the centre. */
export function paintLabel(size: number, number: number, colour: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return canvas;
  const centre = size / 2;
  const circle = (radius: number) => {
    context.moveTo(centre + (radius / 60) * centre, centre);
    context.arc(centre, centre, (radius / 60) * centre, 0, Math.PI * 2);
  };
  context.fillStyle = colour;
  context.beginPath();
  circle(58.5);
  circle(23);
  context.fill('evenodd');
  // Foil stripes through the ink, and the number.
  context.globalCompositeOperation = 'destination-out';
  context.lineWidth = size * 0.012;
  for (const radius of [30, 34, 52]) {
    context.beginPath();
    circle(radius);
    context.stroke();
  }
  context.globalCompositeOperation = 'source-over';
  context.fillStyle = '#fbf6ea';
  context.font = `bold ${Math.round(size * 0.22)}px "Trebuchet MS", Arial, sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(String(number), centre, centre - size * 0.29);
  context.font = `bold ${Math.round(size * 0.045)}px "Trebuchet MS", Arial, sans-serif`;
  context.fillText(`MOCK DISC ${number}`, centre, centre + size * 0.3);
  return canvas;
}
