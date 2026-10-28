import { greet } from '@fx/core';

export interface User {
  readonly id: string;
  readonly name: string;
}

export const sample = greet({ id: 's', name: 'sample' });
