import { z } from 'zod';
import type { MapDefinition } from '../shared/model';
import { retreatOrderSchema, type AdjudicationResult, type RetreatResult, type ValidationIssue } from './model';
import { playableIds, validateBoard } from './validation';
import type { GameStatePreview } from '../shared/preview';

/** Game sessions supply post-movement control; the standalone rules sandbox has no territorial board. */
export function legalRetreatDestinations(map:MapDefinition,movement:Pick<AdjudicationResult,'units'|'dislodgedUnits'|'standoffRegions'>,unitId:string,control?:GameStatePreview['regionControl']):string[] {
  const d=movement.dislodgedUnits.find(d=>d.unit.unitId===unitId);if(!d)return [];
  const occupied=new Set(movement.units.map(u=>u.regionId)),allowed=playableIds(map);
  return (map.adjacency[d.unit.regionId]??[]).filter(to=>allowed.has(to)&&!occupied.has(to)&&to!==d.attackerOrigin&&!movement.standoffRegions.includes(to)&&
    (!control||control[to]?.controllerWardId===d.unit.ownerWardId)).sort();
}

export function resolveRetreats(map:MapDefinition, movement:AdjudicationResult, submissions:unknown,control?:GameStatePreview['regionControl']):
  {ok:true;result:RetreatResult}|{ok:false;errors:ValidationIssue[]} {
  const parsed=z.array(retreatOrderSchema).safeParse(submissions);
  if(!parsed.success) return {ok:false,errors:[{code:'invalid-shape',message:'撤退命令の形式が不正です'}]};
  const errors=validateBoard(map,movement.units), byId=new Map(movement.dislodgedUnits.map(d=>[d.unit.unitId,d]));
  const submitted=new Set<string>(),options=new Map(movement.dislodgedUnits.map(d=>[d.unit.unitId,legalRetreatDestinations(map,movement,d.unit.unitId,control)]));
  const legal=(id:string,destination:string)=>options.get(id)!.includes(destination);
  for(const order of parsed.data) {
    if(!byId.has(order.unitId)) {errors.push({code:'unknown-unit',unitId:order.unitId,message:'排除されたユニットではありません'});continue;}
    if(submitted.has(order.unitId)) errors.push({code:'duplicate-order',unitId:order.unitId,message:'撤退命令が重複しています'});
    submitted.add(order.unitId);
    if(order.type==='retreat'&&!legal(order.unitId,order.destination)) errors.push({code:'invalid-retreat',unitId:order.unitId,message:'合法な撤退先ではありません'});
  }
  const actualOptions=(id:string)=>options.get(id)!;
  for(const d of movement.dislodgedUnits) if(!submitted.has(d.unit.unitId)&&actualOptions(d.unit.unitId).length)
    errors.push({code:'missing-order',unitId:d.unit.unitId,message:'撤退か解散を入力してください'});
  if(errors.length) return {ok:false,errors};
  const destinations=parsed.data.filter(o=>o.type==='retreat').map(o=>o.destination);
  const units=movement.units.map(u=>({...u})),outcomes:RetreatResult['outcomes']=[];
  for(const d of [...movement.dislodgedUnits].sort((a,b)=>a.unit.unitId.localeCompare(b.unit.unitId))) {
    const order=parsed.data.find(o=>o.unitId===d.unit.unitId);
    if(order?.type==='retreat'&&destinations.filter(id=>id===order.destination).length===1) {
      units.push({...d.unit,regionId:order.destination});outcomes.push({unitId:d.unit.unitId,status:'retreated',reason:'retreated',destination:order.destination});
    } else outcomes.push({unitId:d.unit.unitId,status:'disbanded',reason:order?.type==='retreat'?'retreat-collision':actualOptions(d.unit.unitId).length===0?'no-retreat':'disbanded'});
  }
  units.sort((a,b)=>a.unitId.localeCompare(b.unitId));
  return {ok:true,result:{units,outcomes,disbandedUnitIds:outcomes.filter(o=>o.status==='disbanded').map(o=>o.unitId)}};
}
