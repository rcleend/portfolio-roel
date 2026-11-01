// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { pointerKind, showGameCursor } from './gameCursor';

describe('the game cursor on the flat host', () => {
  it("names and draws the game's cursor, the hand being the stage's play", () => {
    const screen = document.createElement('div');
    showGameCursor(screen, 'hand');
    expect(screen.dataset.cursor).toBe('play');
    expect(screen.style.cursor).toBe('var(--room-cursor-play, pointer)');
    showGameCursor(screen, 'jump-left');
    expect(screen.dataset.cursor).toBe('jump-left');
    expect(screen.style.cursor).toBe('var(--room-cursor-jump-left, pointer)');
    showGameCursor(screen, 'attack-right');
    expect(screen.style.cursor).toBe('var(--room-cursor-attack-right, crosshair)');
  });

  it('tells a finger and a pen from a mouse', () => {
    expect(pointerKind('touch')).toBe('touch');
    expect(pointerKind('pen')).toBe('pen');
    expect(pointerKind('mouse')).toBe('mouse');
    expect(pointerKind('')).toBe('mouse');
  });
});
