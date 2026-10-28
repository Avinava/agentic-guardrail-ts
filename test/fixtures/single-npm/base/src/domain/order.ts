export interface Order {
  readonly id: string;
  readonly total: number;
}

export function applyDiscount(order: Order, percent: number): Order {
  return { ...order, total: Math.round(order.total * (1 - percent / 100)) };
}
