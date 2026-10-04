import { it,expect,vi } from 'vitest';
import { io,type Socket } from 'socket.io-client';
import { createOnlineServer } from '../../apps/server/server';
import { sampleConfig,sampleDataset } from '../map-core/sample';
import { RoomManager } from './room-manager';
import { type ClientToServerEvents,type ServerToClientEvents,type PublicRoomView,type PrivatePlayerView,type Credentials } from '../shared/online';
import { WARDS } from '../shared/model';
import { noEvents } from '../game-core/events';
import { completeSyntheticScenario } from '../../tests/scenario-fixture';

it('実Socket.IOで3人を認証、秘密draft/ready、同時最終確定の1回裁定、再接続を検証',async()=>{
  const config=structuredClone(sampleConfig);
  for(const [id,ward] of [['sample-a','26101'],['sample-c','26102'],['sample-d','26103']] as const)config.regions[id].startingUnit={ownerWardId:ward,type:'army'};
  const fixture=completeSyntheticScenario(sampleDataset,config);
  const manager=new RoomManager({sample:fixture.dataset,'kyoto-kml':fixture.dataset},undefined,{settings:noEvents}),server=createOnlineServer(manager);
  await new Promise<void>(resolve=>server.http.listen(0,'127.0.0.1',resolve));
  const address=server.http.address();if(!address||typeof address==='string')throw new Error('address missing');
  const port=address.port;
  const clients:Socket<ServerToClientEvents,ClientToServerEvents>[]=[],publicViews:(PublicRoomView|undefined)[]=[],privateViews:(PrivatePlayerView|undefined)[]=[],credentials:Credentials[]=[];
  const mapPackets:number[]=[];
  function createClient(i:number) {
    const client:Socket<ServerToClientEvents,ClientToServerEvents>=io(`http://127.0.0.1:${port}`,{autoConnect:false,forceNew:true});
    client.on('publicState',v=>{publicViews[i]=v;if(v.map)mapPackets[i]=(mapPackets[i]??0)+1;});client.on('privateState',v=>{privateViews[i]=v;});clients.push(client);
    return new Promise<typeof client>(resolve=>{client.once('connect',()=>resolve(client));client.connect();});
  }
  try {
    for(let i=0;i<3;i++)await createClient(i);
    const created=await clients[0].timeout(5000).emitWithAck('request',{action:'create',nickname:'host',preferredWardId:'26101',datasetKind:'sample',config:fixture.config});expect(created.ok).toBe(true);if(!created.ok)throw new Error('create failed');credentials.push(created.credentials!);
    for(let i=1;i<3;i++){const joined=await clients[i].timeout(5000).emitWithAck('request',{action:'join',nickname:`player${i}`,preferredWardId:WARDS[i].id,roomCode:credentials[0].roomCode});expect(joined.ok).toBe(true);if(joined.ok)credentials.push(joined.credentials!);}
    expect((await clients[1].timeout(5000).emitWithAck('request',{action:'leave'})).ok).toBe(true);
    const rejoined=await clients[1].timeout(5000).emitWithAck('request',{action:'join',nickname:'player1',preferredWardId:'26102',roomCode:credentials[0].roomCode});expect(rejoined.ok).toBe(true);if(rejoined.ok)credentials[1]=rejoined.credentials!;
    expect((await clients[0].timeout(5000).emitWithAck('request',{action:'start',yearLimit:null})).ok).toBe(true);
    await vi.waitFor(()=>expect(privateViews[2]?.wardId).toBe('26103'));
    expect(mapPackets.slice(0,3)).toEqual([1,2,1]);
    const phaseKey=publicViews[0]!.game!.phaseKey;
    expect((await clients[0].timeout(5000).emitWithAck('request',{action:'orders',phaseKey,orders:[{type:'move',unitId:'initial-sample-a',destination:'sample-b'}],finalize:true})).ok).toBe(true);
    await vi.waitFor(()=>expect(publicViews[1]!.players[0].finalized).toBe(true));
    for(let i=1;i<3;i++){expect(privateViews[i]!.orders).toEqual([]);expect(JSON.stringify(publicViews[i])).not.toContain('"type":"move"');expect(JSON.stringify(publicViews[i])).not.toContain(credentials[0].reconnectToken);}
    const requests=await Promise.all([
      clients[1].timeout(5000).emitWithAck('request',{action:'orders',phaseKey,orders:[],finalize:true}),
      clients[2].timeout(5000).emitWithAck('request',{action:'orders',phaseKey,orders:[],finalize:true}),
      clients[2].timeout(5000).emitWithAck('request',{action:'orders',phaseKey,orders:[],finalize:true}),
    ]);
    expect(requests.filter(r=>r.ok)).toHaveLength(2);expect(manager.rooms.get(credentials[0].roomCode)!.game!.movementResolutions).toBe(1);
    await vi.waitFor(()=>expect(publicViews[1]?.game?.season).toBe('autumn'));
    expect(publicViews[1]?.game?.lastResult?.movement?.orderResults.find(r=>r.order.unitId==='initial-sample-a')?.reason).toBe('moved');
    clients[0].disconnect();await vi.waitFor(()=>expect(publicViews[1]?.players[0].connected).toBe(false));
    const replacement=await createClient(3);const restore=await replacement.timeout(5000).emitWithAck('request',{action:'reconnect',...credentials[0]});expect(restore.ok).toBe(true);
    await vi.waitFor(()=>expect(privateViews[3]?.playerId).toBe(credentials[0].playerId));expect(privateViews[3]?.orders).toEqual([]);expect(publicViews[3]?.game?.victoryTargetSC).toBe(23);
    // Newly drafted next-phase orders stay private even while old public result is available.
    await replacement.timeout(5000).emitWithAck('request',{action:'orders',phaseKey:publicViews[3]!.game!.phaseKey,orders:[{type:'move',unitId:'initial-sample-a',destination:'sample-a'}],finalize:false});
    await vi.waitFor(()=>expect(privateViews[3]?.orders).toHaveLength(1));expect(privateViews[1]?.orders).toEqual([]);
    expect(mapPackets).toEqual([1,2,1,1]);
  }finally {for(const client of clients)client.disconnect();await server.close();}
},15000);
