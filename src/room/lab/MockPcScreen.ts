import type { PcMonitor, StillPainter } from '../pc/PcMonitor';

/** Grid spacing in layout (CSS) pixels of the live screen. */
const GRID = 50;
const RAMPS = ['#ff0000', '#00ff00', '#0000ff', '#ffffff'];

/**
 * A stand-in for the app's PC screen in the room lab: the same test card painted as the monitor's
 * still and, at device resolution, as the live DOM screen. A 50 px grid, a ring on the picture's
 * edge, labelled corners and colour ramps make registration and the hand-off measurable: on the
 * landing frame the two must line up to the pixel and match in colour.
 */
export class MockPcScreen {
  private readonly canvas = document.createElement('canvas');
  private readonly stopPlacement: () => void;
  private readonly stopLive: () => void;

  constructor(private readonly pc: PcMonitor) {
    Object.assign(this.canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
    this.canvas.dataset.mockPcScreen = '';
    pc.screen.append(this.canvas);
    pc.setStill(this.paintStill);
    this.stopPlacement = pc.onPlacementChange(() => {
      pc.invalidateStill();
      if (pc.live) this.paintLive();
    });
    this.stopLive = pc.onLiveChange((live) => {
      if (live) this.paintLive();
    });
  }

  dispose(): void {
    this.stopPlacement();
    this.stopLive();
    this.pc.setStill(null);
    this.canvas.remove();
  }

  private readonly paintStill: StillPainter = (context, request) => {
    const layout = request.placement.width > 0 ? request.placement : { width: request.width, height: request.height };
    context.scale(request.width / layout.width, request.height / layout.height);
    paintTestCard(context, layout.width, layout.height);
  };

  private paintLive(): void {
    const { width, height } = this.pc.placement;
    const ratio = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(width * ratio);
    this.canvas.height = Math.round(height * ratio);
    const context = this.canvas.getContext('2d');
    if (!context) return;
    context.scale(this.canvas.width / width, this.canvas.height / height);
    paintTestCard(context, width, height);
  }
}

/** The test card at `width × height` layout pixels; the context is already scaled to them. */
function paintTestCard(context: CanvasRenderingContext2D, width: number, height: number): void {
  context.fillStyle = '#24406e';
  context.fillRect(0, 0, width, height);

  context.fillStyle = 'rgb(255 255 255 / 0.28)';
  for (let x = GRID; x < width; x += GRID) context.fillRect(x - 0.5, 0, 1, height);
  for (let y = GRID; y < height; y += GRID) context.fillRect(0, y - 0.5, width, 1);

  const rampHeight = 24;
  const rampTop = height / 2 - (RAMPS.length * rampHeight) / 2;
  RAMPS.forEach((colour, i) => {
    const gradient = context.createLinearGradient(GRID, 0, width - GRID, 0);
    gradient.addColorStop(0, '#000000');
    gradient.addColorStop(1, colour);
    context.fillStyle = gradient;
    context.fillRect(GRID, rampTop + i * rampHeight, width - GRID * 2, rampHeight);
  });

  // A 2 px ring exactly on the picture's edge, and a crosshair in its middle.
  context.strokeStyle = '#ffe14d';
  context.lineWidth = 2;
  context.strokeRect(1, 1, width - 2, height - 2);
  context.beginPath();
  context.moveTo(width / 2 - 20, height / 2);
  context.lineTo(width / 2 + 20, height / 2);
  context.moveTo(width / 2, height / 2 - 20);
  context.lineTo(width / 2, height / 2 + 20);
  context.stroke();

  context.fillStyle = '#ffffff';
  context.font = 'bold 16px ui-monospace, monospace';
  context.textBaseline = 'top';
  context.textAlign = 'left';
  context.fillText('TL', 8, 8);
  context.fillText('BL', 8, height - 24);
  context.textAlign = 'right';
  context.fillText('TR', width - 8, 8);
  context.fillText('BR', width - 8, height - 24);
  context.textAlign = 'center';
  context.fillText(`${Math.round(width)} × ${Math.round(height)}`, width / 2, rampTop - 28);
}
