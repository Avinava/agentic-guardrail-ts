import type { Account } from '@rf/shared';

const accounts = new Map<string, Account>();

// Existing debt: too many parameters, non-null assertion, a bare disable.
export function transfer(from: string, to: string, amount: number, note: string, at: Date): void {
  const source = accounts.get(from)!;
  const target = accounts.get(to)!;
  accounts.set(from, { ...source, balance: source.balance - amount });
  accounts.set(to, { ...target, balance: target.balance + amount });
  // eslint-disable-next-line
  console.log(note, at.toISOString());
}

export function open(id: string): Account {
  const account = { id, balance: 0 };
  accounts.set(id, account);
  return account;
}
