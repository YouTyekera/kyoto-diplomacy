import { inputSchema, type AdjudicationInput, type Order, type Unit, type ValidatedOrder, type ValidationIssue, type ValidationResult } from './model';
import type { MapDefinition } from '../shared/model';

export function playableIds(map:MapDefinition): Set<string> {
  return new Set(map.regions.filter(r=>r.enabled && r.playableGeometry!==null).map(r=>r.regionId));
}
export function validateBoard(map:MapDefinition, units:Unit[]): ValidationIssue[] {
  const errors:ValidationIssue[]=[], allowed=playableIds(map);
  if(new Set(map.regions.map(r=>r.regionId)).size!==map.regions.length) errors.push({code:'invalid-map',message:'地域IDが重複しています'});
  for(const id of allowed) if(!Array.isArray(map.adjacency[id])) errors.push({code:'invalid-map',message:`${id}: 最終隣接がありません`});
  for(const [from, neighbors] of Object.entries(map.adjacency)) for(const to of neighbors)
    if(from===to || !allowed.has(from) || !allowed.has(to) || !map.adjacency[to]?.includes(from))
      errors.push({code:'invalid-map',message:`${from} → ${to}: 不正または非対称な最終隣接です`});
  const ids=new Set<string>(), occupied=new Set<string>();
  for(const u of units) {
    if(ids.has(u.unitId)) errors.push({code:'duplicate-unit',unitId:u.unitId,message:'unitIdが重複しています'});
    if(occupied.has(u.regionId)) errors.push({code:'occupied-region',unitId:u.unitId,message:'同じ地域に複数のユニットがあります'});
    if(!allowed.has(u.regionId)) errors.push({code:'invalid-region',unitId:u.unitId,message:'配置地域が存在しない・除外・侵入不能です'});
    ids.add(u.unitId); occupied.add(u.regionId);
  }
  return errors;
}
export function validateOrderSet(input:unknown): ValidationResult {
  const parsed=inputSchema.safeParse(input);
  if(!parsed.success) return {ok:false,errors:parsed.error.issues.map(i=>({code:'invalid-shape',message:`${i.path.join('.')}: ${i.message}`}))};
  const {map,units,orders}=parsed.data, errors=validateBoard(map,units), allowed=playableIds(map);
  const byId=new Map(units.map(u=>[u.unitId,u])), submitted=new Set<string>();
  for(const order of orders) {
    const unit=byId.get(order.unitId);
    if(!unit) { errors.push({code:'unknown-unit',unitId:order.unitId,message:'命令対象のユニットが存在しません'}); continue; }
    if(submitted.has(order.unitId)) errors.push({code:'duplicate-order',unitId:order.unitId,message:'同じユニットに複数命令があります'});
    submitted.add(order.unitId);
    if(order.type==='hold') continue;
    let destination:string;
    if(order.type==='move') destination=order.destination;
    else {
      const target=byId.get(order.targetUnitId);
      if(!target) {errors.push({code:'unknown-unit',unitId:unit.unitId,message:'支援対象が存在しません'});continue;}
      destination=order.type==='support-move'?order.destination:target.regionId;
      if(target.unitId===unit.unitId || destination===unit.regionId) errors.push({code:'self-reference',unitId:unit.unitId,message:'自分自身や自地域を支援できません'});
      if(order.type==='support-move' && (!allowed.has(destination) || !map.adjacency[target.regionId]?.includes(destination)))
        errors.push({code:'non-adjacent',unitId:unit.unitId,message:'支援対象ユニットがその移動先へ移動できません'});
    }
    if(!allowed.has(destination)) errors.push({code:'invalid-region',unitId:unit.unitId,message:'命令先が存在しない・除外・侵入不能です'});
    if(destination===unit.regionId && order.type==='move') errors.push({code:'self-reference',unitId:unit.unitId,message:'自地域へのMoveはできません'});
    if(!map.adjacency[unit.regionId]?.includes(destination)) errors.push({code:'non-adjacent',unitId:unit.unitId,message:'最終隣接にない命令先です'});
  }
  for(const unit of units) if(!submitted.has(unit.unitId)) errors.push({code:'missing-order',unitId:unit.unitId,message:'命令が未入力です。自動Holdにはしません'});
  return errors.length?{ok:false,errors}:{ok:true,orders:orders as ValidatedOrder[]};
}
/** GUI candidates only; mismatching support orders remain legal but ineffective at adjudication. */
export function legalOrders(map:MapDefinition, units:Unit[], unitId:string): Order[] {
  const unit=units.find(u=>u.unitId===unitId); if(!unit) return [];
  const allowed=playableIds(map), adjacent=(map.adjacency[unit.regionId]??[]).filter(id=>allowed.has(id));
  const orders:Order[]=[{type:'hold',unitId},...adjacent.map(destination=>({type:'move' as const,unitId,destination}))];
  for(const target of units) if(target.unitId!==unitId) {
    if(adjacent.includes(target.regionId)) orders.push({type:'support-hold',unitId,targetUnitId:target.unitId});
    for(const destination of map.adjacency[target.regionId]??[]) if(adjacent.includes(destination) && destination!==unit.regionId)
      orders.push({type:'support-move',unitId,targetUnitId:target.unitId,destination});
  }
  return orders;
}
export function makeInput(map:MapDefinition, units:Unit[], orders:Order[]): AdjudicationInput { return {map,units,orders}; }
