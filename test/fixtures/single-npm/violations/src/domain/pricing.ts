import { saveOrder } from '../infrastructure/order-store.js';
import type { Order } from './order.js';

export function price(a: number, b: number, c: number, d: number, e: number): number {
  return a + b + c + d + e;
}

export function persist(order: Order): void {
  saveOrder(order);
}

// eslint-disable-next-line
export const loose = JSON.parse('{}') as Order;
