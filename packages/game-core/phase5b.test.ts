import { describe,it,expect } from 'vitest';
import { compileMap } from '../map-core/compile';
import { sampleConfig,sampleDataset } from '../map-core/sample';
import { createPreview } from '../shared/preview';
import { createGameSession,adjudicateGameOrders,advanceGame,type GameResponse } from './index';
import { noEvents } from './events';
import { conquestProgress,evaluateGameEnd } from './end';
import { defaultGameSettings,createOnlineBoard } from '../online-core/initial';
import { RoomManager,serializePublicState,serializePrivateState } from '../online-core/room-manager';
import { completeSyntheticScenario } from '../../tests/scenario-fixture';
import { summarizeMatch } from './match-log';
const R='26101',B='26102',a='sample-a',b='sample-b',c='sample-c',d='sample-d';
const ok=<T>(r:GameResponse<T>)=>{if(!r.ok)throw Error(r.errors.join(';'));return r.result;};
function fixture(){
  const config=structuredClone(sampleConfig);
  for(const id of [a,b,c,d])config.regions[id].isSupplyCenter=true;
  const map=compileMap(sampleDataset,config).map,board=createPreview(map);
  for(const id of [a,b,c,d])board.regionControl[id].supplyCenterOwnerWardId=board.regionControl[id].controllerWardId=[a,b].includes(id)?R:B;
  board.units=[{unitId:'r',regionId:a,ownerWardId:R,type:'army'},{unitId:'b',regionId:c,ownerWardId:B,type:'army'}];
  return {map,state:ok(createGameSession(map,board,[R,B],null,2,{settings:noEvents}))};
}
describe('Phase 5B instant victory',()=>{
  it.each(['spring','autumn'] as const)('%sで目標のみ・敵初期SC1個では勝利せず、同じ敵の2個で勝利',season=>{
    const {map,state}=fixture();state.phase='sc-update';state.season=season;
    expect(advanceGame(map,state)).toMatchObject({ok:true,result:{status:'playing'}});
    state.board.regionControl[c].controllerWardId=state.board.regionControl[c].supplyCenterOwnerWardId=R;
    expect(evaluateGameEnd(map,state,'sc-update')).toBeNull();
    state.board.regionControl[d].controllerWardId=state.board.regionControl[d].supplyCenterOwnerWardId=R;
    expect(conquestProgress(state,R).rivalInitialSC).toBe(2);
    expect(advanceGame(map,state)).toMatchObject({ok:true,result:{status:'finished',endResult:{winners:[R]}}});
  });
  it.each([null,R,'26103'] as const)('初期所有者=%sの2SCは敵初期条件に含めない',initial=>{
    const {map,state}=fixture();for(const id of [c,d]){state.initialSupplyOwners[id]=initial;state.board.regionControl[id].supplyCenterOwnerWardId=R;}
    expect(conquestProgress(state,R)).toEqual({rivalInitialSC:0,neutralSCOwned:initial===null?2:0});
    expect(evaluateGameEnd(map,state,'sc-update')).toBeNull();
  });
  it('開始時Snapshotは所有権更新後も固定され、開始Previewも変更しない',()=>{
    const {map,state}=fixture(),owners=structuredClone(state.initialSupplyOwners);
    state.board.regionControl[c].controllerWardId=R;state.phase='sc-update';
    const next=ok(advanceGame(map,state));expect(next.initialSupplyOwners).toEqual(owners);expect(conquestProgress(next,R).rivalInitialSC).toBe(1);
  });
  it('無所属区のSCは正式初期化後に中立としてsnapshotされる',()=>{
    const config=structuredClone(sampleConfig);for(const id of [a,b,c,d]){config.regions[id].isSupplyCenter=true;config.regions[id].homeWardId=sampleDataset.regions.find(r=>r.regionId===id)!.wardId;}
    const map=compileMap(sampleDataset,config).map,board=createOnlineBoard(map,[R]);
    const state=ok(createGameSession(map,board,[R],null,2,{settings:noEvents}));
    for(const region of map.regions.filter(r=>r.wardId!==R))expect(state.initialSupplyOwners[region.regionId]).toBeNull();
  });
  it.each(['max-years','elimination-final-year'])('%sの最多SC勝利は敵初期条件を要求しない',reason=>{
    const {map,state}=fixture();state.year=state.maxYears;state.season='winter';
    if(reason==='elimination-final-year')for(const id of [c,d])state.board.regionControl[id].supplyCenterOwnerWardId=R;
    else {map.regions.find(r=>r.regionId===b)!.isSupplyCenter=false;map.regions.find(r=>r.regionId===d)!.isSupplyCenter=false;}
    expect(evaluateGameEnd(map,state,'winter')).toMatchObject({reason,winners:reason==='max-years'?[R,B]:[R]});
  });
  it('条件を設定で0にでき、不正値は開始を拒否',()=>{const {map,state}=fixture();state.requiredRivalInitialSupplyCentersForInstantWin=0;expect(evaluateGameEnd(map,state,'sc-update')?.winners).toEqual([R,B]);expect(createGameSession(map,state.board,[R,B],null,2,{requiredRivalInitialSupplyCentersForInstantWin:-1}).ok).toBe(false);});
});
describe('Phase 5B public presentation and telemetry',()=>{
  it('成功/失敗の裁定前位置と最終位置を保持し入力を変更しない',()=>{
    const {map,state}=fixture();const before=structuredClone(state);
    map.adjacency[c].push(b);map.adjacency[b].push(c);
    const next=ok(adjudicateGameOrders(map,state,[{type:'move',unitId:'r',destination:b},{type:'move',unitId:'b',destination:b}]));
    expect(next.presentation?.before).toEqual(before.board.units);expect(next.presentation?.after).toEqual(next.board.units);expect(next.presentation?.movement.standoffRegions).toContain(b);expect(state).toEqual(before);
  });
  it('装備instance IDを裁定演出snapshotに含めない',()=>{
    const {map,state}=fixture();state.events.inventory.push({equipmentId:'secret-instance',type:'bicycle',ownerWardId:R});
    const next=ok(adjudicateGameOrders(map,state,[{type:'bicycle-move',unitId:'r',equipmentId:'secret-instance',viaRegionId:b,destination:d},{type:'hold',unitId:'b'}]));
    expect(JSON.stringify(next.presentation)).not.toContain('secret-instance');expect(next.presentation?.orders[0]).not.toHaveProperty('equipmentId');
  });
  it('解決前の他者命令非公開、裁定後だけ全命令・Snapshot公開、skipを認証・重複排除して集計',()=>{
    const config=structuredClone(sampleConfig);config.regions[a]={enabled:true,isSupplyCenter:true,homeWardId:R,startingUnit:{type:'army',ownerWardId:R}};
    const f=completeSyntheticScenario(sampleDataset,config),manager=new RoomManager({sample:f.dataset,'kyoto-kml':f.dataset},defaultGameSettings,{settings:noEvents});
    const created=manager.request('s0',{action:'create',nickname:'host',preferredWardId:R,datasetKind:'sample',config:f.config});if(!created.ok)throw Error('create');const code=created.credentials!.roomCode;
    for(const [i,ward] of [B,'26103'].entries())expect(manager.request(`s${i+1}`,{action:'join',nickname:`guest${i+1}`,preferredWardId:ward,roomCode:code}).ok).toBe(true);
    expect(manager.request('s0',{action:'start',yearLimit:null}).ok).toBe(true);const room=manager.rooms.get(code)!;
    expect(serializePublicState(manager,room).game?.presentation).toBeNull();
    for(let i=0;i<3;i++)expect(manager.request(`s${i}`,{action:'orders',phaseKey:manager.phaseKey(room)!,orders:[],finalize:true}).ok).toBe(true);
    const snapshot=serializePublicState(manager,room).game!.presentation!;expect(snapshot.orders.length).toBeGreaterThan(0);
    expect(manager.request('unknown',{action:'presentation-skipped',presentationId:snapshot.id}).ok).toBe(false);
    expect(manager.request('s0',{action:'presentation-skipped',presentationId:'stale'}).ok).toBe(false);
    for(let i=0;i<2;i++)expect(manager.request('s0',{action:'presentation-skipped',presentationId:snapshot.id}).ok).toBe(true);
    expect(summarizeMatch(room.game!.matchLog).adjudicationPresentationSkipped).toBe(1);
    expect(serializePrivateState(manager,room,room.players.get(created.credentials!.playerId)!).orders).toEqual([]);
    expect(JSON.stringify(serializePublicState(manager,room))).not.toContain(created.credentials!.reconnectToken);
  });
});
