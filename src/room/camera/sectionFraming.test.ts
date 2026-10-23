import { PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import { sectionPoints, sectionViewpoint } from './sectionFraming';

describe('section framing', () => {
  for (const section of ['desk', 'drawer'] as const) {
    it.each([1440 / 900, 390 / 844, 844 / 390])(`keeps the ${section} subject in view at aspect %s`, (aspect) => {
      const pose = sectionViewpoint(section, aspect);
      const camera = new PerspectiveCamera(pose.fov, aspect, 0.03, 60);
      camera.position.copy(pose.position);
      camera.lookAt(pose.target);
      camera.updateMatrixWorld(true);
      for (const point of sectionPoints(section, aspect)) {
        const projected = point.project(camera);
        expect(Math.abs(projected.x)).toBeLessThanOrEqual(0.85);
        expect(Math.abs(projected.y)).toBeLessThanOrEqual(0.85);
        expect(projected.z).toBeLessThan(1);
      }
      // The camera remains inside the attic, in front of the subject rather than behind a wall.
      expect(pose.position.z).toBeGreaterThan(-1.15);
      expect(pose.position.z).toBeLessThan(2.25);
      expect(pose.position.y).toBeGreaterThan(1);
      expect(pose.position.y).toBeLessThan(3.1);
    });
  }
});
