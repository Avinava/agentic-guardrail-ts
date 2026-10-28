import { describe, expect, it } from 'vitest';
import { open } from './index.js';

describe('open', () => {
  it('starts at zero', () => {
    expect(open('a').balance).toBe(0);
  });
});
