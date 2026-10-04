import { useState } from 'react';
import type { MapDefinition } from '../../../packages/shared/model';
import type { GameStatePreview } from '../../../packages/shared/preview';
import { WARDS } from '../../../packages/shared/model';
import { adjudicate, legalOrders, resolveRetreats, type Unit, type Order, type AdjudicationResult, type RetreatOrder, type RetreatResult } from '../../../packages/rules-core';
import { reasonText } from '../../../packages/shared/rules-explanations';

interface Props {
  map:MapDefinition;initial:GameStatePreview;selected:string|null;
  onSelectRegion:(id:string)=>void;onBoardChange:(units:Unit[])=>void;onOrdersChange:(orders:Order[],units:Unit[])=>void;
}
const orderNames:Record<Order['type'],string>={hold:'Hold（保持）',move:'Move（移動）','support-hold':'Support Hold（保持支援）','support-move':'Support Move（移動支援）'};
export function RulesSandbox({map,initial,selected,onSelectRegion,onBoardChange,onOrdersChange}:Props) {
  const [units,setUnits]=useState<Unit[]>(()=>structuredClone(initial.units));
  const [orders,setOrders]=useState<Record<string,Order>>({});
  const [movement,setMovement]=useState<AdjudicationResult|null>(null);
  const [movementOrigins,setMovementOrigins]=useState<Unit[]>([]);
  const [retreatResult,setRetreatResult]=useState<RetreatResult|null>(null);
  const [stage,setStage]=useState<'orders'|'retreat'|'resolved'>('orders');
  const [errors,setErrors]=useState<string[]>([]);
  // Private submissions are never sent to the board, arrows or other units' public summaries.
  const [retreatSubmissions,setRetreatSubmissions]=useState<Record<string,RetreatOrder>>({});
  const [retreatUnitId,setRetreatUnitId]=useState('');
  const regionName=(id:string)=>map.regions.find(r=>r.regionId===id)?.name??id;
  const unitName=(u:Unit)=>`${regionName(u.regionId)} · ${WARDS.find(w=>w.id===u.ownerWardId)?.name}`;
  function orderDescription(order:Order,board:Unit[]) {
    if(order.type==='hold') return orderNames.hold;
    if(order.type==='move') return `${orderNames.move} → ${regionName(order.destination)}`;
    const target=board.find(u=>u.unitId===order.targetUnitId);
    return `${orderNames[order.type]}: ${target?unitName(target):order.targetUnitId}${order.type==='support-move'?` → ${regionName(order.destination)}`:''}`;
  }
  const unit=units.find(u=>u.regionId===selected)??units[0];
  const choices=unit?legalOrders(map,units,unit.unitId):[];
  const draft:Order|undefined=unit?(orders[unit.unitId]??{type:'hold',unitId:unit.unitId}):undefined;
  function updateOrders(next:Record<string,Order>) {setOrders(next);setErrors([]);onOrdersChange(Object.values(next),units);}
  function choose(candidate:Order|undefined) {if(candidate) updateOrders({...orders,[candidate.unitId]:candidate});}
  function updateBoard(next:Unit[]) {setUnits(next);onBoardChange(next);}
  function resolveMovement() {
    const response=adjudicate({map,units,orders:Object.values(orders)});
    if(!response.ok) {setErrors(response.errors.map(e=>`${e.unitId??''} [${e.code}] ${e.message}`));return;}
    setErrors([]);setMovementOrigins(units);setMovement(response.result);setRetreatResult(null);updateBoard(response.result.units);
    setRetreatSubmissions({});setRetreatUnitId(response.result.dislodgedUnits[0]?.unit.unitId??'');
    onOrdersChange([],response.result.units);
    setStage(response.result.dislodgedUnits.length?'retreat':'resolved');
  }
  function resolveRetreat() {
    if(!movement) return;
    const response=resolveRetreats(map,movement,Object.values(retreatSubmissions));
    if(!response.ok) {setErrors(response.errors.map(e=>`[${e.code}] ${e.message}`));return;}
    setErrors([]);setRetreatResult(response.result);updateBoard(response.result.units);setStage('resolved');
  }
  function reset() {
    updateBoard(structuredClone(initial.units));setOrders({});setMovement(null);setRetreatResult(null);
    setRetreatSubmissions({});setErrors([]);setStage('orders');onOrdersChange([],initial.units);
  }
  const retreating=movement?.dislodgedUnits.find(d=>d.unit.unitId===retreatUnitId);
  const currentRetreat=retreatSubmissions[retreatUnitId];
  const retreatChoice=currentRetreat?.type==='retreat'?currentRetreat.destination:'disband';
  return <section className="rules-sandbox">
    <h2>ルールサンドボックス</h2>
    <p className="preview-caption">ローカル裁定の検証用です。支配色・補給拠点の所有者・年・季節は変わりません。</p>
    <button onClick={reset}>初期Previewへリセット</button>
    {stage==='orders'&&<>
      <h3>移動命令 · 陸軍 {units.length}体</h3>
      {!unit?<p className="hint">ゲームプレビューでユニットを配置してから開いてください。</p>:<>
        <label>ユニット<select aria-label="サンドボックスユニット" value={unit.unitId} onChange={e=>onSelectRegion(units.find(u=>u.unitId===e.target.value)!.regionId)}>
          {units.map(u=><option key={u.unitId} value={u.unitId}>{unitName(u)}</option>)}
        </select></label>
        <label>命令種別<select aria-label="命令種別" value={draft!.type} onChange={e=>choose(choices.find(o=>o.type===e.target.value))}>
          {(Object.entries(orderNames) as [Order['type'],string][]).map(([type,name])=><option key={type} value={type} disabled={!choices.some(o=>o.type===type)}>{name}</option>)}
        </select></label>
        {(draft!.type==='support-hold'||draft!.type==='support-move')&&<label>支援対象<select aria-label="支援対象ユニット" value={draft!.targetUnitId} onChange={e=>choose(choices.find(o=>o.type===draft!.type&&'targetUnitId'in o&&o.targetUnitId===e.target.value))}>
          {units.filter(u=>choices.some(o=>o.type===draft!.type&&'targetUnitId'in o&&o.targetUnitId===u.unitId)).map(u=><option key={u.unitId} value={u.unitId}>{unitName(u)}</option>)}
        </select></label>}
        {(draft!.type==='move'||draft!.type==='support-move')&&<label>移動先<select aria-label="命令の移動先" value={draft!.destination} onChange={e=>{
          const candidate=choices.find(o=>o.type===draft!.type&&'destination'in o&&o.destination===e.target.value&&
            (!('targetUnitId'in draft!)||('targetUnitId'in o&&o.targetUnitId===draft!.targetUnitId)));choose(candidate);
        }}>
          {choices.filter(o=>o.type===draft!.type&&'destination'in o&&(!('targetUnitId'in draft!)||('targetUnitId'in o&&o.targetUnitId===draft!.targetUnitId)))
            .map(o=><option key={JSON.stringify(o)} value={'destination'in o?o.destination:''}>{'destination'in o?regionName(o.destination):''}</option>)}
        </select></label>}
        <button onClick={()=>choose(draft)}>この命令を確定</button>
      </>}
      <p className="hint">Moveは青実線、Supportは茶破線。支援と対象の実命令が不一致なら支援は失敗します。</p>
      <ul className="sandbox-orders">{units.map(u=><li key={u.unitId}><button onClick={()=>onSelectRegion(u.regionId)}>{unitName(u)}</button>: {orders[u.unitId]?orderDescription(orders[u.unitId],units):'未入力'}</li>)}</ul>
      <div className="button-row"><button disabled={!units.length} onClick={()=>{
        const next={...orders};for(const u of units) next[u.unitId]??={type:'hold',unitId:u.unitId};updateOrders(next);
      }}>未入力をHoldにする</button><button disabled={!units.length} onClick={resolveMovement}>裁定</button></div>
      <p className="hint">未入力の自動Holdはルール化していません。補助ボタンは明示操作です。</p>
    </>}
    {stage==='retreat'&&movement&&<>
      <h3>撤退入力 · {movement.dislodgedUnits.length}体</h3>
      <p className="retreat-notice">撤退フェイズ中は交渉禁止</p>
      <p className="hint">選択ユニットの入力だけを表示します。他の入力先は解決まで一覧・地図に出しません。同一ブラウザで各ユニットの視点を切り替える検証用UIです。</p>
      <label>排除されたユニット<select aria-label="撤退ユニット" value={retreatUnitId} onChange={e=>{setRetreatUnitId(e.target.value);setErrors([]);}}>
        {movement.dislodgedUnits.map(d=><option key={d.unit.unitId} value={d.unit.unitId}>{unitName(d.unit)}</option>)}
      </select></label>
      {retreating&&<>
        <p>攻撃元: {regionName(retreating.attackerOrigin)}</p>
        <label>撤退先<select aria-label="秘密入力の撤退先" value={retreatChoice} onChange={e=>{
          const next:RetreatOrder=e.target.value==='disband'?{type:'disband',unitId:retreatUnitId}:{type:'retreat',unitId:retreatUnitId,destination:e.target.value};
          setRetreatSubmissions({...retreatSubmissions,[retreatUnitId]:next});setErrors([]);
        }}>
          <option value="disband">解散</option>{retreating.legalRetreatDestinations.map(id=><option key={id} value={id}>{regionName(id)}</option>)}
        </select></label>
        <button onClick={()=>setRetreatSubmissions({...retreatSubmissions,[retreatUnitId]:currentRetreat??{type:'disband',unitId:retreatUnitId}})}>この撤退入力を確定</button>
        <p>{currentRetreat?'このユニットは入力済み':'このユニットは未入力'}{!retreating.legalRetreatDestinations.length?' · 合法な撤退先がなく解散します':''}</p>
      </>}
      <button onClick={resolveRetreat}>撤退を同時解決</button>
    </>}
    {stage==='resolved'&&<><h3>解決済み</h3><button onClick={()=>{setStage('orders');setOrders({});setErrors([]);setMovement(null);setRetreatResult(null);onOrdersChange([],units);}}>次の命令を試す</button></>}
    {errors.map((error,i)=><p className="issue error" role="alert" key={i}>{error}</p>)}
    {movement&&<div className="adjudication-results">
      <h3>裁定理由</h3><p>有効支援 {movement.effectiveSupports.length} · カット支援 {movement.cutSupports.length}</p>
      <p>スタンドオフ: {movement.standoffRegions.map(regionName).join('、')||'なし'}</p>
      {movement.orderResults.map(outcome=><div className={`issue ${outcome.status==='fail'?'failed-order':''}`} key={outcome.order.unitId}>
        <strong>{unitName(movementOrigins.find(u=>u.unitId===outcome.order.unitId)!)} · {orderDescription(outcome.order,movementOrigins)}</strong>
        <p>{outcome.status==='success'?'成功':'失敗'}: {reasonText[outcome.reason]} <code>{outcome.reason}</code></p>
        <span>攻撃 {outcome.attackStrength} / 防御 {outcome.defenseStrength} / 阻止 {outcome.preventStrength}</span>
      </div>)}
    </div>}
    {retreatResult&&<div className="retreat-results"><h3>同時撤退結果</h3>{retreatResult.outcomes.map(outcome=><p key={outcome.unitId}>{outcome.unitId}: {reasonText[outcome.reason]}{outcome.destination?` → ${regionName(outcome.destination)}`:''}</p>)}</div>}
  </section>;
}
