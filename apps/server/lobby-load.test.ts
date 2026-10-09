import { expect, it, vi } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import { createOnlineServer } from './server';
import { RoomManager } from '../../packages/online-core/room-manager';
import { sampleConfig, sampleDataset } from '../../packages/map-core/sample';
import { WARDS } from '../../packages/shared/model';
import type { ClientToServerEvents, ServerToClientEvents } from '../../packages/shared/online';

it('6人の集合で地図転送を発生させず、本人用snapshotの重複配信も避ける', async () => {
  const manager=new RoomManager({sample:sampleDataset,'kyoto-kml':sampleDataset});
  const server=createOnlineServer(manager);
  await new Promise<void>(resolve=>server.http.listen(0,'127.0.0.1',resolve));
  const address=server.http.address();
  if(!address||typeof address==='string')throw Error('missing address');
  const clients:Socket<ServerToClientEvents,ClientToServerEvents>[]=[];
  const publicPackets=Array(6).fill(0) as number[],privatePackets=Array(6).fill(0) as number[],maps=Array(6).fill(0) as number[];
  try {
    let roomCode='';
    for(let i=0;i<6;i++){
      const client:Socket<ServerToClientEvents,ClientToServerEvents>=io(`http://127.0.0.1:${address.port}`,{transports:['websocket'],autoConnect:false,reconnection:false});
      clients.push(client);
      client.on('publicState',v=>{publicPackets[i]++;if(v.map)maps[i]++;});
      client.on('privateState',()=>privatePackets[i]++);
      await new Promise<void>(resolve=>{client.once('connect',resolve);client.connect();});
      const result=i===0
        ? await client.timeout(5000).emitWithAck('request',{action:'create',nickname:'host',preferredWardId:null,datasetKind:'sample',config:sampleConfig})
        : await client.timeout(5000).emitWithAck('request',{action:'join',nickname:`guest${i}`,roomCode,preferredWardId:null});
      expect(result.ok).toBe(true);
      if(!result.ok)throw Error(result.errors.join(','));
      if(i===0)roomCode=result.credentials!.roomCode;
      await vi.waitFor(()=>expect(privatePackets[i]).toBe(1));
    }
    await vi.waitFor(()=>expect(publicPackets.every(count=>count>0)).toBe(true));
    expect(maps).toEqual([0,0,0,0,0,0]);
    expect(privatePackets).toEqual([1,1,1,1,1,1]);
    const changed=await clients[2].timeout(5000).emitWithAck('request',{action:'preference',preferredWardId:WARDS[2].id});
    expect(changed.ok).toBe(true);
    await vi.waitFor(()=>expect(privatePackets[2]).toBe(2));
    expect(privatePackets).toEqual([1,1,2,1,1,1]);
    expect(maps).toEqual([0,0,0,0,0,0]);
  } finally {
    clients.forEach(client=>client.disconnect());
    await server.close();
  }
},20000);
