import defaults from '../../data/config/event-settings.json' with { type:'json' };
import type { MapDefinition, WardId } from '../shared/model';
import type { GameStatePreview } from '../shared/preview';
import { eventSettingsSchema, eventStateSchema, type Edge, type EventState, type EventSettings, type EventType, type PublicEvents } from '../shared/events';
import { playableIds } from '../rules-core/validation';

export const defaultEventSettings=eventSettingsSchema.parse(defaults);
export const noEvents:EventSettings={weights:{bicycle:0,barricade:0,roadwork:0,bus:0}};
export const edge=(a:string,b:string):Edge=>a<b?{a,b}:{a:b,b:a};
export const edgeKey=(e:Edge)=>JSON.stringify([e.a,e.b]);
export function initialEvents(seed='local-game',settings:EventSettings=defaultEventSettings):EventState {
  return eventStateSchema.parse({seed,settings,rngCounter:0,nextEquipmentSerial:1,current:[],groundEquipment:[],inventory:[],reservations:[],activeBarricades:[],pendingBarricades:[],roadworkEdges:[],temporaryBusEdges:[]});
}
/** Canonical undirected graph. Neither the map nor any source arrays are modified. */
export function buildEffectiveAdjacency(base:Record<string,string[]>,barricades:Edge[],roadworks:Edge[],buses:Edge[],allowed=new Set(Object.keys(base))):Record<string,string[]> {
  const graph=new Map([...allowed].sort().map(id=>[id,new Set<string>()]));
  const removed=new Set([...barricades,...roadworks].map(e=>edgeKey(edge(e.a,e.b))));
  for(const [a,neighbors] of Object.entries(base))for(const b of neighbors)if(a!==b&&allowed.has(a)&&allowed.has(b)&&!removed.has(edgeKey(edge(a,b)))) {graph.get(a)!.add(b);graph.get(b)!.add(a);}
  for(const {a,b} of buses)if(a!==b&&allowed.has(a)&&allowed.has(b)){graph.get(a)!.add(b);graph.get(b)!.add(a);}
  return Object.fromEntries([...graph].map(([id,neighbors])=>[id,[...neighbors].sort()]));
}
export function effectiveMap(map:MapDefinition,events:Pick<PublicEvents,'activeBarricades'|'roadworkEdges'|'temporaryBusEdges'>):MapDefinition {
  return {...map,adjacency:buildEffectiveAdjacency(map.adjacency,events.activeBarricades,events.roadworkEdges,events.temporaryBusEdges,playableIds(map))};
}
function components(graph:Record<string,string[]>) {
  const seen=new Set<string>();let count=0;
  for(const root of Object.keys(graph))if(!seen.has(root)){count++;const queue=[root];seen.add(root);for(let i=0;i<queue.length;i++)for(const to of graph[queue[i]])if(!seen.has(to)){seen.add(to);queue.push(to);}}
  return count;
}
/** Existing disconnected components are preserved; a removal must never create a new one. */
export function safeRemoval(map:MapDefinition,persistent:Edge[],candidate:Edge) {
  const allowed=playableIds(map),before=buildEffectiveAdjacency(map.adjacency,persistent,[],[],allowed);
  return before[candidate.a]?.includes(candidate.b)&&components(before)===components(buildEffectiveAdjacency(before,[candidate],[],[],allowed));
}
function baseEdges(map:MapDefinition):Edge[] {return Object.entries(buildEffectiveAdjacency(map.adjacency,[],[],[],playableIds(map))).flatMap(([a,neighbors])=>neighbors.filter(b=>a<b).map(b=>({a,b})));}
function distance(graph:Record<string,string[]>,a:string,b:string) {
  const seen=new Set([a]),queue:[string,number][]=[[a,0]];
  for(let i=0;i<queue.length;i++){const [at,n]=queue[i];if(at===b)return n;if(n<3)for(const next of graph[at]??[])if(!seen.has(next)){seen.add(next);queue.push([next,n+1]);}}
  return Infinity;
}
export const eventCount=(participants:number)=>participants>=9?3:participants>=6?2:1;
/** FNV-1a + avalanche. Counter, year and season are saved inputs; no ambient randomness. */
export function seededValue(seed:string):number {
  let h=2166136261;for(let i=0;i<seed.length;i++){h^=seed.charCodeAt(i);h=Math.imul(h,16777619);}
  h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;h=Math.imul(h,0x846ca68b);h^=h>>>16;
  return (h>>>0)/4294967296;
}
export function generateEvents(map:MapDefinition,board:GameStatePreview,source:EventState,participants:WardId[],year:number,season:'spring'|'autumn'):EventState {
  const state=structuredClone(source);state.current=[];state.roadworkEdges=[];state.temporaryBusEdges=[];
  state.activeBarricades.push(...state.pendingBarricades);state.pendingBarricades=[];
  const random=()=>seededValue(`${state.seed}:${year}:${season}:${state.rngCounter++}`);
  const active=new Set(participants),controller=(id:string)=>board.regionControl[id]?.controllerWardId??null;
  const occupied=new Set(board.units.map(u=>u.regionId)),graph=buildEffectiveAdjacency(map.adjacency,[],[],[],playableIds(map));
  const preferred=<T>(all:T[],predicate:(v:T)=>boolean)=>{const p=all.filter(predicate);return p.length?p:all;};
  const candidates=(type:EventType):(string|Edge)[]=>{
    if(type==='bicycle'||type==='barricade') {
      // At most one unconsumed barricade item in the whole game (user's additional decision).
      if(type==='barricade'&&[...state.inventory,...state.groundEquipment].some(e=>e.type==='barricade'))return [];
      const all=map.regions.filter(r=>r.enabled&&r.playableGeometry&&!r.isSupplyCenter&&!occupied.has(r.regionId)&&!state.groundEquipment.some(e=>e.regionId===r.regionId)).map(r=>r.regionId).sort();
      return preferred(all,id=>new Set((graph[id]??[]).map(controller).filter((w):w is WardId=>w!==null&&active.has(w))).size>=2);
    }
    if(type==='roadwork') {
      const all=baseEdges(map).filter(e=>safeRemoval(map,state.activeBarricades,e));
      return preferred(all,e=>controller(e.a)!==controller(e.b));
    }
    const ids=Object.keys(graph).sort(),all:Edge[]=[];
    for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){const a=ids[i],b=ids[j];if(!graph[a].includes(b)&&[2,3].includes(distance(graph,a,b)))all.push({a,b});}
    return preferred(all,e=>controller(e.a)===null||controller(e.b)===null||controller(e.a)!==controller(e.b));
  };
  let types:EventType[]=['bicycle','barricade','roadwork','bus'];
  while(state.current.length<eventCount(participants.length)&&types.length) {
    const choices=types.map(type=>({type,candidates:candidates(type),weight:state.settings.weights[type]})).filter(c=>c.weight>0&&c.candidates.length);
    if(!choices.length)break;
    const total=choices.reduce((n,c)=>n+c.weight,0);let ticket=random()*total,choice=choices[choices.length-1];
    for(const c of choices){ticket-=c.weight;if(ticket<0){choice=c;break;}}
    types=types.filter(t=>t!==choice.type);
    const selected=choice.candidates[Math.floor(random()*choice.candidates.length)];
    if(typeof selected==='string'&&(choice.type==='bicycle'||choice.type==='barricade')) {
      state.groundEquipment.push({equipmentId:`equipment-${state.nextEquipmentSerial++}`,type:choice.type,regionId:selected,spawnedYear:year,spawnedSeason:season});
      state.current.push({type:choice.type,regionId:selected});
    }else if(typeof selected!=='string'){
      (choice.type==='roadwork'?state.roadworkEdges:state.temporaryBusEdges).push(selected);
      state.current.push({type:choice.type,edge:selected});
    }
  }
  return eventStateSchema.parse(state);
}
/** Called once after every associated Retreat resolution, before SC Update. */
export function settleEquipment(source:EventState,units:GameStatePreview['units']):EventState {
  const state=structuredClone(source),alive=new Set(units.map(u=>u.unitId));
  const lost=new Set(state.reservations.filter(r=>!alive.has(r.unitId)).map(r=>r.equipmentId));
  state.inventory=state.inventory.filter(e=>!lost.has(e.equipmentId));state.reservations=[];
  state.groundEquipment=state.groundEquipment.filter(e=>{
    const unit=units.find(u=>u.regionId===e.regionId);if(!unit)return true;
    state.inventory.push({equipmentId:e.equipmentId,type:e.type,ownerWardId:unit.ownerWardId});return false;
  });
  state.activeBarricades=state.activeBarricades.filter(b=>b.remainingMovementSeasons>1).map(b=>({...b,remainingMovementSeasons:b.remainingMovementSeasons-1}));
  state.roadworkEdges=[];state.temporaryBusEdges=[];state.current=[];
  return eventStateSchema.parse(state);
}
export function publicEvents(s:EventState):PublicEvents {return {current:s.current,groundEquipment:s.groundEquipment,roadworkEdges:s.roadworkEdges,temporaryBusEdges:s.temporaryBusEdges,activeBarricades:s.activeBarricades};}
export function inventoryCounts(s:EventState,wards:WardId[]) {return Object.fromEntries(wards.map(w=>[w,{bicycle:s.inventory.filter(e=>e.ownerWardId===w&&e.type==='bicycle').length,barricade:s.inventory.filter(e=>e.ownerWardId===w&&e.type==='barricade').length}]));}
