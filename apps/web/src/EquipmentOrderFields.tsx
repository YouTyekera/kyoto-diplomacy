import type { GameOrder } from '../../../packages/shared/events';

export function EquipmentOrderFields({draft,choices,choose,regionName,prefix}:{draft:GameOrder;choices:GameOrder[];choose:(o:GameOrder|undefined)=>void;regionName:(id:string)=>string;prefix:string}) {
  if(draft.type!=='bicycle-move'&&draft.type!=='deploy-barricade')return null;
  const matching=choices.filter(o=>o.type===draft.type&&'equipmentId'in o),ids=[...new Set(matching.map(o=>'equipmentId'in o?o.equipmentId:''))];
  const bikes=matching.filter((o):o is Extract<GameOrder,{type:'bicycle-move'}>=>o.type==='bicycle-move'&&o.equipmentId===draft.equipmentId);
  return <>
    <label>使用装備<select aria-label={`${prefix}使用装備`} value={draft.equipmentId} onChange={e=>choose(matching.find(o=>'equipmentId'in o&&o.equipmentId===e.target.value))}>{ids.map(id=><option key={id} value={id}>{id}</option>)}</select></label>
    {draft.type==='bicycle-move'?<>
      <label>経由地域<select aria-label={`${prefix}自転車経由`} value={draft.viaRegionId} onChange={e=>choose(bikes.find(o=>o.viaRegionId===e.target.value))}>{[...new Set(bikes.map(o=>o.viaRegionId))].map(id=><option key={id} value={id}>{regionName(id)}</option>)}</select></label>
      <label>第2区間の移動先<select aria-label={`${prefix}自転車移動先`} value={draft.destination} onChange={e=>choose(bikes.find(o=>o.viaRegionId===draft.viaRegionId&&o.destination===e.target.value))}>{bikes.filter(o=>o.viaRegionId===draft.viaRegionId).map(o=><option key={o.destination} value={o.destination}>{regionName(o.destination)}</option>)}</select></label>
      <p className="hint">攻撃力1・支援不可。第1区間に失敗すると第2区間へ進みません。</p>
    </>:<>
      <label>封鎖する隣接地域<select aria-label={`${prefix}バリケード対象`} value={draft.targetRegionId} onChange={e=>choose(matching.find(o=>o.type==='deploy-barricade'&&o.equipmentId===draft.equipmentId&&o.targetRegionId===e.target.value))}>{matching.filter(o=>o.type==='deploy-barricade'&&o.equipmentId===draft.equipmentId).map(o=><option key={o.type==='deploy-barricade'?o.targetRegionId:''} value={o.type==='deploy-barricade'?o.targetRegionId:''}>{o.type==='deploy-barricade'?regionName(o.targetRegionId):''}</option>)}</select></label>
      <p className="hint">軍は保持します。排除されなければ装備を消費し、次の移動季節から4季節封鎖します。地図を分断する辺は選べません。</p>
    </>}
  </>;
}
