import { describe,it,expect } from 'vitest';
import { sampleConfig,sampleDataset } from '../map-core/sample';
import { serializePrivateState,serializePublicState } from './room-manager';
import { RoomManager } from '../../tests/immediate-playback-manager';
import { noEvents,effectiveMap } from '../game-core/events';
import type { Credentials,OnlineResponse } from '../shared/online';
import type { GameOrder } from '../shared/events';
import { WARDS } from '../shared/model';
import { completeSyntheticScenario } from '../../tests/scenario-fixture';

function ok(r:OnlineResponse){if(!r.ok)throw new Error(r.errors.join(';'));return r;}
function setup(events=true){
  const config=structuredClone(sampleConfig);config.regions['sample-a'].startingUnit={ownerWardId:'26101',type:'army'};
  const fixture=completeSyntheticScenario(sampleDataset,config);
  const manager=new RoomManager({sample:fixture.dataset,'kyoto-kml':fixture.dataset},undefined,{seedFactory:()=> 'online-events',settings:events?undefined:noEvents});
  const credentials:Credentials[]=[];
  for(let i=0;i<3;i++)credentials.push(ok(manager.request(`s${i}`,i===0?{action:'create',nickname:'host',preferredWardId:WARDS[i].id,datasetKind:'sample',config:fixture.config}:{action:'join',nickname:`player${i}`,preferredWardId:WARDS[i].id,roomCode:credentials[0].roomCode})).credentials!);
  ok(manager.request('s0',{action:'start',yearLimit:null}));const room=manager.rooms.get(credentials[0].roomCode)!;
  return {manager,room,credentials,key:()=>manager.phaseKey(room)!,submit:(i:number,orders:GameOrder[],finalize=false)=>manager.request(`s${i}`,{action:'orders',phaseKey:manager.phaseKey(room)!,orders,finalize})};
}
describe('オンライン公開イベント・秘密の装備予約',()=>{
  it('3人の初期春イベントとground・countsを厳格public schemaで全員へ公開',()=>{
    const {manager,room}=setup();const view=serializePublicState(manager,room);expect(view.game?.events.current).toHaveLength(1);expect(view.game?.inventoryCounts['26101']).toEqual({bicycle:0,barricade:0});
    expect(view.game?.events).not.toHaveProperty('reservations');expect(view.game?.events).not.toHaveProperty('inventory');expect(view.game?.events).not.toHaveProperty('pendingBarricades');
  });
  it('自転車経路・装備ID・予約は本人だけ、編集で解除、不正変更は保存しない、復帰保持',()=>{
    const {manager,room,credentials,submit}=setup(false),state=room.game!.state;
    state.events.inventory=[{equipmentId:'private-bike-id',type:'bicycle',ownerWardId:'26101'}];
    const order:GameOrder={type:'bicycle-move',unitId:'initial-sample-a',viaRegionId:'sample-b',destination:'sample-d',equipmentId:'private-bike-id'};
    ok(submit(0,[order]));const self=room.players.get(credentials[0].playerId)!;
    expect(serializePrivateState(manager,room,self).reservations).toHaveLength(1);expect(JSON.stringify(serializePublicState(manager,room))).not.toContain('private-bike-id');
    for(const player of room.players.values())if(player!==self){const privateView=serializePrivateState(manager,room,player);expect(privateView.inventory).toEqual([]);expect(privateView.reservations).toEqual([]);expect(privateView.orders).toEqual([]);}
    const snapshot=structuredClone({submission:self.submission,events:state.events});expect(submit(0,[{...order,viaRegionId:'sample-d'}]).ok).toBe(false);expect({submission:self.submission,events:state.events}).toEqual(snapshot);
    manager.disconnect('s0');ok(manager.request('restored',{action:'reconnect',...credentials[0]}));expect(serializePrivateState(manager,room,self).orders).toEqual([order]);
    ok(manager.request('restored',{action:'orders',phaseKey:manager.phaseKey(room)!,orders:[{type:'hold',unitId:order.unitId}],finalize:false}));expect(state.events.reservations).toEqual([]);
  });
  it('Auto Holdは装備命令を保持し、全員確定は一度だけ裁定して両区間を公開',()=>{
    const {manager,room,submit,key}=setup(false);room.game!.state.events.inventory=[{equipmentId:'bike',type:'bicycle',ownerWardId:'26101'}];const originalKey=key();
    const order:GameOrder={type:'bicycle-move',unitId:'initial-sample-a',viaRegionId:'sample-b',destination:'sample-d',equipmentId:'bike'};
    ok(submit(0,[order],true));ok(submit(1,[],true));expect(room.game!.movementResolutions).toBe(0);ok(submit(2,[],true));expect(room.game!.movementResolutions).toBe(1);
    expect(room.game!.state.board.units.find(u=>u.unitId==='initial-sample-a')!.regionId).toBe('sample-d');const view=serializePublicState(manager,room);expect(view.game?.lastResult?.movement?.equipmentResults[0]).toMatchObject({type:'bicycle',status:'success',viaRegionId:'sample-b',destination:'sample-d'});
    expect(manager.request('s2',{action:'orders',phaseKey:originalKey,orders:[],finalize:true}).ok).toBe(false);expect(room.game!.movementResolutions).toBe(1);expect(room.game!.state.events.reservations).toEqual([]);
  });
  it('バリケード対象は秘密、成功後は次季節の封鎖・4季節・消費数を公開',()=>{
    const {manager,room,submit,credentials}=setup(false);room.game!.state.events.inventory=[{equipmentId:'private-wall',type:'barricade',ownerWardId:'26101'}];
    const order:GameOrder={type:'deploy-barricade',unitId:'initial-sample-a',targetRegionId:'sample-b',equipmentId:'private-wall'};ok(submit(0,[order]));
    expect(JSON.stringify(serializePublicState(manager,room))).not.toContain('private-wall');expect(serializePrivateState(manager,room,room.players.get(credentials[0].playerId)!).orders).toEqual([order]);
    for(let i=0;i<3;i++)ok(submit(i,i===0?[order]:[],true));
    const view=serializePublicState(manager,room);expect(view.game?.events.activeBarricades[0]).toMatchObject({a:'sample-a',b:'sample-b',remainingMovementSeasons:4});expect(view.game?.inventoryCounts['26101'].barricade).toBe(0);
    expect(effectiveMap(room.map,room.game!.state.events).adjacency['sample-a']).not.toContain('sample-b');
    expect(serializePrivateState(manager,room,room.players.get(credentials[0].playerId)!).legalOrders['initial-sample-a'].some(o=>o.type==='move'&&o.destination==='sample-b')).toBe(false);
  });
});
