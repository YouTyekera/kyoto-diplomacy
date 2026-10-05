import type { ResolutionPresentation } from '../game-core/model';

export interface PlaybackGroup { stage:1|2; unitIds:string[]; regionIds:string[]; wardId:string; start:number; end:number }
export interface PlaybackPlan { groups:PlaybackGroup[]; duration:number }
/** Conservative dependency graph for DISPLAY ONLY. Never determines order success or modifies a board. */
export function planPlayback(snapshot:ResolutionPresentation):PlaybackPlan {
  const units=new Map(snapshot.before.map(u=>[u.unitId,u])),orders=snapshot.orders;
  const adjacent=new Map(orders.map(o=>[o.unitId,new Set<string>()]));
  const touched=(o:typeof orders[number])=>new Set([units.get(o.unitId)?.regionId,...('destination'in o?[o.destination]:[]),...('viaRegionId'in o?[o.viaRegionId]:[]),...('targetRegionId'in o?[o.targetRegionId]:[])].filter((id):id is string=>!!id));
  const footprints=new Map(orders.map(o=>[o.unitId,touched(o)]));
  function link(a:string,b:string){if(a!==b&&adjacent.has(a)&&adjacent.has(b)){adjacent.get(a)!.add(b);adjacent.get(b)!.add(a);}}
  for(const o of orders){
    if('targetUnitId'in o)link(o.unitId,o.targetUnitId);
    for(const other of orders)if(o.unitId!==other.unitId&&[...footprints.get(o.unitId)!].some(r=>footprints.get(other.unitId)!.has(r)))link(o.unitId,other.unitId);
  }
  const visited=new Set<string>(),peaceful=new Map<string,string[]>(),conflicts:string[][]=[];
  for(const o of orders){
    if(visited.has(o.unitId))continue;
    const component:string[]=[],queue=[o.unitId];
    while(queue.length){const id=queue.pop()!;if(visited.has(id))continue;visited.add(id);component.push(id);queue.push(...adjacent.get(id)!);}
    const interactive=component.length>1||component.some(id=>{
      const order=orders.find(o=>o.unitId===id)!;
      return order.type!=='move'&&order.type!=='hold'||snapshot.movement.orderResults.some(r=>r.order.unitId===id&&r.status==='fail')||snapshot.movement.dislodgedUnits.some(d=>d.unit.unitId===id);
    });
    if(interactive)conflicts.push(component.sort());
    else if(o.type==='move'){const ward=units.get(o.unitId)!.ownerWardId;peaceful.set(ward,[...(peaceful.get(ward)??[]),o.unitId]);}
  }
  let cursor=0;
  const groups:PlaybackGroup[]=[];
  function append(ids:string[],stage:1|2){const start=cursor;cursor+=stage===1?700:2400;groups.push({stage,unitIds:ids,regionIds:[...new Set(ids.flatMap(id=>[...footprints.get(id)!]))],wardId:units.get(ids[0])!.ownerWardId,start,end:cursor});}
  for(const [,ids]of [...peaceful].sort(([a],[b])=>a.localeCompare(b)))append(ids,1);
  for(const ids of conflicts.sort((a,b)=>a[0].localeCompare(b[0])))append(ids,2);
  return {groups,duration:cursor+1100};
}
export function playbackGroup(plan:PlaybackPlan,elapsed:number){return plan.groups.find(g=>elapsed>=g.start&&elapsed<g.end);}
/** Maps each unit's display clock into the existing interpolation, after all rules have resolved. */
export function unitPlaybackTime(plan:PlaybackPlan,id:string,elapsed:number){
  const group=plan.groups.find(g=>g.unitIds.includes(id));
  if(!group)return elapsed>=plan.duration-1100?3400:0;
  if(elapsed<group.start)return 0;
  if(elapsed>=group.end)return 3400;
  const progress=(elapsed-group.start)/(group.end-group.start);
  // Stage 2 first shows support, then movement, then the resolved impact.
  return group.stage===2?progress<.2?progress/.2*400:progress<.8?400+(progress-.2)/.6*1600:2000+(progress-.8)/.2*1400:400+progress*1600;
}
