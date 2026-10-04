import { describe,it,expect } from 'vitest';
import { compileMap } from '../map-core/compile';
import { sampleConfig,sampleDataset } from '../map-core/sample';
import { createPreview } from '../shared/preview';
import { WARDS,type MapDefinition,type WardId } from '../shared/model';
import { eventStateSchema,gameOrderSchema,type GameOrder,type EventSettings } from '../shared/events';
import { resolveRetreats,legalOrders,type Unit } from '../rules-core';
import { createGameSession,adjudicateGameOrders,adjudicateGameRetreats,advanceGame,adjudicateGameWinter,type GameResponse,type GameSessionState } from './index';
import { initialEvents,generateEvents,eventCount,defaultEventSettings,noEvents,edge,effectiveMap,buildEffectiveAdjacency,safeRemoval,settleEquipment } from './events';
import { legalGameOrders,reserveGameOrders,validateGameOrders } from './equipment-orders';

const R:WardId='26101',B:WardId='26102',G:WardId='26103';
export const army=(unitId:string,ownerWardId:WardId,regionId:string):Unit=>({unitId,ownerWardId,regionId,type:'army'});
const ok=<T>(v:GameResponse<T>):T=>{if(!v.ok)throw new Error(v.errors.join(';'));return v.result;};
/** Geometry is a synthetic fixture; graph edits are deliberately independent of Kyoto geography. */
export function eventFixture(units:Unit[]=[army('r',R,'a')]) {
  const map=compileMap(sampleDataset,sampleConfig).map,template=map.regions[0];
  map.regions=['a','b','c','d','e','f','g','h'].map(regionId=>({...structuredClone(template),regionId,name:`架空${regionId}`,enabled:true,isSupplyCenter:false,startingUnit:null,wardId:R}));
  map.adjacency={a:['b','d'],b:['a','c','e'],c:['b','d','f'],d:['a','c','e'],e:['b','d','f'],f:['c','e','g'],g:['f','h'],h:['g']};
  const board=createPreview(map);board.units=units;
  for(const [i,r] of map.regions.entries())board.regionControl[r.regionId].controllerWardId=[R,B,G][i%3];
  const state=ok(createGameSession(map,board,[R,B,G],null,99,{settings:noEvents}));return {map,state};
}
function item(s:GameSessionState,type:'bicycle'|'barricade',ownerWardId=R,equipmentId:string=type) {s.events.inventory.push({equipmentId,type,ownerWardId});return equipmentId;}
const bike=(unitId='r',viaRegionId='b',destination='c',equipmentId='bicycle'):GameOrder=>({type:'bicycle-move',unitId,viaRegionId,destination,equipmentId});
const barrier=(unitId='r',targetRegionId='b',equipmentId='barricade'):GameOrder=>({type:'deploy-barricade',unitId,targetRegionId,equipmentId});
function filled(s:GameSessionState,orders:GameOrder[]):GameOrder[]{return s.board.units.map(u=>orders.find(o=>o.unitId===u.unitId)??{type:'hold',unitId:u.unitId});}
function move(m:MapDefinition,s:GameSessionState,orders:GameOrder[]) {return ok(adjudicateGameOrders(m,s,filled(s,orders)));}
function settings(type:keyof EventSettings['weights']):EventSettings {return {weights:{bicycle:0,barricade:0,roadwork:0,bus:0,[type]:1}};}

describe('公開イベントの生成とruntime schema',()=>{
  it.each([3,5,6,8,9,11])('%i人の件数・重複禁止・再現・入力不変',n=>{
    const {map,state}=eventFixture([]),source=initialEvents('boundary');const before=structuredClone({map,state,source});
    const participants=WARDS.slice(0,n).map(w=>w.id),a=generateEvents(map,state.board,source,participants,1,'spring');
    expect(a.current).toHaveLength(eventCount(n));expect(new Set(a.current.map(e=>e.type)).size).toBe(eventCount(n));
    expect(a).toEqual(generateEvents(map,state.board,source,participants,1,'spring'));expect({map,state,source}).toEqual(before);expect(a.rngCounter).toBe(eventCount(n)*2);
  });
  it('第1年春と次の秋、次年春に生成し冬にはcounterを進めない',()=>{
    const {map,state}=eventFixture([]);Object.values(state.board.regionControl).forEach(v=>v.controllerWardId=R);state.board.regionControl.a.supplyCenterOwnerWardId=R;
    map.regions[0].isSupplyCenter=true;const initial=ok(createGameSession(map,state.board,[R],null,99,{seed:'timing',settings:settings('bicycle')}));
    expect(initial.events.current).toHaveLength(1);
    let s=move(map,initial,[]);s=ok(adjudicateGameRetreats(map,s,[]));s=ok(advanceGame(map,s));s=ok(advanceGame(map,s));
    expect(s.season).toBe('autumn');expect(s.events.rngCounter).toBe(4);
    s=move(map,s,[]);s=ok(adjudicateGameRetreats(map,s,[]));s=ok(advanceGame(map,s));s=ok(advanceGame(map,s));const counter=s.events.rngCounter;
    expect(s.season).toBe('winter');s=ok(adjudicateGameWinter(map,s,{builds:[],disbands:[]}));expect(s.events.rngCounter).toBe(counter);
    s=ok(advanceGame(map,s));expect(s.year).toBe(2);expect(s.events.rngCounter).toBe(counter+2);
  });
  it('候補なしの種類を除外し、生成可能数で終了する',()=>{
    const {map,state}=eventFixture([]);map.adjacency={a:['b'],b:['a'],c:[],d:[],e:[],f:[],g:[],h:[]};map.regions.forEach(r=>r.isSupplyCenter=true);
    expect(generateEvents(map,state.board,initialEvents('none'),WARDS.map(w=>w.id),1,'spring').current).toEqual([]);
    map.regions[0].isSupplyCenter=false;const generated=generateEvents(map,state.board,initialEvents('fallback'),WARDS.map(w=>w.id),1,'spring');
    expect(generated.current).toHaveLength(1);expect(generated.groundEquipment).toHaveLength(1);
  });
  it('非SC・空軍・未配置・侵入可能だけにspawnし、前線を優先、無ければfallback',()=>{
    const {map,state}=eventFixture([army('r',R,'a')]);map.regions.find(r=>r.regionId==='c')!.isSupplyCenter=true;
    map.regions.find(r=>r.regionId==='d')!.enabled=false;map.regions.find(r=>r.regionId==='h')!.playableGeometry=null;
    state.events=initialEvents('spawn',settings('bicycle'));state.events.groundEquipment=[{equipmentId:'old',type:'bicycle',regionId:'e',spawnedYear:1,spawnedSeason:'spring'}];
    Object.values(state.board.regionControl).forEach(v=>v.controllerWardId=B);state.board.regionControl.a.controllerWardId=R;
    const g=generateEvents(map,state.board,state.events,[R,B,G],1,'spring');expect(g.current[0].regionId).toBe('b');
    Object.values(state.board.regionControl).forEach(v=>v.controllerWardId=R);
    const fallback=generateEvents(map,state.board,state.events,[R],1,'spring');expect(['b','f','g']).toContain(fallback.current[0].regionId);
  });
  it.each(['ground','inventory'] as const)('バリケードが%sに1個あれば新規出現なし',where=>{
    const {map,state}=eventFixture([]),source=initialEvents('single',settings('barricade'));
    if(where==='inventory')source.inventory=[{equipmentId:'one',type:'barricade',ownerWardId:R}];else source.groundEquipment=[{equipmentId:'one',type:'barricade',regionId:'b',spawnedYear:1,spawnedSeason:'spring'}];
    expect(generateEvents(map,state.board,source,[R,B,G],1,'spring').current).toEqual([]);
    source.inventory=[];source.groundEquipment=[];source.activeBarricades=[{barricadeId:'consumed',...edge('a','b'),ownerWardId:R,remainingMovementSeasons:4}];
    expect(generateEvents(map,state.board,source,[R,B,G],1,'spring').current[0].type).toBe('barricade');
  });
  it('出現に失敗する装備種類の代わりに残りの種類を抽選する',()=>{
    const {map,state}=eventFixture([]);map.regions.forEach(r=>r.isSupplyCenter=true);
    const s=generateEvents(map,state.board,initialEvents('reroll'),WARDS.map(w=>w.id),1,'spring');expect(s.current.map(e=>e.type).sort()).toEqual(['bus','roadwork']);
  });
  it('同率の設定がファイルから読まれ、不正状態・不正命令を拒否する',()=>{
    expect(Object.values(defaultEventSettings.weights)).toEqual([1,1,1,1]);const s=initialEvents();
    s.inventory=[{equipmentId:'x',type:'bicycle',ownerWardId:R},{equipmentId:'x',type:'bicycle',ownerWardId:R}];expect(eventStateSchema.safeParse(s).success).toBe(false);
    expect(gameOrderSchema.safeParse({...bike(),extra:true}).success).toBe(false);
    s.inventory.pop();s.reservations=[{equipmentId:'missing',unitId:'r',type:'bicycle'}];expect(eventStateSchema.safeParse(s).success).toBe(false);
  });
  it('道路工事は永続グラフを分断せず、バスはbaseの距離2/3・非隣接だけ',()=>{
    const {map,state}=eventFixture([]);
    for(let i=0;i<30;i++) {
      const road=generateEvents(map,state.board,initialEvents(String(i),settings('roadwork')),[R,B,G],1,'spring').roadworkEdges[0];expect(safeRemoval(map,[],road)).toBe(true);expect(road).not.toEqual(edge('f','g'));
      const bus=generateEvents(map,state.board,initialEvents(String(i),settings('bus')),[R,B,G],1,'spring').temporaryBusEdges[0];expect(map.adjacency[bus.a]).not.toContain(bus.b);
      const two=map.adjacency[bus.a].some(x=>map.adjacency[x].includes(bus.b));const three=map.adjacency[bus.a].some(x=>map.adjacency[x].some(y=>map.adjacency[y].includes(bus.b)));expect(two||three).toBe(true);
    }
  });
});

describe('有効隣接・移動/支援/撤退/自転車',()=>{
  it('正規化・対称・決定的・不変・除外地域を追加しない',()=>{
    const base={a:['b','b'],b:[],c:[]},before=structuredClone(base);
    expect(buildEffectiveAdjacency(base,[],[],[edge('a','c'),edge('a','c'),edge('a','disabled')])).toEqual({a:['b','c'],b:['a'],c:['a']});expect(base).toEqual(before);
  });
  it.each(['roadwork','barricade'] as const)('%sは全4用途の辺を除外する',type=>{
    const {map,state}=eventFixture([army('r',R,'a'),army('s',R,'d'),army('b',B,'b')]);item(state,'bicycle');
    const e=edge('a','b');if(type==='roadwork')state.events.roadworkEdges=[e];else state.events.activeBarricades=[{...e,barricadeId:'wall',ownerWardId:R,remainingMovementSeasons:4}];
    const choices=legalOrders(effectiveMap(map,state.events),state.board.units,'r');expect(choices.some(o=>o.type==='move'&&o.destination==='b')).toBe(false);
    expect(choices.some(o=>o.type==='support-hold'&&o.targetUnitId==='b')).toBe(false);
    expect(choices.some(o=>o.type==='support-move'&&o.destination==='b')).toBe(false);
    expect(validateGameOrders(map,state,filled(state,[bike()])).ok).toBe(false);
    const movement={units:state.board.units.filter(u=>u.unitId!=='r'),orderResults:[],effectiveSupports:[],cutSupports:[],standoffRegions:[],dislodgedUnits:[{unit:army('r',R,'a'),attackerUnitId:'s',attackerOrigin:'d',legalRetreatDestinations:[]}],retreatOptions:[]};
    movement.units=[];expect(resolveRetreats(effectiveMap(map,state.events),movement,[{type:'retreat',unitId:'r',destination:'b'}]).ok).toBe(false);
  });
  it.each(['roadwork','barricade'] as const)('%sは自転車の第2区間も除外する',type=>{
    const {map,state}=eventFixture();item(state,'bicycle');const e=edge('b','c');
    if(type==='roadwork')state.events.roadworkEdges=[e];else state.events.activeBarricades=[{...e,barricadeId:'wall',ownerWardId:R,remainingMovementSeasons:4}];
    expect(validateGameOrders(map,state,[bike()]).ok).toBe(false);expect(legalGameOrders(map,state,'r')).not.toContainEqual(bike());
  });
  it('臨時バスは全4用途で合法になる',()=>{
    const {map,state}=eventFixture([army('r',R,'a'),army('b',B,'c'),army('s',R,'b')]);item(state,'bicycle');state.events.temporaryBusEdges=[edge('a','c')];
    const candidates=legalGameOrders(map,state,'r');expect(candidates).toContainEqual({type:'move',unitId:'r',destination:'c'});expect(candidates).toContainEqual({type:'support-hold',unitId:'r',targetUnitId:'b'});expect(candidates).toContainEqual({type:'support-move',unitId:'r',targetUnitId:'s',destination:'c'});expect(candidates).toContainEqual(bike('r','c','f'));
    const movement={units:[],orderResults:[],effectiveSupports:[],cutSupports:[],standoffRegions:[],dislodgedUnits:[{unit:army('r',R,'a'),attackerUnitId:'s',attackerOrigin:'b',legalRetreatDestinations:[]}],retreatOptions:[]};
    expect(resolveRetreats(effectiveMap(map,state.events),movement,[{type:'retreat',unitId:'r',destination:'c'}]).ok).toBe(true);
  });
  it('撤退解決後に工事・バスが消えてbaseへ戻る',()=>{
    const {map,state}=eventFixture();state.events.roadworkEdges=[edge('a','b')];state.events.temporaryBusEdges=[edge('a','c')];
    const after=settleEquipment(state.events,state.board.units);expect(effectiveMap(map,after).adjacency).toEqual(map.adjacency);
  });
});

describe('自転車の2段階同時裁定・所持と予約',()=>{
  it('2区間成功し曲がれる・途中支配も更新・自転車を消費しない',()=>{
    const {map,state}=eventFixture();item(state,'bicycle');const before=structuredClone(state),s=move(map,state,[bike('r','d','e')]);
    expect(s.board.units[0].regionId).toBe('e');expect(s.board.regionControl.d.controllerWardId).toBe(R);expect(s.board.regionControl.e.controllerWardId).toBe(R);expect(s.movement?.equipmentResults[0]).toMatchObject({status:'success',firstLeg:{status:'success'},secondLeg:{status:'success'}});
    const settled=ok(adjudicateGameRetreats(map,s,[]));expect(settled.events.inventory).toHaveLength(1);expect(settled.events.reservations).toEqual([]);expect(state).toEqual(before);
  });
  it('第1区間失敗ならA、第2区間bounceならBに残る',()=>{
    for(const [occupied,destination] of [['b','a'],['c','b']] as const){const {map,state}=eventFixture([army('r',R,'a'),army('b',B,occupied)]);item(state,'bicycle');const s=move(map,state,[bike()]);expect(s.board.units.find(u=>u.unitId==='r')!.regionId).toBe(destination);expect(s.movement?.equipmentResults[0].status).toBe('fail');}
  });
  it('第1区間は通常Moveと同時で順番に依存しない',()=>{
    const {map,state}=eventFixture([army('r',R,'a'),army('b',B,'e')]);item(state,'bicycle');const orders=filled(state,[bike(),{type:'move',unitId:'b',destination:'b'}]);
    expect(ok(adjudicateGameOrders(map,state,orders))).toEqual(ok(adjudicateGameOrders(map,state,orders.reverse())));expect(move(map,state,orders).board.units.find(u=>u.unitId==='r')?.regionId).toBe('a');
  });
  it('複数勢力の第2区間も同時・同一点競合で経由地域に残る',()=>{
    const {map,state}=eventFixture([army('r',R,'a'),army('b',B,'g')]);item(state,'bicycle');item(state,'bicycle',B,'blue');
    const orders=filled(state,[bike('r','b','c'),bike('b','f','c','blue')]);const s=ok(adjudicateGameOrders(map,state,orders));expect(s.board.units.map(u=>u.regionId).sort()).toEqual(['b','f']);expect(s.movement?.standoffRegions).toContain('c');
    expect(ok(adjudicateGameOrders(map,state,orders.reverse()))).toEqual(s);
  });
  it('支援があっても攻撃力1で通常Holdを排除できない',()=>{
    const {map,state}=eventFixture([army('r',R,'a'),army('s',R,'e'),army('b',B,'b')]);item(state,'bicycle');const s=move(map,state,[bike(),{type:'support-move',unitId:'s',targetUnitId:'r',destination:'b'}]);
    expect(s.board.units.find(u=>u.unitId==='r')!.regionId).toBe('a');expect(s.movement?.effectiveSupports).toEqual([]);expect(s.movement?.orderResults.find(r=>r.order.unitId==='r')?.attackStrength).toBe(1);
  });
  it.each(['same-item','two-items'] as const)('同じ勢力の2軍利用を拒否 (%s)',kind=>{
    const {map,state}=eventFixture([army('r',R,'a'),army('s',R,'g')]);item(state,'bicycle');if(kind==='two-items')item(state,'bicycle',R,'other');
    expect(validateGameOrders(map,state,filled(state,[bike(),bike('s','f','e',kind==='same-item'?'bicycle':'other')])).ok).toBe(false);
  });
  it('予約を命令編集で解除し、不正な変更では状態を破壊しない',()=>{
    const {map,state}=eventFixture();item(state,'bicycle');const s=ok(reserveGameOrders(map,state,[bike()]));expect(s.events.reservations).toHaveLength(1);
    expect(ok(reserveGameOrders(map,s,[{type:'hold',unitId:'r'}])).events.reservations).toEqual([]);const snapshot=structuredClone(s);expect(reserveGameOrders(map,s,[bike('r','h','a')]).ok).toBe(false);expect(s).toEqual(snapshot);
  });
  it.each(['retreat','disband'] as const)('利用軍が排除後%sした場合の装備損失',type=>{
    const {map,state}=eventFixture([army('r',R,'a'),army('b',B,'b'),army('s',B,'d')]);item(state,'bicycle');item(state,'bicycle',R,'unused');
    const s=move(map,state,[bike(),{type:'move',unitId:'b',destination:'a'},{type:'support-move',unitId:'s',targetUnitId:'b',destination:'a'}]);expect(s.movement?.dislodgedUnits.map(d=>d.unit.unitId)).toContain('r');
    // Temporary bus is still present for the associated retreat.
    s.events.temporaryBusEdges=[edge('a','c')];const next=ok(adjudicateGameRetreats(map,s,[type==='retreat'?{type:'retreat',unitId:'r',destination:'c'}:{type:'disband',unitId:'r'}]));
    expect(next.events.inventory.map(e=>e.equipmentId).sort()).toEqual(type==='retreat'?['bicycle','unused']:['unused']);
  });
  it('撤退競合で利用軍2体が破壊されれば予約された自転車2個が消える',()=>{
    const {map,state}=eventFixture([army('r',R,'a'),army('green',G,'f'),army('b',B,'b'),army('s',B,'d'),army('t',B,'g'),army('v',B,'c')]);
    item(state,'bicycle');item(state,'bicycle',G,'green-bike');state.events.temporaryBusEdges=[edge('a','e')];
    const moved=move(map,state,[bike(),bike('green','g','h','green-bike'),{type:'move',unitId:'b',destination:'a'},{type:'support-move',unitId:'s',targetUnitId:'b',destination:'a'},{type:'move',unitId:'t',destination:'f'},{type:'support-move',unitId:'v',targetUnitId:'t',destination:'f'}]);
    const s=ok(adjudicateGameRetreats(map,moved,[{type:'retreat',unitId:'r',destination:'e'},{type:'retreat',unitId:'green',destination:'e'}]));expect(s.retreatResult?.disbandedUnitIds.sort()).toEqual(['green','r']);expect(s.events.inventory).toEqual([]);
  });
});

describe('バリケードの保持・失敗・次季節・4季節',()=>{
  it('保持支援を受けられ、成功時消費し今季の辺は残る',()=>{
    const {map,state}=eventFixture([army('r',R,'a'),army('s',R,'d'),army('b',B,'b'),army('t',B,'c')]);item(state,'barricade');map.adjacency.a.push('c');map.adjacency.c.push('a');
    const s=move(map,state,[barrier(),{type:'support-hold',unitId:'s',targetUnitId:'r'},{type:'move',unitId:'b',destination:'a'},{type:'support-move',unitId:'t',targetUnitId:'b',destination:'a'}]);expect(s.movement?.orderResults.find(r=>r.order.unitId==='r')?.defenseStrength).toBe(2);expect(s.movement?.effectiveSupports).toContain('s');expect(s.events.inventory).toEqual([]);expect(s.events.pendingBarricades).toHaveLength(1);expect(effectiveMap(map,s.events).adjacency.a).toContain('b');
  });
  it('次Ordersから4季節だけ封鎖、撤退まで保持し4回後base復帰',()=>{
    const {map,state}=eventFixture();item(state,'barricade');let s=move(map,state,[barrier()]);s=ok(adjudicateGameRetreats(map,s,[]));
    expect(s.events.pendingBarricades[0].remainingMovementSeasons).toBe(4);
    s.events=generateEvents(map,s.board,s.events,[R,B,G],1,'autumn');
    for(let remaining=4;remaining>=1;remaining--){expect(s.events.activeBarricades[0].remainingMovementSeasons).toBe(remaining);expect(effectiveMap(map,s.events).adjacency.a).not.toContain('b');s.events=settleEquipment(s.events,s.board.units);}
    expect(s.events.activeBarricades).toEqual([]);expect(effectiveMap(map,s.events).adjacency.a).toContain('b');
  });
  it.each(['retreat','disband'] as const)('排除された設置軍は設置失敗、%sで所持を清算',type=>{
    const {map,state}=eventFixture([army('r',R,'a'),army('b',B,'b'),army('s',B,'d')]);item(state,'barricade');
    const s=move(map,state,[barrier(),{type:'move',unitId:'b',destination:'a'},{type:'support-move',unitId:'s',targetUnitId:'b',destination:'a'}]);expect(s.events.pendingBarricades).toEqual([]);expect(s.events.inventory).toHaveLength(1);
    s.events.temporaryBusEdges=[edge('a','c')];const next=ok(adjudicateGameRetreats(map,s,[type==='retreat'?{type:'retreat',unitId:'r',destination:'c'}:{type:'disband',unitId:'r'}]));expect(next.events.inventory).toHaveLength(type==='retreat'?1:0);
  });
  it('baseの橋・bus-only辺・既設辺を拒否する',()=>{
    const {map,state}=eventFixture([army('r',R,'f')]);item(state,'barricade');expect(validateGameOrders(map,state,[barrier('r','g')]).ok).toBe(false);
    state.events.temporaryBusEdges=[edge('f','a')];expect(validateGameOrders(map,state,[barrier('r','a')]).ok).toBe(false);
    state.events.activeBarricades=[{...edge('e','f'),barricadeId:'old',ownerWardId:R,remainingMovementSeasons:4}];expect(validateGameOrders(map,state,[barrier('r','e')]).ok).toBe(false);
  });
  it('持続中の封鎖も含め分断を拒否し、4季節目終了の封鎖は次季節判定から外す',()=>{
    const {map,state}=eventFixture();item(state,'barricade');state.events.activeBarricades=[{...edge('a','d'),barricadeId:'old',ownerWardId:R,remainingMovementSeasons:2}];expect(validateGameOrders(map,state,[barrier()]).ok).toBe(false);
    state.events.activeBarricades[0].remainingMovementSeasons=1;expect(validateGameOrders(map,state,[barrier()]).ok).toBe(true);
  });
  it.each(['same-item','two-items'] as const)('2+個の検証状態でも同じ勢力2軍の設置を拒否 (%s)',kind=>{
    const {map,state}=eventFixture([army('r',R,'a'),army('s',R,'e')]);item(state,'barricade');if(kind==='two-items')item(state,'barricade',R,'other');
    expect(validateGameOrders(map,state,filled(state,[barrier(),barrier('s','f',kind==='same-item'?'barricade':'other')])).ok).toBe(false);
  });
});

describe('装備pickupは全撤退後・SC更新前',()=>{
  it('Move到着はMovement時未取得、Retreat解決で取得、空地は残る',()=>{
    const {map,state}=eventFixture();state.events.groundEquipment=[{equipmentId:'ground',type:'bicycle',regionId:'b',spawnedYear:1,spawnedSeason:'spring'},{equipmentId:'left',type:'barricade',regionId:'h',spawnedYear:1,spawnedSeason:'spring'}];
    const moved=move(map,state,[{type:'move',unitId:'r',destination:'b'}]);expect(moved.events.inventory).toEqual([]);
    const s=ok(adjudicateGameRetreats(map,moved,[]));expect(s.events.inventory).toEqual([{equipmentId:'ground',type:'bicycle',ownerWardId:R}]);expect(s.events.groundEquipment.map(e=>e.equipmentId)).toEqual(['left']);expect(s.phase).toBe('retreats');
    expect(ok(advanceGame(map,s)).phase).toBe('sc-update');
  });
  it('Retreat到着のownerへ取得し、controllerとは独立する',()=>{
    const {map,state}=eventFixture([army('r',R,'a'),army('b',B,'b'),army('s',B,'d')]);
    state.events.groundEquipment=[{equipmentId:'ground',type:'bicycle',regionId:'c',spawnedYear:1,spawnedSeason:'spring'}];state.events.temporaryBusEdges=[edge('a','c')];
    const moved=move(map,state,[{type:'move',unitId:'b',destination:'a'},{type:'support-move',unitId:'s',targetUnitId:'b',destination:'a'}]);
    const s=ok(adjudicateGameRetreats(map,moved,[{type:'retreat',unitId:'r',destination:'c'}]));expect(s.events.inventory[0].ownerWardId).toBe(R);expect(s.board.regionControl.c.controllerWardId).toBe(G);
  });
});
