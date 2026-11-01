import type { InputSnapshot } from '@/engine/input/InputSnapshot';
import { IDLE_INTENT, type PlayerIntent } from '../../entities/player/Player';
import type { Action } from '../../input/bindings';

/** Reads the player's intent from game actions. Holding both directions cancels out. */
export function intentFromInput(input: InputSnapshot<Action>): PlayerIntent {
  const x = (input.isDown('right') ? 1 : 0) - (input.isDown('left') ? 1 : 0);
  return {
    x: x > 0 ? 1 : x < 0 ? -1 : 0,
    jumpPressed: input.wasPressed('jump'),
    jumpHeld: input.isDown('jump'),
    attackHeld: input.isDown('attack'),
    skill1Pressed: input.wasPressed('skill1'),
    skill2Pressed: input.wasPressed('skill2'),
  };
}

/** True when `intent` asks for nothing at all. */
export function isIdle(intent: PlayerIntent): boolean {
  const { x, jumpPressed, jumpHeld, attackHeld, skill1Pressed, skill2Pressed } = intent;
  return x === 0 && !jumpPressed && !jumpHeld && !attackHeld && !skill1Pressed && !skill2Pressed;
}

/** Several sources played at once (keys, the strip's keys, the mouse): the first that moves steers, presses add up. */
export function combineIntents(...intents: readonly PlayerIntent[]): PlayerIntent {
  const face = intents.find((intent) => intent.face !== undefined)?.face;
  const combined: PlayerIntent = {
    x: intents.find((intent) => intent.x !== 0)?.x ?? 0,
    jumpPressed: intents.some((intent) => intent.jumpPressed),
    jumpHeld: intents.some((intent) => intent.jumpHeld),
    attackHeld: intents.some((intent) => intent.attackHeld),
    skill1Pressed: intents.some((intent) => intent.skill1Pressed),
    skill2Pressed: intents.some((intent) => intent.skill2Pressed),
  };
  return face === undefined ? combined : { ...combined, face };
}

/** Walks towards `targetX` and nothing else — the finale's autopilot. */
export function walkTowards(fromX: number, targetX: number): PlayerIntent {
  const dx = targetX - fromX;
  return { ...IDLE_INTENT, x: Math.abs(dx) < 3 ? 0 : dx > 0 ? 1 : -1 };
}
