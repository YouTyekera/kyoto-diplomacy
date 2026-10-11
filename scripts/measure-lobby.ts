import { readFileSync } from 'node:fs';
import { monitorEventLoopDelay, performance } from 'node:perf_hooks';
import { io, type Socket } from 'socket.io-client';
import { datasetSchema } from '../packages/shared/model';
import { sampleDataset } from '../packages/map-core/sample';
import { RoomManager, serializePublicState } from '../packages/online-core/room-manager';
import { createOnlineServer } from '../apps/server/server';
import type { ClientToServerEvents, ServerToClientEvents } from '../packages/shared/online';

const dataset=datasetSchema.parse(JSON.parse(readFileSync('data/generated/regions.json','utf8')));
const standardScenarioJson=readFileSync('data/default-scenarios/kyoto-standard.json','utf8');
const manager=new RoomManager({sample:sampleDataset,'kyoto-kml':dataset},undefined,{standardScenarioJson});
const preloadStarted=performance.now();manager.preloadStandardScenario();const preloadMs=performance.now()-preloadStarted;
const server=createOnlineServer(manager);
const delay=monitorEventLoopDelay({resolution:10});delay.enable();
const clients:Socket<ServerToClientEvents,ClientToServerEvents>[]=[];
const packets=Array.from({length:6},()=>({public:0,private:0,reconnects:0}));
const snapshots:number[]=[];
let createStarted=0;
try {
  await new Promise<void>(resolve=>server.http.listen(0,'127.0.0.1',resolve));
  const address=server.http.address();if(!address||typeof address==='string')throw Error('missing address');
  const url=`http://127.0.0.1:${address.port}`;
  let roomCode='';
  const createTimes:number[]=[];
  for(let index=0;index<6;index++){
    const socket=io(url,{autoConnect:false,reconnection:false,transports:['websocket']});clients.push(socket);
    socket.on('publicState',()=>{packets[index].public++;if(index===0&&snapshots.length===0)snapshots.push(performance.now());});
    socket.on('privateState',()=>packets[index].private++);
    let connects=0;socket.on('connect',()=>{if(connects++)packets[index].reconnects++;});
    await new Promise<void>(resolve=>{socket.once('connect',resolve);socket.connect();});
    const started=performance.now();
    if(index===0)createStarted=started;
    const response=index===0
      ? await socket.timeout(60000).emitWithAck('request',{action:'create',nickname:'host',preferredWardId:null,datasetKind:'kyoto-kml',scenario:'standard',operationId:crypto.randomUUID()})
      : await socket.timeout(60000).emitWithAck('request',{action:'join',nickname:`guest${index}`,roomCode,preferredWardId:null});
    if(!response.ok)throw Error(response.errors.join(','));
    createTimes.push(performance.now()-started);
    if(index===0)roomCode=response.credentials!.roomCode;
  }
  await new Promise(resolve=>setTimeout(resolve,100));
  let preflightMs=0,serializationMs=0;
  serializePublicState(manager,manager.rooms.get(roomCode)!,false,false,value=>{preflightMs=value.preflightMs;serializationMs=value.totalMs;});
  console.log(JSON.stringify({preloadMs:Math.round(preloadMs),createAckMs:Math.round(createTimes[0]),joinAckMs:createTimes.slice(1).map(Math.round),firstPublicMs:snapshots.length?Math.round(snapshots[0]-createStarted):null,preflightMs:Math.round(preflightMs*100)/100,serializationMs:Math.round(serializationMs*100)/100,connectedSockets:server.io.of('/').sockets.size,reconnections:packets.reduce((sum,p)=>sum+p.reconnects,0),packets,eventLoopP99Ms:Math.round(delay.percentile(99)/1e6),eventLoopMaxMs:Math.round(delay.max/1e6)}));
} finally {delay.disable();clients.forEach(client=>client.disconnect());await server.close();}
