import { formatBalance, type Account } from '@rf/shared';
import { open } from '@rf/server';

export const render = (account: Account): string => `Balance: ${formatBalance(account)}`;

export const demo = (): string => render(open('demo'));
