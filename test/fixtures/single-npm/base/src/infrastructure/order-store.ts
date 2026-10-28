import type { Order } from '../domain/order.js';

const orders = new Map<string, Order>();

export async function saveOrder(order: Order): Promise<void> {
  await Promise.resolve();
  orders.set(order.id, order);
}
