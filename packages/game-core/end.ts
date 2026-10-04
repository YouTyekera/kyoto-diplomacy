import type { MapDefinition, WardId } from '../shared/model';
import type { EndResult } from '../shared/match';
import type { GameSessionState } from './model';
import { factionCounts } from './control';

export function conquestProgress(state:GameSessionState,wardId:WardId) {
  const owned=Object.entries(state.initialSupplyOwners).filter(([id])=>state.board.regionControl[id]?.supplyCenterOwnerWardId===wardId);
  return {rivalInitialSC:owned.filter(([,initial])=>initial!==null&&initial!==wardId&&state.participants.includes(initial)).length,neutralSCOwned:owned.filter(([,initial])=>initial===null).length};
}

export function finalStandings(map:MapDefinition,state:Pick<GameSessionState,'board'|'participants'>) {
  const rows=state.participants.map(wardId=>({wardId,supplyCenters:factionCounts(map,state.board,wardId).supplyCenters,controlledRegions:Object.values(state.board.regionControl).filter(r=>r.controllerWardId===wardId).length,units:state.board.units.filter(u=>u.ownerWardId===wardId).length})).sort((a,b)=>b.supplyCenters-a.supplyCenters||a.wardId.localeCompare(b.wardId));
  return rows.map((row)=>({...row,rank:rows.findIndex(r=>r.supplyCenters===row.supplyCenters)+1}));
}
/** Called only after an SC update or the completed winter adjustments. */
export function evaluateGameEnd(map:MapDefinition,state:GameSessionState,checkpoint:'sc-update'|'winter',previouslyEliminated:WardId[]=[]):EndResult|null {
  const standings=finalStandings(map,state);
  const eliminated=checkpoint==='winter'?state.participants.filter(id=>!previouslyEliminated.includes(id)).flatMap(wardId=>{
    const c=factionCounts(map,state.board,wardId),reasons:('zero-sc'|'zero-non-sc')[]=[];
    if(c.supplyCenters===0) reasons.push('zero-sc');if(c.nonSCRegions===0) reasons.push('zero-non-sc');
    return reasons.length?[{wardId,reasons}]:[];
  }):[];
  const eligible=standings.filter(r=>r.supplyCenters>=state.victoryTargetSC&&conquestProgress(state,r.wardId).rivalInitialSC>=state.requiredRivalInitialSupplyCentersForInstantWin);
  const reason=checkpoint==='sc-update'?(eligible.length?'supply-target':null):eliminated.length?'elimination-final-year':state.year>=state.maxYears?'max-years':null;
  const candidates=checkpoint==='sc-update'?eligible:standings;
  const highest=Math.max(...candidates.map(r=>r.supplyCenters));
  return reason?{reason,year:state.year,season:state.season,winners:candidates.filter(r=>r.supplyCenters===highest).map(r=>r.wardId),standings,eliminated}:null;
}
