import type { User } from '@fx/types';

export function greet(user: User): string {
  return `Hello, ${user.name}`;
}
