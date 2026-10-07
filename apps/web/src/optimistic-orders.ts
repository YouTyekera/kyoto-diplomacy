import type { GameOrder } from '../../../packages/shared/events';

type Send = (orders: GameOrder[], finalize: boolean) => Promise<boolean>;
export interface OrderPatch {unitId:string;order:GameOrder|null}
interface Save { orders: GameOrder[]; finalize: boolean; patch?:OrderPatch;confirmed?: GameOrder[]; resolve: (accepted: boolean) => void }
const same = (a: GameOrder[], b: GameOrder[]) => JSON.stringify(a) === JSON.stringify(b);
const orderKey = (order: GameOrder) => JSON.stringify(Object.entries(order).sort(([a], [b]) => a.localeCompare(b)));

/** Immediate client drafts; FIFO patches precede the fully validated final sheet. */
export class OptimisticOrders {
  private authoritative: GameOrder[];
  private queue: Save[] = [];
  private active: Save | null = null;
  private epoch = 0;
  private listeners = new Set<() => void>();
  private state: { orders: GameOrder[]; saving: boolean; finalizing: boolean; rollback: number };
  constructor(orders: GameOrder[], private send: Send,private sendPatch?:(patch:OrderPatch)=>Promise<boolean>) {
    this.authoritative = orders;
    this.state = { orders, saving: false, finalizing: false, rollback: 0 };
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  snapshot = () => this.state;
  private update(patch: Partial<typeof this.state>) { this.state = { ...this.state, ...patch }; this.listeners.forEach(f => f()); }
  receive(orders: GameOrder[]) {
    this.authoritative = orders;
    const job = this.active;
    if (job && (job.finalize || orders.length === job.orders.length) && job.orders.every(order =>
      orders.some(confirmed => orderKey(confirmed) === orderKey(order)))) job.confirmed = orders;
    // Older snapshots must not erase later local edits that are still in the queue.
    if (!this.active && !this.queue.length && !same(this.state.orders, orders)) this.update({ orders });
  }
  choose = (order: GameOrder) => this.save([...this.state.orders.filter(o => o.unitId !== order.unitId), order],{unitId:order.unitId,order});
  remove = (unitId: string) => this.save(this.state.orders.filter(o => o.unitId !== unitId),{unitId,order:null});
  private save(orders: GameOrder[],patch:OrderPatch) {
    if (this.state.finalizing) return Promise.resolve(false);
    this.update({ orders, saving: true }); // Synchronous; rendering never waits for the network.
    return this.enqueue(orders, false,patch);
  }
  finalize = () => {
    if (this.state.finalizing) return Promise.resolve(false);
    this.update({ finalizing: true, saving: true });
    // Capture the visible sheet now, behind every already queued save.
    return this.enqueue(this.state.orders, true);
  };
  private enqueue(orders: GameOrder[], finalize: boolean,patch?:OrderPatch) {
    const result = new Promise<boolean>(resolve => this.queue.push({ orders, finalize, patch, resolve }));
    void this.pump(); return result;
  }
  private async pump() {
    if (this.active) return;
    const job = this.queue.shift(); if (!job) return;
    this.active = job; const epoch = this.epoch;
    let accepted = false;
    try { accepted = await (job.patch&&this.sendPatch?this.sendPatch(job.patch):this.send(job.orders, job.finalize)); } catch { /* The request layer displays the transport error. */ }
    if (epoch !== this.epoch) return;
    this.active = null;
    if (!accepted) {
      // Later full sheets depend on this edit; discard them, including a queued finalize.
      this.queue.splice(0).forEach(next => next.resolve(false));
      this.update({ orders: this.authoritative, saving: false, finalizing: false, rollback: this.state.rollback + 1 });
    } else {
      this.authoritative = job.confirmed ?? job.orders;
      this.update({ ...(this.queue.length ? {} : { orders: this.authoritative }), saving: this.queue.length > 0,
        finalizing: job.finalize ? false : this.state.finalizing });
    }
    job.resolve(accepted);
    void this.pump();
  }
  invalidate() {
    this.epoch++; this.active?.resolve(false); this.active = null;
    this.queue.splice(0).forEach(job => job.resolve(false));
    this.update({ orders: this.authoritative, saving: false, finalizing: false, rollback: this.state.rollback + 1 });
  }
}
