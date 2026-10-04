import { describe, it, expect } from 'vitest';
import { compileMap } from '../map-core/compile';
import { sampleConfig, sampleDataset } from '../map-core/sample';
import { createPreview } from '../shared/preview';
import { noEvents } from './events';
import type { MapDefinition, WardId } from '../shared/model';
import type { Unit, Order } from '../rules-core';
import { createGameSession, adjudicateGameOrders, adjudicateGameRetreats, adjudicateGameWinter, advanceGame,
  factionCounts, winterBudget, type GameResponse, type GameSessionState } from './index';

const R:WardId='26101',B:WardId='26102';
const a='sample-a',b='sample-b',c='sample-c',d='sample-d';
const army=(unitId:string,ownerWardId:WardId,regionId:string):Unit=>({unitId,ownerWardId,regionId,type:'army'});
function ok<T>(response:GameResponse<T>):T {
  if(!response.ok) throw new Error(response.errors.join('; '));return response.result;
}
function fixture() {
  const config=structuredClone(sampleConfig);
  config.regions[a].isSupplyCenter=true;config.regions[b].isSupplyCenter=true;
  config.regions[a].startingUnit={type:'army',ownerWardId:R};
  config.regions[c].startingUnit={type:'army',ownerWardId:B};
  const map=compileMap(sampleDataset,config).map;
  const board=createPreview(map);
  board.units=[army('r',R,a),army('b',B,c)];
  for(const [id,owner] of [[a,R],[b,B],[c,B],[d,R]] as const) board.regionControl[id].controllerWardId=owner;
  board.regionControl[a].supplyCenterOwnerWardId=R;board.regionControl[b].supplyCenterOwnerWardId=B;
  const state=ok(createGameSession(map,board,[R,B],null,15,{settings:noEvents}));return {map,state};
}
function winterFixture() {
  const {map,state}=fixture();state.season='winter';state.phase='adjustments';return {map,state};
}
function holds(state:GameSessionState):Order[] {return state.board.units.map(u=>({type:'hold',unitId:u.unitId}));}
function season(map:MapDefinition,state:GameSessionState) {
  let next=ok(adjudicateGameOrders(map,state,holds(state)));
  next=ok(adjudicateGameRetreats(map,next,[]));next=ok(advanceGame(map,next));return ok(advanceGame(map,next));
}
describe('controllerと春秋SC所有',()=>{
  it('successful Moveが移動先controllerを更新し、SC所有はまだ更新しない',()=>{
    const {map,state}=fixture();const next=ok(adjudicateGameOrders(map,state,[{type:'move',unitId:'r',destination:b},{type:'hold',unitId:'b'}]));
    expect(next.board.regionControl[b]).toMatchObject({controllerWardId:R,supplyCenterOwnerWardId:B});
    expect(state.board.regionControl[b].controllerWardId).toBe(B);
  });
  it('unitが去ってもcontrollerを維持し、failed Moveでは更新しない',()=>{
    const {map,state}=fixture();state.board.units=[army('r',R,b),army('b',B,c)];state.board.regionControl[b].controllerWardId=R;
    const next=ok(adjudicateGameOrders(map,state,[{type:'move',unitId:'r',destination:a},{type:'hold',unitId:'b'}]));
    expect(next.board.regionControl[b].controllerWardId).toBe(R);
    const blocked=structuredClone(state);blocked.board.units=[army('r',R,a),army('b',B,b)];blocked.board.regionControl[b].controllerWardId=B;
    const failed=ok(adjudicateGameOrders(map,blocked,[{type:'move',unitId:'r',destination:b},{type:'hold',unitId:'b'}]));
    expect(failed.board.regionControl[b].controllerWardId).toBe(B);
  });
  it('Retreatは他勢力controllerを上書きしない',()=>{
    const {map,state}=fixture();map.adjacency[c].push(b);map.adjacency[b].push(c);
    state.board.units=[army('r',R,a),army('b',B,b),army('s',R,c)];
    const moved=ok(adjudicateGameOrders(map,state,[{type:'move',unitId:'r',destination:b},{type:'hold',unitId:'b'},
      {type:'support-move',unitId:'s',targetUnitId:'r',destination:b}]));
    const next=ok(adjudicateGameRetreats(map,moved,[{type:'retreat',unitId:'b',destination:d}]));
    expect(next.board.units.find(u=>u.unitId==='b')!.regionId).toBe(d);
    expect(next.board.regionControl[d].controllerWardId).toBe(R);
  });
  it.each(['spring','autumn'] as const)('%s SC Updateは移動と撤退後のcontrollerをSC所有に使用する',current=>{
    const {map,state}=fixture();state.season=current;state.board.regionControl[b].controllerWardId=R;
    const next=season(map,state);
    expect(next.board.regionControl[b].supplyCenterOwnerWardId).toBe(R);
    expect(next.scChanges).toContainEqual({regionId:b,previous:B,owner:R});
    expect(next.season).toBe(current==='spring'?'autumn':'winter');
  });
  it('中立SCはcontrollerがnullならnullを維持する',()=>{
    const {map,state}=fixture();state.board.regionControl[b].controllerWardId=null;state.board.regionControl[b].supplyCenterOwnerWardId=null;
    expect(season(map,state).board.regionControl[b].supplyCenterOwnerWardId).toBeNull();
  });
});
describe('冬の初期地点限定Buildと手動Disband',()=>{
  it('owned SCが軍数を上回る差分をBuild上限にする',()=>{
    const {map,state}=winterFixture();state.board.regionControl[b].supplyCenterOwnerWardId=R;
    expect(winterBudget(map,state,R)).toMatchObject({supplyCenters:2,units:1,buildCount:1,disbandCount:0});
  });
  it('空いた初期地点の所有SCだけにarmyを増員し、preview配置を初期地点に流用しない',()=>{
    const {map,state}=winterFixture();state.board.units[0].regionId=d;state.board.units=state.board.units.filter(u=>u.ownerWardId!==B);
    state.board.regionControl[b].supplyCenterOwnerWardId=R;
    expect(state.homeBuildRegionIds[R]).toEqual([a]);expect(winterBudget(map,state,R).buildRegionIds).toEqual([a]);
    const next=ok(adjudicateGameWinter(map,state,{builds:[{ownerWardId:R,regionId:a}],disbands:[]}));
    expect(next.board.units.find(u=>u.regionId===a)).toMatchObject({ownerWardId:R,type:'army'});
    expect(next.phase).toBe('end-of-year');expect(state.board.units).toHaveLength(1);
  });
  it.each(['non-initial','occupied','non-owned','non-sc','excluded'] as const)('%s地点でのBuildを拒否する',kind=>{
    const {map,state}=winterFixture();state.board.units=[];let target=a;
    if(kind==='non-initial') {target=b;state.board.regionControl[b].supplyCenterOwnerWardId=R;}
    if(kind==='occupied') state.board.units=[army('r',R,a)];
    if(kind==='non-owned') state.board.regionControl[a].supplyCenterOwnerWardId=B;
    if(kind==='non-sc') map.regions.find(r=>r.regionId===a)!.isSupplyCenter=false;
    if(kind==='excluded') map.regions.find(r=>r.regionId===a)!.enabled=false;
    expect(adjudicateGameWinter(map,state,{builds:[{ownerWardId:R,regionId:target}],disbands:[]}).ok).toBe(false);
  });
  it('Build上限超過・重複・不正形式・未参加勢力を拒否する',()=>{
    const {map,state}=winterFixture();state.board.units=[];
    expect(adjudicateGameWinter(map,state,{builds:[{ownerWardId:R,regionId:a},{ownerWardId:R,regionId:a}],disbands:[]}).ok).toBe(false);
    expect(adjudicateGameWinter(map,state,{builds:[{ownerWardId:'26103',regionId:a}],disbands:[]}).ok).toBe(false);
    expect(adjudicateGameWinter(map,state,{builds:'invalid',disbands:[]}).ok).toBe(false);
    state.board.units=[army('r',R,d)];
    expect(adjudicateGameWinter(map,state,{builds:[{ownerWardId:R,regionId:a}],disbands:[]}).ok).toBe(false);
  });
  it('Build可能数を使い切らなくても、必要Disbandを満たせば確定できる',()=>{
    const {map,state}=winterFixture();state.board.units=[];
    expect(ok(adjudicateGameWinter(map,state,{builds:[],disbands:[]})).phase).toBe('end-of-year');
  });
  it('軍数超過だけ必要Disbandとなり、指定した軍のみを除去する',()=>{
    const {map,state}=winterFixture();state.board.units.push(army('extra',R,d));
    expect(winterBudget(map,state,R).disbandCount).toBe(1);
    const next=ok(adjudicateGameWinter(map,state,{builds:[],disbands:['extra']}));
    expect(next.board.units.map(u=>u.unitId)).toEqual(['b','r']);expect(next.winterResult!.disbandedUnitIds).toEqual(['extra']);
  });
  it('必要数不足・過剰解散・存在しない軍・重複を拒否し、自動選択しない',()=>{
    const {map,state}=winterFixture();state.board.units.push(army('extra',R,d));
    for(const disbands of [[],['extra','r'],['missing'],['extra','extra']]) {
      const snapshot=structuredClone(state);expect(adjudicateGameWinter(map,state,{builds:[],disbands}).ok).toBe(false);expect(state).toEqual(snapshot);
    }
    expect(advanceGame(map,state).ok).toBe(false);
  });
  it('初期地点はセッション開始時に固定され、homeWardId・元行政区を参照しない',()=>{
    const {map,state}=fixture();map.regions.find(r=>r.regionId===b)!.homeWardId=R;
    map.regions.find(r=>r.regionId===a)!.startingUnit=null;
    expect(state.homeBuildRegionIds[R]).toEqual([a]);
    const fresh=ok(createGameSession(map,state.board,[R,B]));expect(fresh.homeBuildRegionIds[R]).toEqual([]);
  });
});
describe('年間進行・勝利・脱落・終了',()=>{
  it('春命令→撤退→春SC→秋命令→撤退→秋SC→冬→年末→次年春',()=>{
    const {map,state}=fixture();const spring=season(map,state);expect(spring).toMatchObject({year:1,season:'autumn',phase:'orders'});
    const winter=season(map,spring);expect(winter).toMatchObject({season:'winter',phase:'adjustments'});
    const endYear=ok(adjudicateGameWinter(map,winter,{builds:[],disbands:[]}));expect(endYear.phase).toBe('end-of-year');
    expect(ok(advanceGame(map,endYear))).toMatchObject({year:2,season:'spring',phase:'orders',end:null});
  });
  it('未入力命令・撤退未解決・異なるフェイズの処理では進行させない',()=>{
    const {map,state}=fixture();expect(adjudicateGameOrders(map,state,[]).ok).toBe(false);
    expect(adjudicateGameRetreats(map,state,[]).ok).toBe(false);expect(adjudicateGameWinter(map,state,{builds:[],disbands:[]}).ok).toBe(false);
    const moved=ok(adjudicateGameOrders(map,state,holds(state)));expect(advanceGame(map,moved).ok).toBe(false);
    const resolved=ok(adjudicateGameRetreats(map,moved,[]));expect(adjudicateGameRetreats(map,resolved,[]).ok).toBe(false);
    expect(adjudicateGameOrders(map,moved,holds(moved)).ok).toBe(false);
  });
  it.each(['spring','autumn'] as const)('%s SC更新後の15SC以上で即勝利し、冬前に停止する',current=>{
    const {map,state}=fixture();const template=map.regions[0];
    for(let i=0;i<15;i++) {const id=`extra-sc-${i}`;map.regions.push({...structuredClone(template),regionId:id,isSupplyCenter:true,startingUnit:null});map.adjacency[id]=[];
      state.board.regionControl[id]={regionId:id,controllerWardId:R,supplyCenterOwnerWardId:null};state.initialSupplyOwners[id]=i<2?B:null;}
    state.phase='sc-update';state.season=current;
    const next=ok(advanceGame(map,state));expect(next.phase).toBe('finished');expect(next.end).toMatchObject({reason:'victory',winnerWardId:R,finalYear:1});
    expect(advanceGame(map,next).ok).toBe(false);
  });
  it.each(['zero-sc','zero-non-sc'] as const)('冬後の%sで脱落し、その年を最終年として停止する',reason=>{
    const {map,state}=winterFixture();state.year=3;
    if(reason==='zero-sc') {state.board.regionControl[a].supplyCenterOwnerWardId=B;state.board.units=state.board.units.filter(u=>u.ownerWardId!==R);}
    else state.board.regionControl[d].controllerWardId=B;
    const endYear=ok(adjudicateGameWinter(map,state,{builds:[],disbands:[]}));expect(endYear.end).toBeNull();
    const next=ok(advanceGame(map,endYear));expect(next.phase).toBe('finished');expect(next.end!.finalYear).toBe(3);
    expect(next.end!.eliminated).toContainEqual({wardId:R,reasons:[reason]});expect(next.endResult!.winners).toEqual(reason==='zero-sc'?[B]:[R,B]);
  });
  it('同じSC更新で複数勢力が15SCに達しても独自のタイブレークを使わない',()=>{
    const {map,state}=fixture();const template=map.regions[0];
    for(const owner of [R,B]) for(let i=0;i<15;i++) {
      const id=`sc-${owner}-${i}`;map.regions.push({...structuredClone(template),regionId:id,startingUnit:null});map.adjacency[id]=[];
      state.board.regionControl[id]={regionId:id,controllerWardId:owner,supplyCenterOwnerWardId:null};state.initialSupplyOwners[id]=i<2?(owner===R?B:R):null;
    }
    state.phase='sc-update';const result=ok(advanceGame(map,state));
    expect(result.end).toMatchObject({reason:'victory',winnerWardId:null,candidateWardIds:[R,B],tieUnresolved:false});expect(result.endResult!.winners).toEqual([R,B]);
  });
  it('未参加の行政区を脱落に含めない',()=>{
    const {map,state}=fixture();state.board.units=state.board.units.filter(u=>u.ownerWardId===R);
    const one=ok(createGameSession(map,state.board,[R]));one.phase='end-of-year';one.season='winter';
    expect(ok(advanceGame(map,one)).phase).toBe('orders');
  });
  it('設定した規定年数前は継続し、到達後には最多SC・同率勝者を判定する',()=>{
    const {map,state}=winterFixture();state.phase='end-of-year';state.year=100;state.maxYears=101;
    expect(ok(advanceGame(map,state)).year).toBe(101);
    state.maxYears=100;const tied=ok(advanceGame(map,state));expect(tied.end).toMatchObject({reason:'year-limit',winnerWardId:null,tieUnresolved:false});
    map.regions.push({...structuredClone(map.regions[0]),regionId:'extra-sc',startingUnit:null});map.adjacency['extra-sc']=[];
    state.board.regionControl['extra-sc']={regionId:'extra-sc',controllerWardId:R,supplyCenterOwnerWardId:R};
    expect(ok(advanceGame(map,state)).end!.winnerWardId).toBe(R);
  });
  it('初期入力の不正、参加勢力の不足/重複、不正な規定年数を拒否する',()=>{
    const {map,state}=fixture();
    for(const participants of [[],[R,R],[R]]) expect(createGameSession(map,state.board,participants).ok).toBe(false);
    for(const yearLimit of [0,-1,1.5,NaN]) expect(createGameSession(map,state.board,[R,B],yearLimit).ok).toBe(false);
    expect(createGameSession(map,{...state.board,units:[state.board.units[0],state.board.units[0]]},[R,B]).ok).toBe(false);
    const excluded=structuredClone(map);excluded.regions.forEach(r=>r.enabled=false);expect(createGameSession(excluded,state.board,[R,B]).ok).toBe(false);
  });
  it('年末処理が決定的で入力不変、集計も元行政区と独立',()=>{
    const {map,state}=winterFixture();state.phase='end-of-year';const snapshot=structuredClone({map,state});
    expect(advanceGame(map,state)).toEqual(advanceGame(map,state));expect({map,state}).toEqual(snapshot);
    expect(factionCounts(map,state.board,R)).toEqual({supplyCenters:1,units:1,nonSCRegions:1});
  });
});
