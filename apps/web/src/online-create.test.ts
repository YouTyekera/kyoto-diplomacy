import { expect, it, vi } from 'vitest';
import { sampleConfig, sampleDataset } from '../../../packages/map-core/sample';
import { RoomManager } from '../../../packages/online-core/room-manager';
import type { OnlineRequest } from '../../../packages/shared/online';
import { OnlineCreateOperation } from './online-create';

const input=():Extract<OnlineRequest,{action:'create'}>=>({action:'create',nickname:'original',preferredWardId:null,datasetKind:'sample',config:structuredClone(sampleConfig)});

it('pins both the original content and ID across lost replies and changed UI inputs',()=>{
  const manager=new RoomManager({sample:sampleDataset,'kyoto-kml':sampleDataset}),ids=vi.fn(()=>crypto.randomUUID());
  const operation=new OnlineCreateOperation(ids),form=input(),first=operation.prepare(form);
  try{
    // The server committed the room, but its reply did not reach the browser.
    const created=manager.request('first',first);expect(created.ok).toBe(true);
    if(!created.ok)throw Error('fixture create failed');
    manager.disconnect('first');
    form.nickname='edited';form.preferredWardId='26101';form.config!.mapId='edited-map';
    const retry=operation.prepare(form);
    expect(retry).toEqual(first);expect(ids).toHaveBeenCalledTimes(1);
    for(let attempt=0;attempt<5;attempt++){
      const outgoing=operation.prepare({...form,nickname:`edited again ${attempt}`});
      expect(outgoing).toEqual(first);
      expect(manager.request('returned',outgoing)).toEqual(created);
    }
    expect(manager.rooms.size).toBe(1);
    expect(manager.playerForSocket('returned')?.nickname).toBe('original');
    operation.settle(retry.operationId);
    const next=operation.prepare(form);
    expect(next.nickname).toBe('edited');expect(next.operationId===first.operationId).toBe(false);
    expect(ids).toHaveBeenCalledTimes(2);
  }finally{manager.dispose();}
});

it('protects the pending request from caller mutation and ignores stale completion',()=>{
  const operation=new OnlineCreateOperation(),first=operation.prepare(input());
  first.config!.mapId='mutated-by-caller';
  expect(operation.prepare(input()).config!.mapId).toBe(sampleConfig.mapId);
  operation.settle(first.operationId);
  const next=operation.prepare(input());
  operation.settle(first.operationId);
  expect(operation.prepare({...input(),nickname:'another edit'})).toEqual(next);
});
