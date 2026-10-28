export interface Account {
  readonly id: string;
  readonly balance: number;
}

export const formatBalance = (account: Account): string => account.balance.toFixed(2);
