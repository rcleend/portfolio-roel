import { describe, expect, it } from 'vitest';
import { Rng } from '@/engine/math/Rng';
import { Customer } from '../entities/customer/Customer';
import { ESCALATED_CUSTOMER, REGULAR_CUSTOMER } from '../entities/customer/tuning';
import { Complaints } from './Complaints';
import { Feedback } from './Feedback';

const layout = (text: string) => ({ lines: [text], width: 60, height: 9, lineHeight: 10 });

describe('Complaints', () => {
  it('shouts the level lines in rotation, from the mouth towards the player', () => {
    const complaints = new Complaints(['A', 'B'], layout, new Feedback(), new Rng(1));
    const customer = new Customer(REGULAR_CUSTOMER, 300, 200);
    customer.facing = -1;
    for (let i = 0; i < 3; i++) complaints.shout(customer, 0);
    expect(complaints.bubbles.map((bubble) => bubble.text.lines[0])).toEqual(['A', 'B', 'A']);
    expect(complaints.bubbles.every((bubble) => bubble.direction === -1 && bubble.center.x < 300)).toBe(true);
  });

  it('aims the escalated volley low then high', () => {
    const complaints = new Complaints(['A'], layout, new Feedback(), new Rng(1));
    const boss = new Customer(ESCALATED_CUSTOMER, 300, 200);
    complaints.shout(boss, 0);
    complaints.shout(boss, 1);
    const [low, high] = complaints.bubbles;
    expect(low?.center.y).toBeGreaterThan(200 - 28);
    expect(high?.rect.y ?? 0).toBeLessThan(200 - 50);
  });

  it('pops bubbles in an area and reports each pop', () => {
    const feedback = new Feedback();
    const complaints = new Complaints(['A'], layout, feedback, new Rng(1));
    complaints.shout(new Customer(REGULAR_CUSTOMER, 300, 200), 0);
    expect(complaints.popWithin({ x: 0, y: 0, w: 640, h: 240 })).toBe(1);
    complaints.update(1 / 60);
    expect(complaints.bubbles).toEqual([]);
    expect(feedback.drain()).toContainEqual({ kind: 'sfx', id: 'hit' });
  });
});
