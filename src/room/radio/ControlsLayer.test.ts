// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { ControlsLayer } from './ControlsLayer';

describe('ControlsLayer', () => {
  it('sits in the overlay container hidden, never taking a pointer itself', () => {
    const container = document.createElement('div');
    const layer = new ControlsLayer(container);
    expect(layer.element.parentElement).toBe(container);
    expect(layer.element.style.visibility).toBe('hidden');
    expect(layer.element.style.pointerEvents).toBe('none');
    expect(layer.element.dataset.live).toBe('false');
    expect(layer.live).toBe(false);
  });

  it('goes live on the landing and hides synchronously in the request to leave', () => {
    const layer = new ControlsLayer(document.createElement('div'));
    const changes = vi.fn();
    layer.onLiveChange(changes);
    layer.reveal();
    expect(layer.element.style.visibility).toBe('visible');
    expect(layer.element.dataset.live).toBe('true');
    layer.reveal();
    layer.conceal();
    // In the same task: no frame can show the controls over a moving camera.
    expect(layer.element.style.visibility).toBe('hidden');
    expect(layer.element.dataset.live).toBe('false');
    expect(layer.element.style.pointerEvents).toBe('none');
    expect(changes.mock.calls).toEqual([[true], [false]]);
  });

  it('leaves the container on disposal', () => {
    const container = document.createElement('div');
    const layer = new ControlsLayer(container);
    layer.dispose();
    expect(container.children).toHaveLength(0);
  });
});
