import { describe, expect, it } from 'vitest';
import { applyDiscount } from './order.js';

describe('applyDiscount', () => {
  it('reduces the total', () => {
    expect(applyDiscount({ id: 'a', total: 100 }, 10).total).toBe(90);
  });
});
