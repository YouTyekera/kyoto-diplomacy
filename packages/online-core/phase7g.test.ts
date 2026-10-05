import {afterEach,describe,expect,it,vi} from 'vitest';
import { RoomManager,serializePublicState } from './room-manager';
import { sampleConfig,sampleDataset } from '../map-core/sample';
import { completeSyntheticScenario } from '../../tests/scenario-fixture';
import { noEvents,adjudicateGameOrders,adjudicateGameRetreats,advanceGame,createGameSession } from '../game-core';
import type { GameSessionState } from '../game-core';
import { compileMap } from '../map-core/compile';
import { createPreview } from '../shared/preview';
import { planPlayback,unitPlaybackTime } from '../shared/playback';
import { presentationPosition } from '../../apps/web/src/AdjudicationPresentation';
import type { GameOrder } from '../shared/events';
import type { OnlineResponse } from '../shared/online';
const ok=(response:OnlineResponse)=>{if(!response.ok)throw Error(response.errors.join('\n'));return response;};
function afterEmptyRetreat(state:GameSessionState,map:Parameters<typeof advanceGame>[0]){const retreat=adjudicateGameRetreats(map,state,[]);if(!retreat.ok)throw Error('retreat');const sc=advanceGame(map,retreat.result);if(!sc.ok)throw Error('sc');const next=advanceGame(map,sc.result);if(!next.ok)throw Error('next');return next.result;}
function roomSetup(){
  const config=structuredClone(sampleConfig);for(const [id,ward]of [['sample-a','26101'],['sample-c','26102'],['sample-d','26103']]as const)config.regions[id].startingUnit={ownerWardId:ward,type:'army'};
  const f=completeSyntheticScenario(sampleDataset,config),manager=new RoomManager({sample:f.dataset,'kyoto-kml':f.dataset},undefined,{settings:noEvents});
  const credentials=ok(manager.request('host',{action:'create',nickname:'host',preferredWardId:'26101',datasetKind:'sample',config:f.config})).credentials!;
  for(let i=1;i<3;i++)ok(manager.request(`g${i}`,{action:'join',nickname:`guest${i}`,preferredWardId:i===1?'26102':'26103',roomCode:credentials.roomCode}));
  ok(manager.request('host',{action:'start',yearLimit:3}));return {manager,room:manager.roomForSocket('host')!,credentials};
}
afterEach(()=>vi.useRealTimers());
describe('Phase 7G server result publication and immutable public history',()=>{
  it('全員確定で公開・位置を保持、host開始/skip後だけ進み、履歴は再接続時も取得できる',()=>{
    const {manager,room,credentials}=roomSetup(),before=structuredClone(room.game!.state.board),key=manager.phaseKey(room)!;
    for(const socket of ['host','g1','g2'])ok(manager.request(socket,{action:'orders',phaseKey:key,orders:[],finalize:true}));
    const reveal=serializePublicState(manager,room).game!.playback!;
    expect(reveal).toMatchObject({stage:'reveal',snapshot:null});expect(reveal.orders).toHaveLength(3);expect(room.game!.state.board).toEqual(before);expect(room.game!.movementResolutions).toBe(1);
    expect(manager.request('g1',{action:'playback',presentationId:reveal.id,control:'start'}).ok).toBe(false);
    expect(manager.request('host',{action:'unready',phaseKey:key}).ok).toBe(false);
    ok(manager.request('host',{action:'playback',presentationId:reveal.id,control:'start'}));
    const frozen=structuredClone(room.game!.playback!.next);
    ok(manager.request('host',{action:'playback',presentationId:reveal.id,control:'skip'}));
    expect(room.game!.state.board).toEqual(afterEmptyRetreat(frozen,room.map).board);expect(room.game!.state.season).toBe('autumn');expect(room.game!.movementResolutions).toBe(1);
    const history=serializePublicState(manager,room).game!.history!;
    expect(history[0]).toMatchObject({year:1,season:'spring',board:frozen.board});expect(history[0].events).not.toHaveProperty('inventory');expect(JSON.stringify(history)).not.toContain(credentials.reconnectToken);
    history[0].board.units[0].regionId='changed-view';expect(room.game!.history[0].board).toEqual(frozen.board);
    manager.disconnect('host');ok(manager.request('reloaded',{action:'reconnect',...credentials}));expect(serializePublicState(manager,room).game!.history).toEqual(room.game!.history);manager.dispose();
  });
  it('通常再生と早送りとskipで同じ結果、timer重複なし・全クライアントへ完了をpublish',()=>{
    vi.useFakeTimers();const r=roomSetup(),game=r.room.game!,updates:string[]=[];r.manager.onRoomUpdate(room=>updates.push(room.code));
    for(const socket of ['host','g1','g2'])ok(r.manager.request(socket,{action:'orders',phaseKey:r.manager.phaseKey(r.room)!,orders:[],finalize:true}));
    const p=game.playback!,expected=afterEmptyRetreat(p.next,r.room.map).board,id=p.next.presentation!.id;
    ok(r.manager.request('host',{action:'playback',presentationId:id,control:'start'}));ok(r.manager.request('host',{action:'playback',presentationId:id,control:'fast-forward'}));
    vi.advanceTimersByTime(p.duration/4+10);expect(game.state.board).toEqual(expected);expect(game.history).toHaveLength(1);expect(updates).toHaveLength(1);vi.advanceTimersByTime(100000);expect(game.history).toHaveLength(1);r.manager.dispose();
  });
  it('春/秋ごとに独立した履歴が増え、次ターン・現state・公開済み命令に影響しない',()=>{
    const {manager,room}=roomSetup();
    for(let turn=0;turn<2;turn++){
      for(const socket of ['host','g1','g2'])ok(manager.request(socket,{action:'orders',phaseKey:manager.phaseKey(room)!,orders:[],finalize:true}));
      const id=room.game!.playback!.next.presentation!.id;ok(manager.request('host',{action:'playback',presentationId:id,control:'start'}));ok(manager.request('host',{action:'playback',presentationId:id,control:'skip'}));
    }
    const game=room.game!,current=structuredClone(game.state),view=serializePublicState(manager,room);
    expect(view.game!.history!.map(s=>[s.year,s.season])).toEqual([[1,'spring'],[1,'autumn']]);
    view.game!.history!.reverse();expect(game.history.map(s=>s.season)).toEqual(['spring','autumn']);expect(game.state).toEqual(current);manager.dispose();
  });
});
function result(orders:GameOrder[]){
  const f=completeSyntheticScenario(sampleDataset,sampleConfig),map=compileMap(f.dataset,f.config).map;
  const units=[{unitId:'a',regionId:'sample-a',ownerWardId:'26101'},{unitId:'b',regionId:'sample-c',ownerWardId:'26102'},{unitId:'s',regionId:'sample-d',ownerWardId:'26101'},{unitId:'cut',regionId:'extra-setup-26103',ownerWardId:'26103'},{unitId:'peace',regionId:'extra-sc-0',ownerWardId:'26103'}].map(u=>({...u,type:'army' as const,ownerWardId:u.ownerWardId as '26101'|'26102'|'26103'}));
  for(const [a,b]of [['sample-a','sample-b'],['sample-c','sample-b'],['sample-d','sample-b'],['sample-a','sample-c'],['sample-d','sample-c'],['extra-setup-26103','sample-d'],['extra-sc-0','extra-sc-1']]){map.adjacency[a]=[...new Set([...(map.adjacency[a]??[]),b])];map.adjacency[b]=[...new Set([...(map.adjacency[b]??[]),a])];}
  const board={...createPreview(map),units},created=createGameSession(map,board,['26101','26102','26103'],3,23,{settings:noEvents});if(!created.ok)throw Error(created.errors.join());
  const resolved=adjudicateGameOrders(map,created.result,orders);if(!resolved.ok)throw Error(resolved.errors.join());return resolved.result.presentation!;
}
describe('Phase 7G presentation graph never adjudicates or changes the result',()=>{
  const base:GameOrder[]=[{type:'move',unitId:'a',destination:'sample-b'},{type:'move',unitId:'b',destination:'sample-b'},{type:'support-move',unitId:'s',targetUnitId:'a',destination:'sample-b'},{type:'hold',unitId:'cut'},{type:'move',unitId:'peace',destination:'extra-sc-1'}];
  for(const mode of ['dislodge','standoff','support-cut']as const)it(`${mode}: 平和な移動→依存cluster、逆順/skipの最終位置はcoreと一致`,()=>{
    const orders=base.map(o=>mode==='standoff'&&o.unitId==='s'?{type:'hold' as const,unitId:'s'}:mode==='support-cut'&&o.unitId==='cut'?{type:'move' as const,unitId:'cut',destination:'sample-d'}:o);
    if(mode==='dislodge'){orders[0]={type:'move',unitId:'a',destination:'sample-c'};orders[1]={type:'hold',unitId:'b'};orders[2]={type:'support-move',unitId:'s',targetUnitId:'a',destination:'sample-c'};}
    const snapshot=result(orders),original=structuredClone(snapshot),plan=planPlayback(snapshot),peace=plan.groups.find(g=>g.unitIds.includes('peace'))!,conflict=plan.groups.find(g=>g.unitIds.includes('a'))!;
    expect(peace.stage).toBe(1);expect(conflict.stage).toBe(2);expect(peace.end).toBeLessThanOrEqual(conflict.start);expect(conflict.unitIds).toEqual(expect.arrayContaining(mode==='standoff'?['a','b']:['a','b','s']));
    if(mode==='support-cut')expect(conflict.unitIds).toContain('cut');
    const point=(id:string)=>[id.length,[...id].reduce((n,c)=>n+c.charCodeAt(0),0)];
    for(const ordered of [plan.groups,[...plan.groups].reverse()]){
      let cursor=0;const groups=ordered.map(g=>{const start=cursor;cursor+=g.end-g.start;return {...g,start,end:cursor};});
      const reordered={groups,duration:cursor+1100};
      for(let time=0;time<reordered.duration;time+=200)for(const unit of snapshot.before)presentationPosition(snapshot,unit.unitId,unitPlaybackTime(reordered,unit.unitId,time),point);
      for(const unit of snapshot.before){const elapsed=unitPlaybackTime(reordered,unit.unitId,reordered.duration);const final=snapshot.after.find(u=>u.unitId===unit.unitId)??snapshot.movement.dislodgedUnits.find(d=>d.unit.unitId===unit.unitId)?.unit;
        expect(presentationPosition(snapshot,unit.unitId,elapsed,point)).toEqual(point(final!.regionId));}
    }
    expect(snapshot).toEqual(original);
    expect(presentationPosition(snapshot,'peace',unitPlaybackTime(plan,'peace',0),point)).toEqual(point('extra-sc-0'));
    if(mode==='standoff'||mode==='support-cut')expect(snapshot.movement.standoffRegions).toContain('sample-b');
    if(mode==='support-cut')expect(snapshot.movement.cutSupports).toContain('s');
    if(mode==='dislodge')expect(snapshot.movement.dislodgedUnits).toHaveLength(1);
  });
});
