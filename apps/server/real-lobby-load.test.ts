import { readFileSync } from 'node:fs';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { expect, it, vi } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import { datasetSchema } from '../../packages/shared/model';
import { sampleDataset } from '../../packages/map-core/sample';
import { RoomManager, serializePublicState } from '../../packages/online-core/room-manager';
import { createOnlineServer } from './server';
import type { ClientToServerEvents, ServerToClientEvents } from '../../packages/shared/online';

it('measures six live lobby connections with Kyoto regions and the standard scenario',async()=>{
  const dataset=datasetSchema.parse(JSON.parse(readFileSync('data/generated/regions.json','utf8')));
  const standardScenarioJson=readFileSync('data/default-scenarios/kyoto-standard.json','utf8');
  const manager=new RoomManager({sample:sampleDataset,'kyoto-kml':dataset},undefined,{standardScenarioJson});
  manager.preloadStandardScenario();
  const server=createOnlineServer(manager),delay=monitorEventLoopDelay({resolution:10});
  const clients:Socket<ServerToClientEvents,ClientToServerEvents>[]=[],packets=Array(6).fill(0) as number[];
  let reconnects=0,firstPublicAt=0,createAt=0,createAckMs=0,roomCode='';
  delay.enable();
  try{
    await new Promise<void>(resolve=>server.http.listen(0,'127.0.0.1',resolve));
    const address=server.http.address();if(!address||typeof address==='string')throw Error('missing address');
    for(let index=0;index<6;index++){
      const socket:Socket<ServerToClientEvents,ClientToServerEvents>=io(`http://127.0.0.1:${address.port}`,{autoConnect:false,reconnection:false,transports:['websocket']});
      clients.push(socket);let connected=0;
      socket.on('connect',()=>{if(connected++)reconnects++;});
      socket.on('publicState',()=>{packets[index]++;if(index===0&&!firstPublicAt)firstPublicAt=performance.now();});
      await new Promise<void>(resolve=>{socket.once('connect',resolve);socket.connect();});
      const started=performance.now();if(index===0)createAt=started;
      const response=index===0
        ? await socket.timeout(10000).emitWithAck('request',{action:'create',nickname:'host',preferredWardId:null,datasetKind:'kyoto-kml',scenario:'standard',operationId:crypto.randomUUID()})
        : await socket.timeout(10000).emitWithAck('request',{action:'join',nickname:`guest${index}`,preferredWardId:null,roomCode});
      expect(response.ok).toBe(true);if(!response.ok)throw Error('entry failed');
      if(index===0){createAckMs=performance.now()-started;roomCode=response.credentials!.roomCode;}
    }
    await vi.waitFor(()=>expect(packets.every(count=>count>0)).toBe(true));
    let preflightMs=0,serializationMs=0;
    serializePublicState(manager,manager.rooms.get(roomCode)!,false,false,timing=>{preflightMs=timing.preflightMs;serializationMs=timing.totalMs;});
    console.info('[real-lobby-test]',JSON.stringify({createAckMs:Math.round(createAckMs),firstPublicMs:Math.round(firstPublicAt-createAt),preflightMs,serializationMs,connectedSockets:server.io.of('/').sockets.size,reconnects,eventLoopMaxMs:Math.round(delay.max/1e6)}));
    expect(server.io.of('/').sockets.size).toBe(6);
    expect(reconnects).toBe(0);
    expect(createAckMs).toBeLessThan(10000);
  }finally{delay.disable();clients.forEach(client=>client.disconnect());await server.close();}
},30000);
