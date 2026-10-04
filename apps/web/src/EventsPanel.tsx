import { useState,useRef } from 'react';
import { WARDS,type MapDefinition } from '../../../packages/shared/model';
import type { PublicEvents,Equipment,EventState } from '../../../packages/shared/events';

const names={bicycle:'自転車',barricade:'バリケード',roadwork:'道路工事',bus:'臨時バス'};
export interface EventFocus { regionIds:string[];key:number }
export function useEventLocator(){const serial=useRef(0),[focus,setFocus]=useState<EventFocus|null>(null),[highlight,setHighlight]=useState<string[]>([]);return {focus,highlight,onHighlight:setHighlight,onLocate:(regionIds:string[])=>setFocus({regionIds,key:++serial.current})};}
export function EventsPanel({events,counts,regionName,map,onHighlight,onLocate,compact=false}:{events:PublicEvents;counts:Record<string,{bicycle:number;barricade:number}>;regionName:(id:string)=>string;map?:MapDefinition;onHighlight?:(ids:string[])=>void;onLocate?:(ids:string[])=>void;compact?:boolean}) {
  const location=(id:string)=>`${regionName(id)}（${WARDS.find(w=>w.id===map?.regions.find(r=>r.regionId===id)?.wardId)?.name??'地域'}）`;
  function card(ids:string[],title:string,effect:string,key:string,attributes:Record<string,string>={},remaining?:number){return <li key={key} className="event-card" {...attributes} onMouseEnter={()=>onHighlight?.(ids)} onMouseLeave={()=>onHighlight?.([])} onFocus={()=>onHighlight?.(ids)} onBlur={()=>onHighlight?.([])} onClick={()=>onLocate?.(ids)}><div className="event-card-heading"><span className="event-icon" aria-hidden="true">{title==='道路工事'?'×':title==='臨時バス'?'↔':title==='自転車'?'◇':'⊣'}</span><strong>{title}</strong>{remaining!==undefined&&<span className="status-chip">残り{remaining}季</span>}</div><div className="event-targets">{ids.map(location).join(' ↔ ')}</div><p>{effect}</p><button onClick={e=>{e.stopPropagation();onLocate?.(ids);}}>地図で見る</button></li>;}
  return <section className="events-panel" aria-label="公開イベントと装備"><h3>今季の公開イベント</h3>
    <ul data-testid="current-events">{events.current.map(e=>card(e.regionId?[e.regionId]:e.edge?[e.edge.a,e.edge.b]:[],names[e.type],e.type==='roadwork'?'今季の移動・支援・撤退は通行不可':e.type==='bus'?'今季だけ、この2地域を接続': '撤退処理が終わった時点で、その地域にいる軍の勢力が装備を獲得します。',e.type,{'data-event-type':e.type}))}</ul>
    {!events.current.length&&<p>現在有効な新規イベントはありません。</p>}
    {!compact&&<p>道路工事・臨時バスは今季の移動と撤退のみ有効です。</p>}
    <details open><summary>マップ上の装備 · {events.groundEquipment.length}個</summary><ul>{events.groundEquipment.map(e=>card([e.regionId],names[e.type],`第${e.spawnedYear}年${e.spawnedSeason==='spring'?'春':'秋'}から配置 · 拾われるまで残ります`,e.equipmentId,{'data-ground-item':e.equipmentId}))}</ul></details>
    <details open><summary>継続中の封鎖 · {events.activeBarricades.length}辺</summary><ul aria-label="有効バリケード">{events.activeBarricades.map(b=>card([b.a,b.b],'バリケード','移動・支援・撤退は通行不可',b.barricadeId,{},b.remainingMovementSeasons))}</ul></details>
    <details open={!compact}><summary>勢力の装備所持数</summary><table aria-label="勢力装備所持数"><thead><tr><th>勢力</th><th>自転車</th><th>バリケード</th></tr></thead><tbody>{Object.entries(counts).map(([w,c])=><tr key={w} data-inventory-ward={w}><th>{WARDS.find(v=>v.id===w)?.name??w}</th><td data-equipment-type="bicycle">{c.bicycle}</td><td data-equipment-type="barricade">{c.barricade}</td></tr>)}</tbody></table></details>
  </section>;
}

/** Callers supply only their authenticated inventory online; counts above stay public. */
export function InventoryPanel({inventory,reservations,unitName,label='自分の装備と予約',developer=false,pulseKey=0}:{inventory:Equipment[];reservations:EventState['reservations'];unitName:(id:string)=>string;label?:string;developer?:boolean;pulseKey?:number}) {
  return <details aria-label={label}><summary className={pulseKey?'inventory-pulse':''} key={pulseKey}>{label} · {inventory.length}個</summary>
    {inventory.length?<ul>{inventory.map((e,i)=>{const r=reservations.find(r=>r.equipmentId===e.equipmentId);return <li key={e.equipmentId}>{WARDS.find(w=>w.id===e.ownerWardId)?.name} · {names[e.type]} {developer?e.equipmentId:i+1} · {r?`今季予約: ${unitName(r.unitId)}`:'使用可能'}</li>;})}</ul>:<p>所持装備はありません。撤退処理が終わった時点で、その地域にいる軍の勢力が装備を獲得します。</p>}
  </details>;
}
