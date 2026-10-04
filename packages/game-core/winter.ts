import { z } from 'zod';
import { wardSchema, type MapDefinition, type WardId } from '../shared/model';
import type { Unit } from '../rules-core';
import { factionCounts } from './control';
import type { GameResponse, GameSessionState, WinterResult } from './model';

const winterOrdersSchema=z.object({builds:z.array(z.object({ownerWardId:wardSchema,regionId:z.string().min(1)}).strict()),disbands:z.array(z.string().min(1))}).strict();
export function winterBudget(map:MapDefinition,state:GameSessionState,wardId:WardId) {
  const counts=factionCounts(map,state.board,wardId),occupied=new Set(state.board.units.map(u=>u.regionId));
  const buildRegionIds=(state.homeBuildRegionIds[wardId]??[]).filter(id=>{
    const region=map.regions.find(r=>r.regionId===id);
    return region?.enabled&&region.playableGeometry&&region.isSupplyCenter&&
      state.board.regionControl[id]?.supplyCenterOwnerWardId===wardId&&!occupied.has(id);
  });
  return {...counts,buildCount:Math.max(0,counts.supplyCenters-counts.units),disbandCount:Math.max(0,counts.units-counts.supplyCenters),buildRegionIds};
}
/** Atomic winter: no automatic disband selection and no forced use of build capacity. */
export function resolveWinter(map:MapDefinition,state:GameSessionState,input:unknown):GameResponse<{units:Unit[];nextUnitSerial:number;summary:WinterResult}> {
  if(state.phase!=='adjustments'||state.season!=='winter') return {ok:false,errors:['冬の増減員フェイズではありません']};
  const parsed=winterOrdersSchema.safeParse(input);
  if(!parsed.success) return {ok:false,errors:['増減員入力の形式が不正です']};
  const {builds,disbands}=parsed.data,errors:string[]=[];
  if(new Set(disbands).size!==disbands.length) errors.push('解散対象が重複しています');
  if(new Set(builds.map(b=>b.regionId)).size!==builds.length) errors.push('増員先が重複しています');
  for(const id of disbands) if(!state.board.units.some(u=>u.unitId===id)) errors.push(`${id}: 解散する軍が存在しません`);
  for(const build of builds) {
    if(!state.participants.includes(build.ownerWardId)) errors.push('参加していない勢力の増員です');
    if(!winterBudget(map,state,build.ownerWardId).buildRegionIds.includes(build.regionId)) errors.push(`${build.regionId}: 空いた自勢力所有の初期地点SCではありません`);
  }
  for(const wardId of state.participants) {
    const budget=winterBudget(map,state,wardId);
    if(builds.filter(b=>b.ownerWardId===wardId).length>budget.buildCount) errors.push(`${wardId}: 増員可能数を超えています`);
    const count=disbands.filter(id=>state.board.units.find(u=>u.unitId===id)?.ownerWardId===wardId).length;
    if(count!==budget.disbandCount) errors.push(`${wardId}: 必要解散数${budget.disbandCount}体に対して${count}体が指定されています`);
  }
  if(errors.length) return {ok:false,errors};
  const units=state.board.units.filter(u=>!disbands.includes(u.unitId)).map(u=>({...u})),builtUnits:Unit[]=[];
  const ids=new Set(state.board.units.map(u=>u.unitId));let serial=state.nextUnitSerial;
  for(const build of [...builds].sort((a,b)=>a.ownerWardId.localeCompare(b.ownerWardId)||a.regionId.localeCompare(b.regionId))) {
    while(ids.has(`game-army-${serial}`)) serial++;
    const unit:Unit={unitId:`game-army-${serial++}`,ownerWardId:build.ownerWardId,regionId:build.regionId,type:'army'};
    ids.add(unit.unitId);builtUnits.push(unit);units.push({...unit});
  }
  units.sort((a,b)=>a.unitId.localeCompare(b.unitId));
  return {ok:true,result:{units,nextUnitSerial:serial,summary:{builtUnits,disbandedUnitIds:[...disbands].sort()}}};
}
