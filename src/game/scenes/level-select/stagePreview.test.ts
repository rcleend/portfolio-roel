import { describe, expect, it } from 'vitest';
import { bundledManifests } from '../../levels/art/LevelArt';
import { cardRect, previewRect } from './layout';
import { PREVIEW_FRAMING, previewCamera } from './stagePreview';

describe('previewCamera', () => {
  const framing = { cropX: 0, cropY: 0, pan: 600, period: 40 };

  it('sweeps there and back in whole pixels', () => {
    expect(previewCamera(0, framing)).toBe(0);
    expect(previewCamera(20, framing)).toBe(600);
    expect(previewCamera(40, framing)).toBe(0);
    expect(Number.isInteger(previewCamera(7.3, framing))).toBe(true);
  });
});

describe('PREVIEW_FRAMING', () => {
  const picture = previewRect(cardRect(0));

  it.each(Object.entries(PREVIEW_FRAMING))('keeps the %s crop inside the stage', (_levelId, framing) => {
    expect(framing.cropX).toBeGreaterThanOrEqual(0);
    expect(framing.cropY).toBeGreaterThanOrEqual(0);
    expect(framing.cropX + picture.w).toBeLessThanOrEqual(320);
    expect(framing.cropY + picture.h).toBeLessThanOrEqual(240);
  });

  it('never pans a fixed-width plane past its edge', () => {
    for (const [levelId, manifest] of bundledManifests()) {
      const framing = PREVIEW_FRAMING[levelId];
      for (const layer of manifest.layers.filter((spec) => !spec.repeatX && !spec.foreground)) {
        expect(Math.round(framing.pan * layer.factor) + 320, `${levelId}/${layer.id}`).toBeLessThanOrEqual(layer.width);
      }
    }
  });
});
