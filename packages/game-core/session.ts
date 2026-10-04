import type { MapDefinition, WardId } from '../shared/model';
import { WARDS } from '../shared/model';
import { gameStatePreviewSchema, validatePreview, type GameStatePreview } from '../shared/preview';
import { resolveRetreats, validateBoard } from '../rules-core';
import { updateSupplyCenters } from './control';
import type { GameOrder, EventSettings } from '../shared/events';
import { initialEvents, generateEvents, effectiveMap, settleEquipment } from './events';
import { resolveGameMovement } from './equipment-orders';
import { resolveWinter } from './winter';
import type { GameEnd, GameResponse, GameSessionState } from './model';
import { evaluateGameEnd } from './end';
import gameSettings from '../../data/config/game-settings.json' with {type:'json'};
import type { EndResult } from '../shared/match';

function finished(state:GameSessionState,result:EndResult):GameSessionState {
  const reason:GameEnd['reason']=result.reason==='supply-target'?'victory':result.reason==='max-years'?'year-limit':'elimination';
  return {...state,status:'finished',phase:'finished',endResult:result,end:{reason,finalYear:result.year,winnerWardId:result.winners.length===1?result.winners[0]:null,candidateWardIds:result.winners,tieUnresolved:false,eliminated:result.eliminated}};
}

/** Participants are explicitly selected by the caller; unassigned wards are not eliminated. */
export function createGameSession(map:MapDefinition, preview:GameStatePreview,participants:WardId[],yearLimit:number|null=null,victoryTargetSC=15,eventOptions:{seed?:string;settings?:EventSettings;requiredRivalInitialSupplyCentersForInstantWin?:number}={}):GameResponse {
  const parsed=gameStatePreviewSchema.safeParse(preview);
  if(!parsed.success) return {ok:false,errors:['初期盤面の形式が不正です']};
  const errors=[...validatePreview(parsed.data,map),...validateBoard(map,parsed.data.units).map(e=>e.message)];
  if(!map.regions.some(r=>r.enabled&&r.playableGeometry)) errors.push('採用された侵入可能地域がありません');
  if(!participants.length||new Set(participants).size!==participants.length||participants.some(id=>!WARDS.some(w=>w.id===id))) errors.push('参加勢力を重複なく指定してください');
  if(parsed.data.units.some(u=>!participants.includes(u.ownerWardId))) errors.push('全ユニットの所有勢力を参加勢力へ含めてください');
  if(yearLimit!==null&&(!Number.isSafeInteger(yearLimit)||yearLimit<1)) errors.push('規定年数は未設定または1以上の整数にしてください');
  if(!Number.isSafeInteger(victoryTargetSC)||victoryTargetSC<1) errors.push('SC勝利目標は1以上の整数にしてください');
  const required=eventOptions.requiredRivalInitialSupplyCentersForInstantWin??gameSettings.requiredRivalInitialSupplyCentersForInstantWin;
  if(!Number.isSafeInteger(required)||required<0) errors.push('敵初期SC条件は0以上の整数にしてください');
  if(errors.length) return {ok:false,errors};
  return {ok:true,result:{version:1,year:1,season:'spring',phase:'orders',status:'playing',endResult:null,maxYears:yearLimit??gameSettings.maxYears,board:structuredClone(parsed.data),participants:[...participants].sort(),
    homeBuildRegionIds:Object.fromEntries(participants.map(id=>[id,map.regions.filter(r=>r.enabled&&r.playableGeometry&&r.startingUnit?.ownerWardId===id).map(r=>r.regionId).sort()])),
    yearLimit,victoryTargetSC,requiredRivalInitialSupplyCentersForInstantWin:required,initialSupplyOwners:Object.fromEntries(map.regions.filter(r=>r.enabled&&r.playableGeometry&&r.isSupplyCenter).map(r=>[r.regionId,parsed.data.regionControl[r.regionId]?.supplyCenterOwnerWardId??null])),presentation:null,nextUnitSerial:1,movement:null,retreatResolved:false,retreatResult:null,scChanges:[],winterResult:null,end:null,
    events:generateEvents(map,parsed.data,initialEvents(eventOptions.seed,eventOptions.settings),participants,1,'spring')}};
}
export function adjudicateGameOrders(map:MapDefinition,state:GameSessionState,orders:GameOrder[]):GameResponse {
  if(state.status==='finished')return {ok:false,errors:['ゲームは終了しています']};
  if(state.phase!=='orders'||state.season==='winter') return {ok:false,errors:['移動命令フェイズではありません']};
  return resolveGameMovement(map,state,orders);
}
export function adjudicateGameRetreats(map:MapDefinition,state:GameSessionState,submissions:unknown):GameResponse {
  if(state.status==='finished')return {ok:false,errors:['ゲームは終了しています']};
  if(state.phase!=='retreats'||!state.movement||state.retreatResolved) return {ok:false,errors:['未解決の撤退フェイズではありません']};
  const response=resolveRetreats(effectiveMap(map,state.events),state.movement,submissions);
  if(!response.ok) return {ok:false,errors:response.errors.map(e=>`[${e.code}] ${e.message}`)};
  return {ok:true,result:{...state,board:{...state.board,units:response.result.units},events:settleEquipment(state.events,response.result.units),retreatResolved:true,retreatResult:response.result}};
}
export function advanceGame(map:MapDefinition,state:GameSessionState):GameResponse {
  if(state.status==='finished')return {ok:false,errors:['ゲームは終了しています']};
  if(state.phase==='retreats') {
    if(!state.retreatResolved) return {ok:false,errors:['撤退を同時解決してから進めてください']};
    return {ok:true,result:{...state,phase:'sc-update'}};
  }
  if(state.phase==='sc-update') {
    const updated=updateSupplyCenters(map,state.board);
    const next={...state,board:updated.board,scChanges:updated.changes};
    const end=evaluateGameEnd(map,next,'sc-update');
    if(end) return {ok:true,result:finished(next,end)};
    return {ok:true,result:{...next,phase:state.season==='spring'?'orders':'adjustments',
      events:state.season==='spring'?generateEvents(map,updated.board,state.events,state.participants,state.year,'autumn'):state.events,
      season:state.season==='spring'?'autumn':'winter',movement:null,retreatResult:null,retreatResolved:false}};
  }
  if(state.phase==='end-of-year') {
    const end=evaluateGameEnd(map,state,'winter');
    if(end) return {ok:true,result:finished(state,end)};
    return {ok:true,result:{...state,year:state.year+1,season:'spring',phase:'orders',movement:null,retreatResult:null,retreatResolved:false,winterResult:null,
      events:generateEvents(map,state.board,state.events,state.participants,state.year+1,'spring')}};
  }
  return {ok:false,errors:['このフェイズでは命令または冬の増減員を確定してください']};
}
export function adjudicateGameWinter(map:MapDefinition,state:GameSessionState,orders:unknown):GameResponse {
  if(state.status==='finished')return {ok:false,errors:['ゲームは終了しています']};
  const response=resolveWinter(map,state,orders);if(!response.ok) return response;
  return {ok:true,result:{...state,board:{...state.board,units:response.result.units},nextUnitSerial:response.result.nextUnitSerial,
    winterResult:response.result.summary,phase:'end-of-year'}};
}
