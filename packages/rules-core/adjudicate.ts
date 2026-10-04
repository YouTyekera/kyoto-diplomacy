import type { AdjudicationInput, AdjudicationResponse, AdjudicationResult, DislodgedUnit, MoveOrder, Order, OrderOutcome } from './model';
import { validateOrderSet, playableIds } from './validation';
import { all, fixed, greater, none, solve, type Equation, type Range, type State } from './solver';

/** Army-only simultaneous adjudication, independently implemented from official rules.
 * Attack, prevent, hold and head-to-head defend strengths are deliberately distinct.
 * Source references and rationale: docs/RULES_CORE.md. No ownership/season mutation. */
export function adjudicate(input:AdjudicationInput,options:{unsupportedUnitIds?:ReadonlySet<string>}={}): AdjudicationResponse {
  const validation=validateOrderSet(input);if(!validation.ok) return validation;
  const units=[...input.units].sort((a,b)=>a.unitId.localeCompare(b.unitId));
  const byId=new Map(units.map(u=>[u.unitId,u])), occupant=new Map(units.map(u=>[u.regionId,u]));
  const orders=new Map<string,Order>(validation.orders.map(o=>[o.unitId,o]));
  const moves=validation.orders.filter((o):o is typeof o & MoveOrder=>o.type==='move').sort((a,b)=>a.unitId.localeCompare(b.unitId));
  const supports:Extract<Order,{type:'support-hold'|'support-move'}>[]=validation.orders.filter(o=>o.type==='support-hold'||o.type==='support-move').sort((a,b)=>a.unitId.localeCompare(b.unitId));
  const incoming=(regionId:string)=>moves.filter(o=>o.destination===regionId);
  const moveKey=(id:string)=>`move:${id}`, supportKey=(id:string)=>`support:${id}`;
  const directedTo=(o:typeof supports[number])=>o.type==='support-move'?o.destination:byId.get(o.targetUnitId)!.regionId;
  const matches=(o:typeof supports[number])=>{
    if(options.unsupportedUnitIds?.has(o.targetUnitId)) return false;
    const target=orders.get(o.targetUnitId)!;
    return o.type==='support-move'?target.type==='move'&&target.destination===o.destination:target.type!=='move';
  };
  const attacked=(o:typeof supports[number])=>incoming(byId.get(o.unitId)!.regionId).some(m=>
    byId.get(m.unitId)!.ownerWardId!==byId.get(o.unitId)!.ownerWardId && byId.get(m.unitId)!.regionId!==directedTo(o));
  const supporting=(unitId:string)=>supports.filter(s=>s.targetUnitId===unitId && matches(s));
  function strength(unitId:string,state:State,excludedOwner?:string):Range {
    const relevant=supporting(unitId).filter(s=>!excludedOwner||byId.get(s.unitId)!.ownerWardId!==excludedOwner);
    return {min:1+relevant.filter(s=>state.get(supportKey(s.unitId))===true).length,
      max:1+relevant.filter(s=>state.get(supportKey(s.unitId))!==false).length};
  }
  const head=(move:MoveOrder)=>{
    const defender=occupant.get(move.destination), opposite=defender&&orders.get(defender.unitId);
    return opposite?.type==='move'&&opposite.destination===byId.get(move.unitId)!.regionId ? opposite : undefined;
  };
  function prevent(move:MoveOrder,state:State):Range {
    const opposite=head(move), full=strength(move.unitId,state);
    if(!opposite) return full;
    const successful=state.get(moveKey(opposite.unitId));
    return successful===true?fixed(0):successful===false?full:{min:0,max:full.max};
  }
  function attack(move:MoveOrder,state:State):Range {
    const unit=byId.get(move.unitId)!,defender=occupant.get(move.destination),full=strength(move.unitId,state);
    if(!defender) return full;
    const defenderOrder=orders.get(defender.unitId)!;
    const vacant=!head(move)&&defenderOrder.type==='move'?state.get(moveKey(defender.unitId)):false;
    if(vacant===true) return full;
    const against=defender.ownerWardId===unit.ownerWardId?fixed(0):strength(unit.unitId,state,defender.ownerWardId);
    return vacant===false?against:{min:against.min,max:full.max};
  }
  function defense(move:MoveOrder,state:State):Range {
    const defender=occupant.get(move.destination);if(!defender) return fixed(0);
    if(head(move)) return strength(defender.unitId,state);
    if(orders.get(defender.unitId)!.type!=='move') return strength(defender.unitId,state);
    const vacant=state.get(moveKey(defender.unitId));return vacant===true?fixed(0):vacant===false?fixed(1):{min:0,max:1};
  }
  const equations:Equation[]=moves.map(move=>({id:moveKey(move.unitId),evaluate:state=>{
    const a=attack(move,state);
    return all([greater(a,defense(move,state)),...incoming(move.destination).filter(m=>m.unitId!==move.unitId).map(m=>greater(a,prevent(m,state)))]);
  }}));
  for(const support of supports) equations.push({id:supportKey(support.unitId),evaluate:state=>
    !matches(support)||attacked(support)?false:none(incoming(byId.get(support.unitId)!.regionId).map(m=>state.get(moveKey(m.unitId))))});
  const state=solve(equations);
  if(!state) return {ok:false,errors:[{code:'invalid-map',message:'陸軍裁定の依存条件に整合する解がありません'}]};
  const succeeds=(id:string)=>state.get(moveKey(id))===true;
  const dislodgedUnits:DislodgedUnit[]=[];
  for(const unit of units) if(!succeeds(unit.unitId)) {
    const attacker=incoming(unit.regionId).find(m=>succeeds(m.unitId));
    if(attacker) dislodgedUnits.push({unit:{...unit},attackerUnitId:attacker.unitId,
      attackerOrigin:byId.get(attacker.unitId)!.regionId,legalRetreatDestinations:[]});
  }
  const dislodged=new Set(dislodgedUnits.map(d=>d.unit.unitId));
  const remaining=units.filter(u=>!dislodged.has(u.unitId)).map(u=>{
    const order=orders.get(u.unitId)!;return {...u,regionId:order.type==='move'&&succeeds(u.unitId)?order.destination:u.regionId};
  });
  const standoffRegions=[...new Set(moves.map(m=>m.destination))].filter(id=>{
    const contenders=incoming(id);if(contenders.some(m=>succeeds(m.unitId))) return false;
    const values=contenders.map(m=>prevent(m,state).min), top=Math.max(...values);
    return top>0&&values.filter(v=>v===top).length>1;
  }).sort();
  const occupied=new Set(remaining.map(u=>u.regionId)),allowed=playableIds(input.map);
  for(const d of dislodgedUnits) d.legalRetreatDestinations=(input.map.adjacency[d.unit.regionId]??[])
    .filter(id=>allowed.has(id)&&!occupied.has(id)&&id!==d.attackerOrigin&&!standoffRegions.includes(id)).sort();
  const effectiveSupports=supports.filter(s=>state.get(supportKey(s.unitId))).map(s=>s.unitId);
  const cutSupports=supports.filter(s=>attacked(s)||dislodged.has(s.unitId)).map(s=>s.unitId);
  const orderResults:OrderOutcome[]=units.map(unit=>{
    const order=orders.get(unit.unitId)!, base={order:{...order},attackStrength:0,defenseStrength:strength(unit.unitId,state).min,
      preventStrength:0,effectiveSupports:supporting(unit.unitId).filter(s=>state.get(supportKey(s.unitId))).map(s=>s.unitId)};
    if(order.type==='move') {
      const success=succeeds(unit.unitId), reason=success?'moved':dislodged.has(unit.unitId)?'dislodged':attack(order,state).min===0?'self-dislodgement':
        standoffRegions.includes(order.destination)?'standoff':head(order)?'head-to-head':'blocked';
      return {...base,status:success?'success':'fail',reason,attackStrength:attack(order,state).min,
        defenseStrength:defense(order,state).min,preventStrength:prevent(order,state).min};
    }
    if(order.type==='hold') return {...base,status:dislodged.has(unit.unitId)?'fail':'success',reason:dislodged.has(unit.unitId)?'dislodged':'held'};
    const success=state.get(supportKey(unit.unitId))===true;
    return {...base,status:success?'success':'fail',reason:cutSupports.includes(unit.unitId)?'support-cut':matches(order)?'supported':'support-mismatch'};
  });
  const result:AdjudicationResult={units:remaining,orderResults,effectiveSupports,cutSupports,standoffRegions,dislodgedUnits,
    retreatOptions:dislodgedUnits.map(d=>({unitId:d.unit.unitId,destinations:[...d.legalRetreatDestinations]}))};
  return {ok:true,result};
}
