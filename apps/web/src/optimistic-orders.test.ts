import { describe, it, expect, vi } from 'vitest';
import type { GameOrder } from '../../../packages/shared/events';
import { OptimisticOrders } from './optimistic-orders';

const move = (unitId: string, destination = 'next'): GameOrder => ({ type: 'move', unitId, destination });
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
function fixture(initial: GameOrder[] = []) {
  const completions: ((ok: boolean) => void)[] = [];
  const send = vi.fn<(orders: GameOrder[], finalize: boolean) => Promise<boolean>>(() => new Promise<boolean>(resolve => completions.push(resolve)));
  const sheet = new OptimisticOrders(initial, send);
  return { sheet, send, completions };
}
describe('optimistic order sheets (presentation only)', () => {
  it('shows orders synchronously before ack and accepts other armies while saving', async () => {
    const f = fixture(); const first = f.sheet.choose(move('A')), second = f.sheet.choose(move('B'));
    expect(f.sheet.snapshot().orders).toEqual([move('A'), move('B')]);
    expect(f.send).toHaveBeenCalledTimes(1);
    f.sheet.receive([move('A')]); // An older authoritative sheet must not erase B.
    expect(f.sheet.snapshot().orders).toHaveLength(2);
    f.completions[0](true); await tick(); expect(await first).toBe(true);
    expect(f.send.mock.calls[1]).toEqual([[move('A'), move('B')], false]);
    f.completions[1](true); expect(await second).toBe(true); expect(f.sheet.snapshot().saving).toBe(false);
  });
  it('refusal rolls back to the latest confirmed sheet and cancels dependent saves/finalize', async () => {
    const initial: GameOrder[] = [{ type: 'hold', unitId: 'A' }], f = fixture(initial);
    const first = f.sheet.choose(move('A')), later = f.sheet.choose(move('B')), finalize = f.sheet.finalize();
    f.completions[0](false); expect(await first).toBe(false); expect(await later).toBe(false); expect(await finalize).toBe(false);
    expect(f.sheet.snapshot()).toMatchObject({ orders: initial, saving: false, finalizing: false, rollback: 1 });
    expect(f.send).toHaveBeenCalledTimes(1);
  });
  it('fast edits never send concurrently or restore an older draft; finalize carries the newest sheet', async () => {
    const f = fixture(); const first = f.sheet.choose(move('A', 'one')), second = f.sheet.choose(move('A', 'two')),
      third = f.sheet.choose(move('B')), finalize = f.sheet.finalize();
    expect(await f.sheet.choose(move('C'))).toBe(false); // Freeze edits as soon as finalize is pressed.
    expect(f.sheet.snapshot().orders).toEqual([move('A', 'two'), move('B')]);
    for (let i = 0; i < 4; i++) {
      expect(f.send).toHaveBeenCalledTimes(i + 1); f.completions[i](true); await tick();
      expect(f.sheet.snapshot().orders).toEqual([move('A', 'two'), move('B')]);
    }
    expect(await Promise.all([first, second, third, finalize])).toEqual([true, true, true, true]);
    expect(f.send.mock.calls[3]).toEqual([[move('A', 'two'), move('B')], true]);
  });
  it.each<GameOrder>([
    { type: 'support-hold', unitId: 'A', targetUnitId: 'B' },
    { type: 'support-move', unitId: 'A', targetUnitId: 'B', destination: 'next' },
    { type: 'bicycle-move', unitId: 'A', equipmentId: 'bike', viaRegionId: 'via', destination: 'next' },
    { type: 'deploy-barricade', unitId: 'A', equipmentId: 'wall', targetRegionId: 'next' },
  ])('uses the same immediate sheet/queue for $type and removal', async order => {
    const f = fixture(); const save = f.sheet.choose(order), remove = f.sheet.remove('A');
    expect(f.sheet.snapshot().orders).toEqual([]); f.completions[0](true); await tick();
    expect(f.send.mock.calls[1]).toEqual([[], false]); f.completions[1](true);
    expect(await save).toBe(true); expect(await remove).toBe(true);
  });
  it('disconnect/context change cancels queued requests and ignores late acknowledgements', async () => {
    const f = fixture(); const first = f.sheet.choose(move('A')), second = f.sheet.choose(move('B'));
    f.sheet.invalidate(); expect(await first).toBe(false); expect(await second).toBe(false);
    f.sheet.receive([{ type: 'hold', unitId: 'A' }]); f.completions[0](true); await tick();
    expect(f.send).toHaveBeenCalledTimes(1); expect(f.sheet.snapshot().orders).toEqual([{ type: 'hold', unitId: 'A' }]);
  });
  it('transport exceptions also rollback without leaving a pending finalize', async () => {
    const sheet = new OptimisticOrders([], async () => { throw Error('timeout'); });
    expect(await sheet.choose(move('A'))).toBe(false); expect(sheet.snapshot()).toMatchObject({ orders: [], saving: false, finalizing: false });
  });
  it('finalize synchronizes the server-normalized sheet including automatic holds', async () => {
    const f = fixture([move('A')]); const result = f.sheet.finalize();
    const confirmed: GameOrder[] = [move('A'), { type: 'hold', unitId: 'B' }];
    f.sheet.receive(confirmed); f.completions[0](true); expect(await result).toBe(true);
    expect(f.sheet.snapshot().orders).toEqual(confirmed);
  });
});
