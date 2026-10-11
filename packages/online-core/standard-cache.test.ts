import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { datasetSchema } from '../shared/model';
import { sampleDataset } from '../map-core/sample';
import { RoomManager } from './room-manager';

it('shares only the validated standard scenario and replays a timed-out create by operation ID',()=>{
  const dataset=datasetSchema.parse(JSON.parse(readFileSync('data/generated/regions.json','utf8')));
  const standardScenarioJson=readFileSync('data/default-scenarios/kyoto-standard.json','utf8');
  const manager=new RoomManager({sample:sampleDataset,'kyoto-kml':dataset},undefined,{standardScenarioJson});
  manager.preloadStandardScenario();
  const operationId=crypto.randomUUID();
  const create=(socketId:string,id:string)=>manager.request(socketId,{action:'create',nickname:'host',preferredWardId:null,datasetKind:'kyoto-kml',scenario:'standard',operationId:id});
  const first=create('first',operationId),replayed=create('retry',operationId),second=create('second',crypto.randomUUID());
  expect(first.ok&&replayed.ok&&second.ok).toBe(true);
  if(!first.ok||!replayed.ok||!second.ok)throw Error('create failed');
  expect(replayed.credentials).toEqual(first.credentials);
  expect(manager.rooms.size).toBe(2);
  expect(manager.roomForSocket('first')).toBeUndefined();
  const roomA=manager.rooms.get(first.credentials!.roomCode)!,roomB=manager.rooms.get(second.credentials!.roomCode)!;
  expect(roomA.scenario).toBe(roomB.scenario);
  expect(roomA.map).toBe(roomB.map);
  expect(roomA.players).not.toBe(roomB.players);
  expect(roomA.players.get(first.credentials!.playerId)).not.toBe(roomB.players.get(second.credentials!.playerId));
  expect(manager.request('retry',{action:'lobby-years',yearLimit:4}).ok).toBe(true);
  expect(roomA.lobbyMaxYears).toBe(4);
  expect(roomB.lobbyMaxYears).toBeUndefined();
  for(const [room,index] of [[roomA,0],[roomB,1]] as const)for(let guest=0;guest<2;guest++){
    expect(manager.request(`guest-${index}-${guest}`,{action:'join',nickname:`guest${guest}`,preferredWardId:null,roomCode:room.code}).ok).toBe(true);
  }
  expect(manager.request('retry',{action:'start',yearLimit:4}).ok).toBe(true);
  expect(manager.request('second',{action:'start',yearLimit:null}).ok).toBe(true);
  expect(roomA.game?.state).toBeTruthy();expect(roomB.game?.state).toBeTruthy();
  expect(roomA.game?.state).not.toBe(roomB.game?.state);
  expect(roomA.game?.state.board).not.toBe(roomB.game?.state.board);
  expect(roomA.game?.state.maxYears).toBe(4);
  expect(roomB.game?.state.maxYears).not.toBe(4);
  manager.dispose();
},30000);
