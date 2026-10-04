import { z } from 'zod';
import type { MapDefinition } from '../shared/model';
import { gameOrderSchema, eventStateSchema, type GameOrder, type EquipmentResult } from '../shared/events';
import { adjudicate, legalOrders, validateOrderSet, type Order } from '../rules-core';
import { effectiveMap, edge, edgeKey, safeRemoval } from './events';
import { applyMovementControl } from './control';
import type { GameSessionState, GameResponse, GameMovement } from './model';

export function normalOrder(o:GameOrder):Order {
  if(o.type==='bicycle-move')return {type:'move',unitId:o.unitId,destination:o.viaRegionId};
  if(o.type==='deploy-barricade')return {type:'hold',unitId:o.unitId};
  return o;
}
export function validateGameOrders(map:MapDefinition,state:GameSessionState,input:unknown):GameResponse<GameOrder[]> {
  const parsed=z.array(gameOrderSchema).safeParse(input);
  if(!parsed.success)return {ok:false,errors:['命令の形式が不正です']};
  const checkedState=eventStateSchema.safeParse(state.events);
  if(!checkedState.success)return {ok:false,errors:checkedState.error.issues.map(i=>i.message)};
  const orders=parsed.data.sort((a,b)=>a.unitId.localeCompare(b.unitId)),seasonMap=effectiveMap(map,state.events),errors:string[]=[],reserved=new Set<string>(),used=new Set<string>();
  const checked=validateOrderSet({map:seasonMap,units:state.board.units,orders:orders.map(normalOrder)});
  if(!checked.ok)errors.push(...checked.errors.map(e=>`[${e.code}] ${e.message}`));
  const persistent=[...state.events.activeBarricades.filter(b=>b.remainingMovementSeasons>1),...state.events.pendingBarricades];
  for(const o of orders)if(o.type==='bicycle-move'||o.type==='deploy-barricade') {
    const unit=state.board.units.find(u=>u.unitId===o.unitId);if(!unit)continue;
    const type=o.type==='bicycle-move'?'bicycle':'barricade',item=state.events.inventory.find(e=>e.equipmentId===o.equipmentId);
    if(!item||item.type!==type||item.ownerWardId!==unit.ownerWardId)errors.push('自勢力が所持する対応装備を選んでください');
    if(reserved.has(o.equipmentId))errors.push('同じ装備を複数の軍へ予約できません');reserved.add(o.equipmentId);
    const key=`${unit.ownerWardId}:${type}`;
    if(used.has(key))errors.push('自転車移動・バリケード設置は各勢力各1軍までです');used.add(key);
    if(o.type==='bicycle-move') {
      if(!seasonMap.adjacency[o.viaRegionId]?.includes(o.destination))errors.push('自転車の第2区間が有効隣接にありません');
    }else{
      const candidate=edge(unit.regionId,o.targetRegionId);
      if(!map.adjacency[unit.regionId]?.includes(o.targetRegionId))errors.push('バリケードは通常の恒久隣接辺だけに設置できます');
      if([...state.events.activeBarricades,...state.events.pendingBarricades].some(b=>edgeKey(b)===edgeKey(candidate)))errors.push('その辺は既にバリケードで封鎖されています');
      if(!safeRemoval(map,persistent,candidate))errors.push('この設置は地図を分断するため使えません');
      // Include earlier deployments as a safety guard for imported/test states with multiple items.
      if(safeRemoval(map,persistent,candidate))persistent.push({...candidate,barricadeId:'validation',ownerWardId:unit.ownerWardId,remainingMovementSeasons:4});
    }
  }
  return errors.length?{ok:false,errors}:{ok:true,result:orders};
}
export function reserveGameOrders(map:MapDefinition,state:GameSessionState,orders:unknown):GameResponse<GameSessionState> {
  const checked=validateGameOrders(map,state,orders);if(!checked.ok)return checked;
  return {ok:true,result:{...state,events:{...state.events,reservations:checked.result.flatMap(o=>o.type==='bicycle-move'||o.type==='deploy-barricade'?[{equipmentId:o.equipmentId,unitId:o.unitId,type:o.type==='bicycle-move'?'bicycle' as const:'barricade' as const}]:[])}}};
}
export function legalGameOrders(map:MapDefinition,state:GameSessionState,unitId:string,drafts:GameOrder[]=[]):GameOrder[] {
  const unit=state.board.units.find(u=>u.unitId===unitId);if(!unit)return [];
  const seasonMap=effectiveMap(map,state.events),candidates:GameOrder[]=legalOrders(seasonMap,state.board.units,unitId);
  // Maps are already validated at room/session creation. Re-parsing all 227 polygon
  // geometries for every GUI candidate would block Socket.IO publication for seconds.
  // The complete submitted sheet still passes validateGameOrders before mutation.
  const otherReservations=state.events.reservations.filter(r=>r.unitId!==unitId);
  const otherOrders=drafts.filter(o=>o.unitId!==unitId&&state.board.units.some(u=>u.unitId===o.unitId&&u.ownerWardId===unit.ownerWardId));
  const persistent=[...state.events.activeBarricades.filter(b=>b.remainingMovementSeasons>1),...state.events.pendingBarricades];
  for(const item of state.events.inventory.filter(e=>e.ownerWardId===unit.ownerWardId)) {
    if(otherReservations.some(r=>r.equipmentId===item.equipmentId)||otherReservations.some(r=>r.type===item.type&&state.events.inventory.some(e=>e.equipmentId===r.equipmentId&&e.ownerWardId===unit.ownerWardId)))continue;
    if(otherOrders.some(o=>item.type==='bicycle'?o.type==='bicycle-move':o.type==='deploy-barricade'))continue;
    if(item.type==='bicycle')for(const viaRegionId of seasonMap.adjacency[unit.regionId]??[])for(const destination of seasonMap.adjacency[viaRegionId]??[])candidates.push({type:'bicycle-move',unitId,viaRegionId,destination,equipmentId:item.equipmentId});
    else for(const targetRegionId of map.adjacency[unit.regionId]??[]){const candidate=edge(unit.regionId,targetRegionId);if(![...state.events.activeBarricades,...state.events.pendingBarricades].some(b=>edgeKey(b)===edgeKey(candidate))&&safeRemoval(map,persistent,candidate))candidates.push({type:'deploy-barricade',unitId,targetRegionId,equipmentId:item.equipmentId});}
  }
  return candidates;
}
/** Both legs use the same army adjudicator. The second stage contains only bicycle moves and Holds. */
export function resolveGameMovement(map:MapDefinition,state:GameSessionState,orders:GameOrder[]):GameResponse<GameSessionState> {
  orders=[...orders].sort((a,b)=>a.unitId.localeCompare(b.unitId));
  const reserved=reserveGameOrders(map,state,orders);if(!reserved.ok)return reserved;
  const events=structuredClone(reserved.result.events),seasonMap=effectiveMap(map,events);
  const bicycles=orders.filter(o=>o.type==='bicycle-move'),unsupported=new Set(bicycles.map(o=>o.unitId));
  const first=adjudicate({map:seasonMap,units:state.board.units,orders:orders.map(normalOrder)},{unsupportedUnitIds:unsupported});
  if(!first.ok)return {ok:false,errors:first.errors.map(e=>e.message)};
  const successes=bicycles.filter(o=>first.result.orderResults.some(r=>r.order.unitId===o.unitId&&r.status==='success'));
  const second=successes.length?adjudicate({map:seasonMap,units:first.result.units,orders:first.result.units.map(u=>{
    const bicycle=successes.find(o=>o.unitId===u.unitId);return bicycle?{type:'move',unitId:u.unitId,destination:bicycle.destination}:{type:'hold',unitId:u.unitId};
  })},{unsupportedUnitIds:unsupported}):{ok:true as const,result:{...first.result,orderResults:[],effectiveSupports:[],cutSupports:[],standoffRegions:[],dislodgedUnits:[],retreatOptions:[]}};
  if(!second.ok)return {ok:false,errors:second.errors.map(e=>e.message)};
  let board=applyMovementControl(state.board,first.result);board=applyMovementControl(board,second.result);
  const dislodgedUnits=[...first.result.dislodgedUnits,...second.result.dislodgedUnits],dislodged=new Set(dislodgedUnits.map(d=>d.unit.unitId));
  const standoffRegions=[...new Set([...first.result.standoffRegions,...second.result.standoffRegions])].sort(),occupied=new Set(second.result.units.map(u=>u.regionId));
  for(const d of dislodgedUnits)d.legalRetreatDestinations=(seasonMap.adjacency[d.unit.regionId]??[]).filter(to=>!occupied.has(to)&&to!==d.attackerOrigin&&!standoffRegions.includes(to)).sort();
  const equipmentResults:EquipmentResult[]=bicycles.map(o=>{
    const one=first.result.orderResults.find(r=>r.order.unitId===o.unitId)!,two=successes.includes(o)?second.result.orderResults.find(r=>r.order.unitId===o.unitId):undefined;
    return {unitId:o.unitId,type:'bicycle',viaRegionId:o.viaRegionId,destination:o.destination,status:two?.status??'fail',reason:one.status==='fail'?'第1区間失敗。元の地域に留まるか、排除時は撤退':two?.status==='success'?'両区間成功': '第2区間失敗。経由地域に留まる',firstLeg:{status:one.status,reason:one.reason},...(two?{secondLeg:{status:two.status,reason:two.reason}}:{})};
  });
  for(const o of orders)if(o.type==='deploy-barricade') {
    const unit=state.board.units.find(u=>u.unitId===o.unitId)!,success=!dislodged.has(o.unitId);
    equipmentResults.push({unitId:o.unitId,type:'barricade',targetRegionId:o.targetRegionId,status:success?'success':'fail',reason:success?'設置成功。次の移動季節から4季節封鎖':'排除により設置失敗。装備は撤退結果まで予約'});
    if(success){events.inventory=events.inventory.filter(e=>e.equipmentId!==o.equipmentId);events.reservations=events.reservations.filter(r=>r.equipmentId!==o.equipmentId);events.pendingBarricades.push({barricadeId:`barrier-${o.equipmentId}`,...edge(unit.regionId,o.targetRegionId),ownerWardId:unit.ownerWardId,remainingMovementSeasons:4});}
  }
  const movement:GameMovement={...first.result,units:second.result.units,dislodgedUnits,standoffRegions,retreatOptions:dislodgedUnits.map(d=>({unitId:d.unit.unitId,destinations:d.legalRetreatDestinations})),equipmentResults};
  const publicOrders=orders.map(o=>{if('equipmentId' in o){const {equipmentId,...rest}=o;void equipmentId;return rest;}return o;});
  return {ok:true,result:{...state,board,events:eventStateSchema.parse(events),movement,presentation:{id:`${state.year}:${state.season}`,year:state.year,season:state.season as 'spring'|'autumn',before:structuredClone(state.board.units),after:structuredClone(board.units),orders:publicOrders,movement:structuredClone(movement)},phase:'retreats',retreatResolved:false,retreatResult:null,scChanges:[]}};
}
