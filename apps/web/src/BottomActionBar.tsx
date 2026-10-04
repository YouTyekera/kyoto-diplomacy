import { useEffect, useState } from 'react';
import type { Unit } from '../../../packages/rules-core';
import { useRef } from 'react';
import type { SfxCue } from './audio/sfx-manager';
import type { GameOrder, Equipment } from '../../../packages/shared/events';
export type Action = 'move' | 'support' | 'support-hold' | 'support-move' | 'bicycle-move' | 'deploy-barricade' | null;
export function rightClickOrder(choices:GameOrder[],destination:string,action:Action,locked:boolean) {
  return !locked&&(!action||action==='move')?choices.find(o=>o.type==='move'&&o.destination===destination):undefined;
}
export function supportChoices(choices:GameOrder[],target:string) {
  return choices.filter(o=>(o.type==='support-hold'||o.type==='support-move')&&o.targetUnitId===target);
}
/** All committed objects come verbatim from the shared/server legal list. */
export function useMapCommands({units,ownUnits,legalOrders,inventory,choose,locked,contextKey,ownOrders=[],remove,onCue}:{
 units:Unit[];ownUnits:Unit[];legalOrders:Record<string,GameOrder[]>;inventory:Equipment[];
 choose:(order:GameOrder)=>void|boolean|Promise<void|boolean>;locked:boolean;contextKey:string;ownOrders?:GameOrder[];remove?:(unitId:string)=>void;onCue?:(cue:SfxCue)=>void;
}) {
 const [unitId,setUnitId]=useState<string|null>(null),[action,setAction]=useState<Action>(null);
 const [target,setTarget]=useState(''),[via,setVia]=useState(''),[item,setItem]=useState(''),[feedback,setFeedback]=useState('');
 const serial=useRef(0),[accepted,setAccepted]=useState<{key:number;order:GameOrder}|null>(null);
 function cancel(){setAction(null);setTarget('');setVia('');setItem('');setFeedback('');}
 useEffect(()=>{setUnitId(null);cancel();setFeedback('');setAccepted(null);},[contextKey]);
 useEffect(()=>{const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')cancel();};window.addEventListener('keydown',escape);return()=>window.removeEventListener('keydown',escape);},[]);
 useEffect(()=>{if(!feedback)return;const timer=setTimeout(()=>setFeedback(''),2200);return()=>clearTimeout(timer);},[feedback]);
 const unit=ownUnits.find(u=>u.unitId===unitId),choices=unit?legalOrders[unit.unitId]??[]:[];
 const firstItem=choices.find(o=>o.type===action&&'equipmentId'in o);
 const effectiveItem=item||(firstItem&&'equipmentId'in firstItem?firstItem.equipmentId:'');
 const typed=choices.filter(o=>(o.type===action||(action==='support'&&(o.type==='support-hold'||o.type==='support-move')))&&(!('equipmentId'in o)||o.equipmentId===effectiveItem));
 const candidates=typed.filter(o=>(!target||!('targetUnitId'in o)||o.targetUnitId===target)&&(!via||o.type!=='bicycle-move'||o.viaRegionId===via));
 const primary=choices.flatMap(o=>o.type==='move'?[o.destination]:[]);
 const targets=[...new Set(!action?primary:candidates.flatMap(o=>{
   if(o.type==='support-hold'||o.type==='support-move')return !target?units.filter(u=>u.unitId===o.targetUnitId).map(u=>u.regionId):action==='support-move'&&o.type==='support-move'?[o.destination]:[];
   if(o.type==='move')return [o.destination];
   if(o.type==='bicycle-move')return [via?o.destination:o.viaRegionId];
   if(o.type==='deploy-barricade')return [o.targetRegionId];return [];
 }))];
 const recommended=ownUnits.some(u=>u.unitId===target)?ownOrders.find(o=>o.unitId===target&&o.type==='move'):undefined;
 const recommendedOrder=recommended&&'destination'in recommended?choices.find(o=>o.type==='support-move'&&o.targetUnitId===target&&o.destination===recommended.destination):undefined;
 function begin(next:Action){cancel();setAction(next);}
 async function commit(order:GameOrder|undefined){if(!order||locked)return false;cancel();const ok=await choose(order);if(ok===false)return false;setAccepted({key:++serial.current,order});onCue?.('order-confirm');return true;}
 function change(){if(unit&&!locked){remove?.(unit.unitId);setAccepted(null);cancel();}}
 function select(regionId:string){
   if(locked)return;
   if(!unit||!action){const next=ownUnits.find(u=>u.regionId===regionId)?.unitId??null;if(next&&next!==unitId)onCue?.('select');setUnitId(next);cancel();return;}
   if(!targets.includes(regionId))return;
   if(action==='support'&&!target){setTarget(units.find(u=>u.regionId===regionId)?.unitId??'');return;}
   if(action==='bicycle-move'&&!via){setVia(regionId);return;}
   commit(candidates.find(o=>('destination'in o&&o.destination===regionId)||(o.type==='deploy-barricade'&&o.targetRegionId===regionId)));
 }
 async function rightClick(regionId:string){
   const order=rightClickOrder(choices,regionId,action,locked);
   if(!order){setFeedback(action&&action!=='move'?'操作中です。左クリックで対象を選んでください。':'移動できる地域を右クリックしてください。');return;}
   if(await commit(order))setFeedback('move:'+unit?.regionId+':'+regionId);
 }
 return {unit,choices,action,target,via,item:effectiveItem,targets:locked?[]:targets,primary:locked?[]:primary,inventory,locked,begin,cancel,change,select,commit,rightClick,feedback,recommendedOrder,accepted,
   supportKind:(next:'support-hold'|'support-move')=>{if(next==='support-hold')commit(supportChoices(choices,target).find(o=>o.type===next));else setAction(next);},
   setItem:(id:string)=>{setItem(id);setVia('');}};
}
export type MapCommands=ReturnType<typeof useMapCommands>;
export function describeOrder(order:GameOrder|import('../../../packages/game-core/model').ResolvedPublicOrder,units:Unit[],regionName:(id:string)=>string){
 const target='targetUnitId'in order?units.find(u=>u.unitId===order.targetUnitId):undefined;
 if(order.type==='support-hold')return (target?regionName(target.regionId):'対象軍')+'を現在地で支援';
 if(order.type==='support-move')return (target?regionName(target.regionId):'対象軍')+' → '+regionName(order.destination)+'への移動を支援';
 return (order.type==='hold'?'待機':order.type==='move'?'移動':order.type==='bicycle-move'?'自転車':'バリケード')+(order.type==='bicycle-move'?' · '+regionName(order.viaRegionId)+'経由':'')+('destination'in order?' → '+regionName(order.destination):'')+(order.type==='deploy-barricade'?' · '+regionName(order.targetRegionId)+'との辺':'');
}
export function BottomActionBar({commands:c,draft,units,regionName}:{commands:MapCommands;draft?:GameOrder;units:Unit[];regionName:(id:string)=>string}){
 if(!c.unit)return c.feedback?<p className="command-toast" role="status">{c.feedback}</p>:null;
 const instruction=c.action==='support'?!c.target?'どの軍を支援しますか？':'支援する軍の行動を選んでください。':c.action==='support-move'?'支援する移動先を地図で選んでください。':c.action==='bicycle-move'?c.via?'次の移動先を地図で選んでください。':'経由する地域を地図で選んでください。':c.action==='deploy-barricade'?'封鎖する辺の相手地域を選んでください。':'移動先を地図で選んでください。';
 const equipmentType=c.action==='bicycle-move'?'bicycle':c.action==='deploy-barricade'?'barricade':null;
 const equipment=c.inventory.filter(e=>e.type===equipmentType&&c.choices.some(o=>'equipmentId'in o&&o.equipmentId===e.equipmentId&&o.type===c.action));
 const parts=c.feedback.split(':');
 return <section className="bottom-action-bar command-dock" aria-label="選択軍の操作"><div className="command-dock-heading"><span className="command-army-icon" aria-hidden="true">▲</span><div><small>選択中のArmy · 現在地</small><strong>{regionName(c.unit.regionId)}の軍</strong></div><span className="command-summary" role="status">{draft?describeOrder(draft,units,regionName):'命令未入力'}</span></div>
 <fieldset disabled={c.locked}><div className="action-buttons">
 <button onClick={()=>c.commit(c.choices.find(o=>o.type==='hold'))}>待機</button>
 <button disabled={!c.primary.length} aria-pressed={c.action==='move'} onClick={()=>c.begin('move')}>移動</button>
 <button disabled={!c.choices.some(o=>o.type.startsWith('support'))} aria-pressed={!!c.action?.startsWith('support')} onClick={()=>c.begin('support')}>支援</button>
 {c.inventory.some(e=>e.type==='bicycle')&&<button disabled={!c.choices.some(o=>o.type==='bicycle-move')} onClick={()=>c.begin('bicycle-move')}>自転車</button>}
 {c.inventory.some(e=>e.type==='barricade')&&<button disabled={!c.choices.some(o=>o.type==='deploy-barricade')} onClick={()=>c.begin('deploy-barricade')}>バリケード</button>}
 {draft&&<button onClick={c.change}>命令を変更</button>}{c.action&&<button onClick={c.cancel}>キャンセル</button>}
 </div>
 {c.action==='support'&&c.target&&<div className="action-buttons"><strong>{regionName(units.find(u=>u.unitId===c.target)!.regionId)}の軍</strong><button disabled={!supportChoices(c.choices,c.target).some(o=>o.type==='support-hold')} onClick={()=>c.supportKind('support-hold')}>この軍の現在地を守る</button><button disabled={!supportChoices(c.choices,c.target).some(o=>o.type==='support-move')} onClick={()=>c.supportKind('support-move')}>この軍の移動を支援する</button></div>}
 {c.target&&c.recommendedOrder&&'destination'in c.recommendedOrder&&<button onClick={()=>c.commit(c.recommendedOrder)}>現在の移動命令: {regionName(c.recommendedOrder.destination)} を支援</button>}
 {equipment.length>1&&<label>使用する装備<select aria-label="使用する装備" value={c.item} onChange={e=>c.setItem(e.target.value)}>{equipment.map((e,i)=><option key={e.equipmentId} value={e.equipmentId}>{equipmentType==='bicycle'?'自転車':'バリケード'} {i+1}</option>)}</select></label>}
 {c.action&&<p role="status">{instruction}</p>}</fieldset>
 {c.feedback&&<p className="command-toast" role="status">{parts[0]==='move'?regionName(parts[1])+' → '+regionName(parts[2])+'へ移動':c.feedback}</p>}
 </section>;
}

