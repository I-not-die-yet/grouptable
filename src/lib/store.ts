import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Allocation, MealRequest } from './domain';
import { AppError } from './extraction';
import { menu } from './menu';
import { isSegmentRequest, type SegmentAllocation, type SegmentRequest } from './segments';
import { consolidateSegmentItems } from './segment-allocation';

export type OrderStatus = 'ready' | 'creating' | 'awaiting_approval' | 'capturing' | 'unknown' | 'pending' | 'paid' | 'stale';
export type StoredOrder = {
  id: string; owner: string; mode: 'fixture' | 'sandbox'; status: OrderStatus; request: MealRequest; allocation: Allocation;
  items: { id: string; name: string; priceCents: number; quantity: number }[];
  createRequestId: string; captureRequestId: string; captureSubmitted: boolean; paypalId: string | null; captureId: string | null; approvalUrl: string | null; createdAt: string;
};
export type SegmentStoredOrder = Omit<StoredOrder, 'request' | 'allocation'> & { request: SegmentRequest; allocation: SegmentAllocation };
export type AnyStoredOrder = StoredOrder | SegmentStoredOrder;
export function isSegmentOrder(order: AnyStoredOrder): order is SegmentStoredOrder { return isSegmentRequest(order.request); }
export const lockedStatuses: OrderStatus[] = ['creating', 'capturing', 'unknown', 'pending'];

export class Store {
  db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(resolve(path)), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000; CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, owner TEXT NOT NULL, status TEXT NOT NULL, payload TEXT NOT NULL); CREATE INDEX IF NOT EXISTS owner_idx ON orders(owner);');
    // An interrupted write may already have reached PayPal. Do not unlock it on restart.
    for (const row of this.db.prepare("SELECT payload FROM orders WHERE status IN ('creating','capturing')").all()) {
      const order = JSON.parse(String(row.payload)) as AnyStoredOrder; order.status = 'unknown'; this.save(order);
    }
  }
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  list(owner: string): AnyStoredOrder[] { return this.db.prepare('SELECT payload FROM orders WHERE owner=?').all(owner).map(row => JSON.parse(String(row.payload))); }
  get(id: string, owner: string): AnyStoredOrder {
    const row = this.db.prepare('SELECT payload FROM orders WHERE id=? AND owner=?').get(id, owner);
    if (!row) throw new AppError(404, 'ORDER_NOT_FOUND', 'This order is not available in your browser session.');
    return JSON.parse(String(row.payload));
  }
  save(order: AnyStoredOrder) { this.db.prepare('INSERT INTO orders(id,owner,status,payload) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,payload=excluded.payload').run(order.id, order.owner, order.status, JSON.stringify(order)); }
  create(owner: string, request: MealRequest, allocation: Allocation, mode: StoredOrder['mode']): StoredOrder;
  create(owner: string, request: SegmentRequest, allocation: SegmentAllocation, mode: StoredOrder['mode']): SegmentStoredOrder;
  create(owner: string, request: MealRequest | SegmentRequest, allocation: Allocation | SegmentAllocation, mode: StoredOrder['mode']): AnyStoredOrder {
    return this.transaction(() => {
      const old = this.list(owner);
      if (old.some(o => lockedStatuses.includes(o.status))) throw new AppError(409, 'PAYMENT_LOCKED', 'Check the previous payment before creating another order.');
      for (const o of old) if (!['paid', 'stale'].includes(o.status)) { o.status = 'stale'; this.save(o); }
      const cleanRequest = isSegmentRequest(request) ? { ...request, segments: request.segments.map(s => ({ ...s, sources: [] })) } : { ...request, attendees: request.attendees.map(a => ({ ...a, source: '' })) };
      const counts = isSegmentRequest(request) ? consolidateSegmentItems(allocation as SegmentAllocation) : new Map<string, number>();
      if (!isSegmentRequest(request)) for (const a of allocation.assignments) counts.set(a.itemId, (counts.get(a.itemId) ?? 0) + 1);
      const items = [...counts].map(([id, quantity]) => { const item = menu.find(m => m.id === id)!; return { id, name: item.name, priceCents: item.priceCents, quantity }; });
      const order = { id: randomUUID(), owner, mode, status: 'ready', request: cleanRequest, allocation, items, createRequestId: randomUUID(), captureRequestId: randomUUID(), captureSubmitted: false, paypalId: null, captureId: null, approvalUrl: null, createdAt: new Date().toISOString() } as AnyStoredOrder;
      this.save(order); return order;
    });
  }
  invalidate(id: string, owner: string) {
    return this.transaction(() => {
      const order = this.get(id, owner);
      if (lockedStatuses.includes(order.status)) throw new AppError(409, 'PAYMENT_LOCKED', 'Payment is still being checked. Check its status before editing.');
      if (order.status !== 'paid') { order.status = 'stale'; this.save(order); }
      return order;
    });
  }
}
const globalStore = globalThis as typeof globalThis & { grouptableStores?: Map<string, Store> };
export function getStore() {
  const path = resolve(process.env.GROUPTABLE_DB_PATH || './data/grouptable.sqlite');
  const stores = globalStore.grouptableStores ??= new Map();
  if (!stores.has(path)) stores.set(path, new Store(path));
  return stores.get(path)!;
}
export function publicOrder(order: StoredOrder): PublicOrder;
export function publicOrder(order: SegmentStoredOrder): PublicSegmentOrder;
export function publicOrder(order: AnyStoredOrder): PublicAnyOrder;
export function publicOrder(order: AnyStoredOrder) {
  const { id, mode, status, request, allocation, items, paypalId, captureId, createdAt } = order;
  return { id, mode, status, request, allocation, items, paypalId, captureId, createdAt };
}
type PublicFields<T> = Omit<T, 'owner' | 'createRequestId' | 'captureRequestId' | 'captureSubmitted' | 'approvalUrl'>;
export type PublicOrder = PublicFields<StoredOrder>;
export type PublicSegmentOrder = PublicFields<SegmentStoredOrder>;
export type PublicAnyOrder = PublicOrder | PublicSegmentOrder;
