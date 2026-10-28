import { describe, expect, it } from 'vitest';
import { greet } from './index.js';

describe('greet', () => {
  it('greets by name', () => {
    expect(greet({ id: '1', name: 'Ada' })).toBe('Hello, Ada');
  });
});
