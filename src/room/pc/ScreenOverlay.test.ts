// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScreenOverlay } from './ScreenOverlay';

function setup({ reduced = false } = {}) {
  const container = document.createElement('div');
  document.body.append(container);
  const animation = { cancel: vi.fn() };
  const animate = vi.fn(() => animation as unknown as Animation);
  HTMLElement.prototype.animate = animate;
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage,
  } as unknown as CanvasRenderingContext2D);
  const overlay = new ScreenOverlay(container, { matches: reduced } as MediaQueryList);
  const live = vi.fn();
  overlay.onLiveChange(live);
  return { container, overlay, animate, animation, drawImage, live };
}

describe('ScreenOverlay', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it('starts hidden and inert, with the app slot under the glass finish', () => {
    const { container, overlay } = setup();
    const element = container.querySelector<HTMLElement>('[data-pc-screen]');
    expect(element).toBe(overlay.element);
    expect(element?.dataset.live).toBe('false');
    expect(element?.style.visibility).toBe('hidden');
    expect(element?.style.pointerEvents).toBe('none');
    expect(element?.style.overflow).toBe('hidden');
    expect(element?.style.position).toBe('absolute');
    expect([...(element?.children ?? [])].map((child) => child.tagName)).toEqual(['DIV', 'CANVAS']);
    expect(element?.firstElementChild).toBe(overlay.content);
    expect(element?.querySelector('canvas')?.style.pointerEvents).toBe('none');
    expect(overlay.live).toBe(false);
    expect(overlay.placement).toEqual({ left: 0, top: 0, width: 0, height: 0 });
  });

  it('lays itself over the picture with a 2D translate and tells listeners once per change', () => {
    const { overlay } = setup();
    const placed = vi.fn();
    overlay.onPlacementChange(placed);
    const rect = { left: 283, top: 90.5, width: 874, height: 687.5 };
    overlay.setPlacement(rect, 15.6);
    overlay.setPlacement({ ...rect }, 15.6);
    const { style } = overlay.element;
    expect(style.width).toBe('874px');
    expect(style.height).toBe('687.5px');
    expect(style.transform).toBe('translate(283px, 90.5px)');
    expect(style.borderRadius).toBe('15.6px');
    expect(placed).toHaveBeenCalledExactlyOnceWith(rect);
    expect(overlay.placement).toEqual(rect);
  });

  it('reveals itself on landing and fades in over the still', () => {
    const { overlay, animate, live } = setup();
    overlay.reveal();
    expect(overlay.live).toBe(true);
    expect(overlay.element.dataset.live).toBe('true');
    expect(overlay.element.style.visibility).toBe('visible');
    expect(overlay.element.style.pointerEvents).toBe('auto');
    expect(live).toHaveBeenCalledExactlyOnceWith(true);
    expect(animate).toHaveBeenCalledExactlyOnceWith([{ opacity: 0 }, { opacity: 1 }], {
      duration: 160,
      easing: 'ease-out',
    });
    overlay.reveal();
    expect(live).toHaveBeenCalledTimes(1);
  });

  it('appears at once under reduced motion', () => {
    const { overlay, animate } = setup({ reduced: true });
    overlay.reveal();
    expect(overlay.live).toBe(true);
    expect(animate).not.toHaveBeenCalled();
  });

  it('hides at once when the camera leaves, cancelling the fade', () => {
    const { overlay, animation, live } = setup();
    overlay.reveal();
    overlay.conceal();
    expect(animation.cancel).toHaveBeenCalled();
    expect(overlay.live).toBe(false);
    expect(overlay.element.dataset.live).toBe('false');
    expect(overlay.element.style.visibility).toBe('hidden');
    expect(overlay.element.style.pointerEvents).toBe('none');
    expect(live.mock.calls).toEqual([[true], [false]]);
    overlay.conceal();
    expect(live).toHaveBeenCalledTimes(2);
  });

  it('copies the picture part of the shared glass finish once, the first time it shows', () => {
    const { overlay, drawImage } = setup();
    const source = document.createElement('canvas');
    overlay.setFinish({ source: () => source, rect: { x: 7.2, y: 7.2, width: 241.6, height: 190.6 } });
    expect(drawImage).not.toHaveBeenCalled();
    overlay.reveal();
    overlay.conceal();
    overlay.reveal();
    expect(drawImage).toHaveBeenCalledExactlyOnceWith(source, 7.2, 7.2, 241.6, 190.6, 0, 0, 242, 191);
  });

  it('removes itself on dispose', () => {
    const { container, overlay } = setup();
    overlay.dispose();
    expect(container.querySelector('[data-pc-screen]')).toBeNull();
  });
});
