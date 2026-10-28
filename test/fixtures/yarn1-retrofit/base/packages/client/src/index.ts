import { formatBalance, type Account } from '@rf/shared';

export const render = (account: Account): string => `Balance: ${formatBalance(account)}`;
