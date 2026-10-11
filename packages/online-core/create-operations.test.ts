import { afterEach, expect, it, vi } from 'vitest';
import { sampleConfig, sampleDataset } from '../map-core/sample';
import type { Credentials, OnlineRequest, OnlineResponse } from '../shared/online';
import { hostReconnectGraceMs, RoomManager } from './room-manager';

type CreateRequest=Extract<OnlineRequest,{action:'create'}>;
const managers:RoomManager[]=[];
function fixture(){
  const manager=new RoomManager({sample:sampleDataset,'kyoto-kml':sampleDataset});managers.push(manager);
  const request:CreateRequest={action:'create',nickname:'host',preferredWardId:null,datasetKind:'sample',config:structuredClone(sampleConfig),operationId:crypto.randomUUID()};
  const credentials=created(manager.request('host',request));
  return {manager,request,credentials,room:manager.rooms.get(credentials.roomCode)!};
}
function created(response:OnlineResponse):Credentials {
  if(!response.ok||!response.credentials)throw Error('fixture create failed');
  return response.credentials;
}
// Inspect only the index size: removal must release entries immediately, without a retry.
const operationCount=(manager:RoomManager)=>(Reflect.get(manager,'createOperations') as Map<string,unknown>).size;
afterEach(()=>{managers.splice(0).forEach(manager=>manager.dispose());vi.useRealTimers();});

it('replays the same request on the same socket without another room or player',()=>{
  const {manager,request,credentials,room}=fixture();
  const replay=created(manager.request('host',structuredClone(request)));
  expect(replay).toEqual(credentials);
  expect(manager.rooms.size).toBe(1);expect(room.players.size).toBe(1);
});

it('keeps a disconnected create recoverable and cancels host grace on replay',()=>{
  const {manager,request,credentials,room}=fixture();
  expect(manager.request('host',{action:'preference',preferredWardId:'26101'}).ok).toBe(true);
  manager.disconnect('host');expect(manager.hostGraceDeadline(room)).not.toBeNull();
  expect(operationCount(manager)).toBe(1);
  expect(created(manager.request('returned',request))).toEqual(credentials);
  expect(manager.hostGraceDeadline(room)).toBeNull();
  expect(room.players.get(credentials.playerId)?.preferredWardId).toBe('26101');
  expect(manager.rooms.size).toBe(1);expect(room.players.size).toBe(1);
});

it.each(['nickname','preference','dataset','scenario','config','region-setting'] as const)('rejects changed %s under a live operation ID without replacing the original socket',field=>{
  const {manager,request,credentials,room}=fixture(),changed=structuredClone(request);
  if(field==='nickname')changed.nickname='different';
  if(field==='preference')changed.preferredWardId='26101';
  if(field==='dataset')changed.datasetKind='kyoto-kml';
  if(field==='scenario')changed.scenario='standard';
  if(field==='config')changed.config!.mapId='different-map';
  if(field==='region-setting')changed.config!.regions[Object.keys(changed.config!.regions)[0]].enabled=false;
  for(const socket of ['other','host']){
    const rejected=manager.request(socket,changed);
    expect(rejected.ok).toBe(false);expect(rejected).not.toHaveProperty('credentials');
  }
  expect(manager.roomForSocket('other')).toBeUndefined();
  expect(room.players.get(credentials.playerId)?.socketId).toBe('host');
  expect(manager.roomForSocket('host')).toBe(room);
  expect(manager.rooms.size).toBe(1);expect(room.players.size).toBe(1);
  expect(created(manager.request('host',request))).toEqual(credentials);
});

it('accepts equivalent config objects with reordered keys',()=>{
  const {manager,request,credentials}=fixture(),reordered=structuredClone(request);
  reordered.config!.regions=Object.fromEntries(Object.entries(reordered.config!.regions).reverse());
  expect(created(manager.request('host',reordered))).toEqual(credentials);
});

it('releases the creator operation on leave while preserving the remaining lobby',()=>{
  const {manager,request,credentials,room}=fixture();
  const guest=created(manager.request('guest',{action:'join',nickname:'guest',preferredWardId:null,roomCode:room.code}));
  expect(manager.request('host',{action:'leave'}).ok).toBe(true);
  expect(operationCount(manager)).toBe(0);
  expect(manager.rooms.get(room.code)).toBe(room);expect(room.players.size).toBe(1);
  expect(room.hostId).toBe(guest.playerId);expect(manager.roomForSocket('guest')).toBe(room);
  expect(room.players.has(credentials.playerId)).toBe(false);
  const next=created(manager.request('next',{...request,nickname:'new host'}));
  expect(next.roomCode===room.code).toBe(false);
  expect(manager.rooms.size).toBe(2);expect(manager.roomForSocket('guest')).toBe(room);
});

it('releases a kicked creator operation after host transfer without deleting the lobby',()=>{
  vi.useFakeTimers();
  const {manager,credentials,room}=fixture();
  const guest=created(manager.request('guest',{action:'join',nickname:'guest',preferredWardId:null,roomCode:room.code}));
  manager.disconnect('host');vi.advanceTimersByTime(hostReconnectGraceMs+1);
  expect(room.hostId).toBe(guest.playerId);
  expect(manager.request('guest',{action:'kick',playerId:credentials.playerId}).ok).toBe(true);
  expect(operationCount(manager)).toBe(0);
  expect(manager.rooms.get(room.code)).toBe(room);expect(room.players.size).toBe(1);
  expect(manager.request('returned',{action:'reconnect',...credentials}).ok).toBe(false);
  expect(manager.roomForSocket('guest')).toBe(room);
});

it('uses the existing last-participant cleanup for both the room and operation',()=>{
  const {manager}=fixture();
  expect(manager.request('host',{action:'leave'}).ok).toBe(true);
  expect(manager.rooms.size).toBe(0);expect(operationCount(manager)).toBe(0);
});
