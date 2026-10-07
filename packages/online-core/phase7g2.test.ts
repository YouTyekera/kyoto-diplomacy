import {expect,it,vi} from 'vitest';
import {io,type Socket} from 'socket.io-client';
import {createOnlineServer} from '../../apps/server/server';
import * as serialization from './room-manager';
import {RoomManager} from './room-manager';
import * as rules from '../rules-core/validation';
import {sampleDataset} from '../map-core/sample';
import {createConfig,WARDS} from '../shared/model';
import {completeSyntheticScenario} from '../../tests/scenario-fixture';
import {noEvents} from '../game-core';
import {OptimisticOrders} from '../../apps/web/src/optimistic-orders';
import type {ClientToServerEvents,ServerToClientEvents,OnlineRequest,TurnHistoryUpdate,PrivatePlayerView} from '../shared/online';
import type {GameOrder} from '../shared/events';

it('7G.2 real Socket.IO: 5 players x 10 armies, FIFO patches, no state/history publication, selected-only cached legality',async()=>{
  const dataset=structuredClone(sampleDataset);dataset.regions=Array.from({length:50},(_,i)=>{
    const region=structuredClone(sampleDataset.regions[0]),x=135+i*.002,y=35;region.regionId=`load-${i}`;region.name=`負荷${i}`;region.wardId=WARDS[Math.floor(i/10)].id;
    region.geometry={type:'Polygon',coordinates:[[[x,y],[x+.002,y],[x+.002,y+.002],[x,y+.002],[x,y]]]};return region;
  });
  const config=createConfig(dataset);for(const region of dataset.regions)config.regions[region.regionId]={enabled:true,isSupplyCenter:true,homeWardId:region.wardId,startingUnit:{type:'army',ownerWardId:region.wardId}};
  const fixture=completeSyntheticScenario(dataset,config),manager=new RoomManager({sample:fixture.dataset,'kyoto-kml':fixture.dataset},undefined,{settings:noEvents}),server=createOnlineServer(manager);
  await new Promise<void>(resolve=>server.http.listen(0,'127.0.0.1',resolve));const address=server.http.address();if(!address||typeof address==='string')throw Error('port');
  const clients:Socket<ServerToClientEvents,ClientToServerEvents>[]=[],privateViews:(PrivatePlayerView|undefined)[]=[],histories:TurnHistoryUpdate[][]=Array.from({length:5},()=>[]);
  const packets={public:0,private:0,history:0,reconnect:0},ackTimes:number[]=[],wireSizes:number[]=[],ackSizes:number[]=[];
  const publicSpy=vi.spyOn(serialization,'serializePublicState'),privateSpy=vi.spyOn(serialization,'serializePrivateState'),legalSpy=vi.spyOn(rules,'legalOrders');
  try{
    for(let i=0;i<5;i++){
      const client:Socket<ServerToClientEvents,ClientToServerEvents>=io(`http://127.0.0.1:${address.port}`,{autoConnect:false,transports:['websocket'],forceNew:true});clients.push(client);
      client.on('publicState',()=>packets.public++);client.on('privateState',view=>{packets.private++;privateViews[i]=view;});client.on('turnHistory',value=>{packets.history++;histories[i].push(value);});client.on('disconnect',()=>packets.reconnect++);
      await new Promise<void>(resolve=>{client.once('connect',resolve);client.connect();});
    }
    const created=await clients[0].timeout(5000).emitWithAck('request',{action:'create',nickname:'load0',preferredWardId:WARDS[0].id,datasetKind:'sample',config:fixture.config});if(!created.ok)throw Error(created.errors.join());
    const credentials=created.credentials!;
    for(let i=1;i<5;i++)expect((await clients[i].timeout(5000).emitWithAck('request',{action:'join',nickname:`load${i}`,preferredWardId:WARDS[i].id,roomCode:credentials.roomCode})).ok).toBe(true);
    expect((await clients[0].timeout(5000).emitWithAck('request',{action:'start',yearLimit:3})).ok).toBe(true);
    await vi.waitFor(()=>expect(privateViews.every(view=>!!view?.phaseKey)).toBe(true));
    const room=manager.rooms.get(credentials.roomCode)!,game=room.game!,key=manager.phaseKey(room)!;expect(game.state.board.units).toHaveLength(50);
    expect(privateViews.every(view=>Object.keys(view!.legalOrders).length===0)).toBe(true);
    const own=clients.map((_,i)=>game.state.board.units.filter(u=>u.ownerWardId===privateViews[i]!.wardId));expect(own.map(units=>units.length)).toEqual([10,10,10,10,10]);
    const alternatives=new Map<string,GameOrder>();
    for(const [i,units]of own.entries())for(const unit of units){
      const result=await clients[i].timeout(5000).emitWithAck('request',{action:'legal-orders',phaseKey:key,unitId:unit.unitId});if(!result.ok||!result.legalOrders)throw Error('legal query');
      expect(result.legalOrders.unitId).toBe(unit.unitId);alternatives.set(unit.unitId,result.legalOrders.orders.find((o:GameOrder)=>o.type==='move')??{type:'hold',unitId:unit.unitId});
    }
    expect(legalSpy).toHaveBeenCalledTimes(50);
    const legacyPublic=publicSpy.mock.calls.length,legacyPrivate=privateSpy.mock.calls.length,legacyHistory=packets.history;
    const legacyDraft=await clients[0].timeout(5000).emitWithAck('request',{action:'orders',phaseKey:key,orders:[],finalize:false});expect(legacyDraft.ok).toBe(true);
    expect([publicSpy.mock.calls.length,privateSpy.mock.calls.length,packets.history]).toEqual([legacyPublic,legacyPrivate,legacyHistory]);
    expect(publicSpy.mock.calls.at(-1)?.[3]).toBe(false);
    for(const client of clients)await client.timeout(5000).emitWithAck('request',{action:'legal-orders',phaseKey:key,unitId:own[clients.indexOf(client)][0].unitId});
    expect(legalSpy).toHaveBeenCalledTimes(50);
    packets.public=packets.private=packets.history=packets.reconnect=0;publicSpy.mockClear();privateSpy.mockClear();legalSpy.mockClear();
    const sequences=clients.map(()=>0),sent:OnlineRequest[][]=clients.map(()=>[]);
    const controllers=clients.map((client,i)=>new OptimisticOrders([],async(orders,finalize)=>(await client.timeout(5000).emitWithAck('request',{action:'orders',phaseKey:key,orders,finalize})).ok,async patch=>{
      const request:OnlineRequest={action:'order-patch',phaseKey:key,...patch,sequence:++sequences[i]};sent[i].push(request);wireSizes.push(Buffer.byteLength(JSON.stringify(request)));
      const start=performance.now(),response=await client.timeout(5000).emitWithAck('request',request);ackTimes.push(performance.now()-start);ackSizes.push(Buffer.byteLength(JSON.stringify(response)));return response.ok;
    }));
    const saves:Promise<boolean>[]=[];
    for(let edit=0;edit<20;edit++)for(const [i,controller]of controllers.entries()){
      const unit=own[i][edit%10];saves.push(controller.choose(edit<10?alternatives.get(unit.unitId)!:{type:'hold',unitId:unit.unitId}));
    }
    expect(controllers.every(controller=>controller.snapshot().orders.length===10)).toBe(true);
    expect((await Promise.all(saves)).every(Boolean)).toBe(true);
    expect(sent.every(requests=>requests.length===20&&requests.every(request=>request.action==='order-patch'&&!('orders'in request)&&!('history'in request)))).toBe(true);
    for(const [i,controller]of controllers.entries())expect(manager.playerForSocket(clients[i].id!)!.submission.orders).toEqual(controller.snapshot().orders);
    expect(packets).toEqual({public:0,private:0,history:0,reconnect:0});expect(publicSpy).not.toHaveBeenCalled();expect(privateSpy).not.toHaveBeenCalled();expect(legalSpy).not.toHaveBeenCalled();
    const sorted=[...ackTimes].sort((a,b)=>a-b),p50=sorted[Math.ceil(sorted.length*.5)-1],p95=sorted[Math.ceil(sorted.length*.95)-1],rollback=controllers.reduce((total,c)=>total+c.snapshot().rollback,0);
    expect(p95).toBeLessThan(500);expect(rollback).toBe(0);
    console.info('PHASE7G2_LOAD',JSON.stringify({players:5,armies:50,patches:ackTimes.length,p50Ms:+p50.toFixed(2),p95Ms:+p95.toFixed(2),publicPublish:packets.public,privatePublish:packets.private,historySend:packets.history,publicSerialize:publicSpy.mock.calls.length,privateSerialize:privateSpy.mock.calls.length,legalOrdersCalculations:legalSpy.mock.calls.length,warmupLegalCalculations:50,rollback,reconnect:packets.reconnect,requestBytesMax:Math.max(...wireSizes),requestBytesMean:Math.round(wireSizes.reduce((a,b)=>a+b,0)/wireSizes.length),ackBytesMax:Math.max(...ackSizes)}));
    expect((await clients[0].timeout(5000).emitWithAck('request',{action:'order-patch',phaseKey:key,unitId:own[0][0].unitId,order:{type:'hold',unitId:own[0][0].unitId},sequence:1})).ok).toBe(false);
    expect((await clients[0].timeout(5000).emitWithAck('request',{action:'order-patch',phaseKey:key,unitId:own[1][0].unitId,order:null,sequence:21})).ok).toBe(false);
    expect((await clients[0].timeout(5000).emitWithAck('request',{action:'orders',phaseKey:key,orders:[{type:'move',unitId:own[0][0].unitId,destination:'missing'}],finalize:true})).ok).toBe(false);
    // Equipment-dependent candidates refresh without recomputing cached ordinary moves/supports.
    game.state.events.inventory.push({equipmentId:'load-bike',type:'bicycle',ownerWardId:own[0][0].ownerWardId});
    const firstBike=manager.selectedLegalOrders(room,manager.playerForSocket(clients[0].id!)!,own[0][0].unitId).find(o=>o.type==='bicycle-move')!;
    expect(firstBike).toBeDefined();
    expect((await clients[0].timeout(5000).emitWithAck('request',{action:'order-patch',phaseKey:key,unitId:own[0][0].unitId,order:firstBike,sequence:21})).ok).toBe(true);
    expect(manager.selectedLegalOrders(room,manager.playerForSocket(clients[0].id!)!,own[0][1].unitId).some(o=>o.type==='bicycle-move')).toBe(false);
    expect((await clients[0].timeout(5000).emitWithAck('request',{action:'order-patch',phaseKey:key,unitId:own[0][0].unitId,order:null,sequence:22})).ok).toBe(true);
    expect(manager.selectedLegalOrders(room,manager.playerForSocket(clients[0].id!)!,own[0][1].unitId).some(o=>o.type==='bicycle-move')).toBe(true);
    game.state.events.inventory=[];
    expect(legalSpy).not.toHaveBeenCalled();
    const finalizeCalls=publicSpy.mock.calls.length;
    const finalized=await Promise.all(controllers.map(controller=>controller.finalize()));expect(finalized.every(Boolean)).toBe(true);expect(game.playback?.stage).toBe('reveal');expect(publicSpy.mock.calls.length).toBeGreaterThan(finalizeCalls);
    const id=game.playback!.next.presentation!.id;
    expect((await clients[0].timeout(5000).emitWithAck('request',{action:'playback',presentationId:id,control:'start'})).ok).toBe(true);
    expect((await clients[0].timeout(5000).emitWithAck('request',{action:'playback',presentationId:id,control:'skip'})).ok).toBe(true);
    await vi.waitFor(()=>expect(histories.every(updates=>updates.at(-1)?.snapshots.length===1)).toBe(true));
    expect(game.history).toHaveLength(1);expect(serializeWithoutHistory()).toBe(false);
    function serializeWithoutHistory(){return 'history'in serialization.serializePublicState(manager,room,false,false).game!;}
    packets.public=packets.private=packets.history=0;
    const nextKey=manager.phaseKey(room)!,unit=game.state.board.units.find(u=>u.ownerWardId===privateViews[0]!.wardId)!;
    expect((await clients[0].timeout(5000).emitWithAck('request',{action:'order-patch',phaseKey:nextKey,unitId:unit.unitId,order:{type:'hold',unitId:unit.unitId},sequence:1})).ok).toBe(true);
    expect(packets).toEqual({public:0,private:0,history:0,reconnect:0});
    const restored=new Promise<TurnHistoryUpdate>(resolve=>clients[0].once('turnHistory',resolve));expect((await clients[0].timeout(5000).emitWithAck('request',{action:'history'})).ok).toBe(true);
    expect((await restored).snapshots).toEqual(game.history);
    const snapshot=structuredClone(game.history);clients[0].disconnect();clients[0].connect();await new Promise<void>(resolve=>clients[0].once('connect',resolve));
    const reconnected=new Promise<TurnHistoryUpdate>(resolve=>clients[0].once('turnHistory',resolve));expect((await clients[0].timeout(5000).emitWithAck('request',{action:'reconnect',...credentials})).ok).toBe(true);expect((await reconnected).snapshots).toEqual(snapshot);
  }finally{publicSpy.mockRestore();privateSpy.mockRestore();legalSpy.mockRestore();for(const client of clients)client.disconnect();await server.close();}
},30000);
