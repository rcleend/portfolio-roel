import { boxCharts } from '../kit/charts';
import { MATERIAL } from '../materials';
import { GROUP, PAGE, type Prop } from './types';

/** The oak floor: one chart, 5.6 m × 4.8 m, with a page to itself. Its boards are a surface function. */
export const floor: Prop = {
  name: 'floor',
  budget: 2,
  build(sink) {
    sink.chart({
      page: PAGE.floor,
      group: GROUP.floor,
      material: MATERIAL.oak,
      params: [0, 0, 0, 0],
      density: 365,
      shade: 1,
      origin: [-2.8, 0, 2.4],
      u: [5.6, 0, 0],
      v: [0, 0, -4.8],
    });
  },
};

/**
 * The knee wall behind the TV cabinet (x = 2.80, 1.88 m high under the slope): painted beadboard, with the cream
 * skirting board along its foot.
 */
export const kneeWall: Prop = {
  name: 'knee-wall',
  budget: 8,
  build(sink) {
    sink.chart({
      page: PAGE.corner,
      group: GROUP.wall,
      material: MATERIAL.wallPaint,
      params: [0.11, 0.135, 0.185, 0],
      density: 220,
      shade: 1,
      origin: [2.8, 0, -2.4],
      u: [0, 0, 4.8],
      v: [0, 1.88, 0],
    });
    sink.chart(
      ...boxCharts(
        [2.784, 0, -2.4],
        [2.8, 0.09, 2.4],
        {
          page: PAGE.corner,
          group: GROUP.wall,
          material: MATERIAL.enamel,
          params: [0.5, 0.45, 0.41, 0.3],
          density: 160,
          shade: 1,
        },
        ['+x', '-y', '-z', '+z'],
      ),
    );
  },
};
