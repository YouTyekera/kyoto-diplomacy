import type { MapDefinition } from '../shared/model';
import { matchLogSchema, type MatchLog, type LogRecord, type MatchSummary } from '../shared/match';
import type { GameOrder } from '../shared/events';
import type { GameSessionState } from './model';
import { finalStandings, conquestProgress } from './end';
import { inventoryCounts } from './events';

export function recordMatch(log:MatchLog,map:MapDefinition,state:GameSessionState,timestamp:string,record:Omit<LogRecord,'timestamp'|'year'|'season'|'phase'|'stats'>):MatchLog {
  const inventories=inventoryCounts(state.events,state.participants);
  const entry:LogRecord={...record,timestamp,year:state.year,season:state.season,phase:state.phase,stats:finalStandings(map,state).map(row=>({wardId:row.wardId,supplyCenters:row.supplyCenters,controlledRegions:row.controlledRegions,units:row.units,...conquestProgress(state,row.wardId),inventory:inventories[row.wardId]}))};
  return {...log,finalResult:state.endResult,timeline:[...log.timeline,entry]};
}
export function startMatchLog(metadata:Omit<MatchLog,'version'|'timeline'|'finalResult'>,map:MapDefinition,state:GameSessionState,timestamp:string):MatchLog {
  let log:MatchLog={...structuredClone(metadata),version:1,finalResult:null,timeline:[]};
  log=recordMatch(log,map,state,timestamp,{type:'game-start'});
  return beginMatchPhase(log,map,state,timestamp);
}
export function beginMatchPhase(log:MatchLog,map:MapDefinition,state:GameSessionState,timestamp:string):MatchLog {
  if(state.phase==='finished')return log;
  log=recordMatch(log,map,state,timestamp,{type:'phase-start'});
  if(state.phase==='orders')log=recordMatch(log,map,state,timestamp,{type:'event-generation',events:structuredClone(state.events.current)});
  return log;
}
export function phaseElapsed(log:MatchLog,state:GameSessionState,timestamp:string) {
  const start=[...log.timeline].reverse().find(r=>r.type==='phase-start'&&r.year===state.year&&r.season===state.season&&r.phase===state.phase);
  return start?Math.max(0,(Date.parse(timestamp)-Date.parse(start.timestamp))/1000):0;
}
/** Observe a successful core transition. No drafts, tokens or pending reservations enter this layer. */
export function logTransition(log:MatchLog,map:MapDefinition,before:GameSessionState,after:GameSessionState,timestamp:string,resolvedOrders:GameOrder[]=[]):MatchLog {
  const context={...after,year:before.year,season:before.season,phase:before.phase};
  const add=(record:Omit<LogRecord,'timestamp'|'year'|'season'|'phase'|'stats'>,state=context)=>{log=recordMatch(log,map,state,timestamp,record);};
  if(before.phase==='orders'&&after.phase==='retreats') {
    add({type:'adjudication',elapsedSeconds:phaseElapsed(log,before,timestamp),submittedOrderCount:resolvedOrders.length,resolvedOrders:structuredClone(resolvedOrders).sort((a,b)=>a.unitId.localeCompare(b.unitId)),standoffCount:after.movement?.standoffRegions.length??0,dislodgementCount:after.movement?.dislodgedUnits.length??0});
    for(const edge of after.events.pendingBarricades.filter(e=>!before.events.pendingBarricades.some(p=>p.barricadeId===e.barricadeId)))add({type:'barricade-deployment',edge:{a:edge.a,b:edge.b}});
  }
  if(!before.retreatResolved&&after.retreatResolved) {
    add({type:'retreat',disbandCount:after.retreatResult?.disbandedUnitIds.length??0});
    for(const ground of before.events.groundEquipment) {
      const item=after.events.inventory.find(e=>e.equipmentId===ground.equipmentId);
      if(item)add({type:'equipment-pickup',equipment:{type:item.type,regionId:ground.regionId,ownerWardId:item.ownerWardId}});
    }
    for(const edge of before.events.activeBarricades.filter(e=>!after.events.activeBarricades.some(p=>p.barricadeId===e.barricadeId)))add({type:'barricade-expiration',edge:{a:edge.a,b:edge.b}});
  }
  if(before.phase==='sc-update')add({type:'sc-update'});
  if(before.phase==='adjustments'&&after.phase==='end-of-year')add({type:'winter-adjustment',buildCount:after.winterResult?.builtUnits.length??0,disbandCount:after.winterResult?.disbandedUnitIds.length??0});
  if(after.status==='finished'&&before.status!=='finished'&&after.endResult) {
    if(after.endResult.eliminated.length)add({type:'elimination',end:after.endResult},after);
    add({type:'game-end',end:after.endResult},after);
  } else if(before.phase!==after.phase||before.year!==after.year||before.season!==after.season)log=beginMatchPhase(log,map,after,timestamp);
  return log;
}
export function summarizeMatch(log:MatchLog):MatchSummary {
  const adjudications=log.timeline.filter(r=>r.type==='adjudication');
  const events=log.timeline.filter(r=>r.type==='event-generation').flatMap(r=>r.events??[]);
  const pickup=(type:string)=>log.timeline.filter(r=>r.type==='equipment-pickup'&&r.equipment?.type===type).length;
  const orders=adjudications.flatMap(r=>r.resolvedOrders??[]);
  const latest=log.timeline.at(-1)?.stats??[];
  return {supportHoldCount:orders.filter(o=>o.type==='support-hold').length,supportMoveCount:orders.filter(o=>o.type==='support-move').length,adjudicationPresentationSkipped:log.timeline.filter(r=>r.type==='presentation-skipped').length,rivalInitialSCByWard:Object.fromEntries(latest.map(r=>[r.wardId,r.rivalInitialSC])),neutralSCOwnedByWard:Object.fromEntries(latest.map(r=>[r.wardId,r.neutralSCOwned])),averageOrdersSeconds:adjudications.length?adjudications.reduce((n,r)=>n+(r.elapsedSeconds??0),0)/adjudications.length:0,ordersPhases:adjudications.length,standoffs:adjudications.reduce((n,r)=>n+(r.standoffCount??0),0),dislodgements:adjudications.reduce((n,r)=>n+(r.dislodgementCount??0),0),eventCounts:{bicycle:events.filter(e=>e.type==='bicycle').length,barricade:events.filter(e=>e.type==='barricade').length,roadwork:events.filter(e=>e.type==='roadwork').length,bus:events.filter(e=>e.type==='bus').length},bicyclePickups:pickup('bicycle'),barricadePickups:pickup('barricade'),bicycleUses:orders.filter(o=>o.type==='bicycle-move').length,barricadeUses:orders.filter(o=>o.type==='deploy-barricade').length,barricadeDeployments:log.timeline.filter(r=>r.type==='barricade-deployment').length};
}
/** Strict allowlist schema also validates a detached download snapshot. */
export function exportMatchLog(log:MatchLog):MatchLog {return matchLogSchema.parse(structuredClone(log));}
