import { VictoryConditions } from './VictoryConditions';
import { playerMessage } from './player-language';
import { useState,useRef,useEffect,type RefObject } from 'react';
import { GameOver,downloadMatchLog } from './GameOver';
import type { MatchLog } from '../../../packages/shared/match';
import { startMatchLog,logTransition,summarizeMatch,exportMatchLog } from '../../../packages/game-core/match-log';
import { defaultGameSettings } from '../../../packages/online-core/initial';
import { WARDS, type MapDefinition, type WardId } from '../../../packages/shared/model';
import type { GameStatePreview } from '../../../packages/shared/preview';
import { type Unit } from '../../../packages/rules-core';
import { type GameOrder as Order,gameOrderNames } from '../../../packages/shared/events';
import { legalGameOrders,reserveGameOrders,inventoryCounts,noEvents } from '../../../packages/game-core';
import { EventsPanel,InventoryPanel,type useEventLocator } from './EventsPanel';
import { EquipmentOrderFields } from './EquipmentOrderFields';
import { createGameSession, adjudicateGameOrders, adjudicateGameRetreats, adjudicateGameWinter, advanceGame, winterBudget,
  factionCounts, type GameSessionState, type GameResponse, type WinterOrders } from '../../../packages/game-core';
import type { RetreatOrder } from '../../../packages/rules-core';
import { reasonText } from '../../../packages/shared/rules-explanations';
import { conquestProgress } from '../../../packages/game-core/end';
import { describeOrder } from './BottomActionBar';

export interface LocalUiMemory {
  orders:Record<string,Order>;origins:Unit[];retreatSubmissions:Record<string,RetreatOrder>;
  retreatId:string;winter:WinterOrders;winterWard:WardId|'';log:MatchLog|null;
}

interface Props {
  map:MapDefinition;preview:GameStatePreview;state:GameSessionState|null;initial:GameSessionState|null;selected:string|null;
  onStart:(state:GameSessionState)=>void;onChange:(state:GameSessionState)=>void;
  onSelectRegion:(id:string)=>void;onOrdersChange:(orders:Order[],units:Unit[])=>void;
  presentationLocked?:boolean;eventLocator?:ReturnType<typeof useEventLocator>;playerFacing?:boolean;commandRef?:RefObject<((order:Order|undefined,removeId?:string)=>void|boolean)|null>;
  memoryRef?:RefObject<LocalUiMemory|null>;
  inventoryPulseKey?:number;
}
const orderNames=gameOrderNames;
const phaseNames={orders:'移動命令',retreats:'撤退', 'sc-update':'補給拠点の所有権更新',adjustments:'冬の増減員','end-of-year':'冬後の脱落・年末判定',finished:'終了'};
const seasonNames={spring:'春',autumn:'秋',winter:'冬'};
export function GameSessionPanel({map,preview,state,initial,selected,onStart,onChange,onSelectRegion,onOrdersChange,playerFacing=false,presentationLocked=false,eventLocator,commandRef,memoryRef,inventoryPulseKey=0}:Props) {
  const [participants,setParticipants]=useState<WardId[]>(()=>[...new Set(preview.units.map(u=>u.ownerWardId))]);
  const [yearLimit,setYearLimit]=useState(String(defaultGameSettings.maxYears));
  const log=useRef<MatchLog|null>(memoryRef?.current?.log??null);
  useEffect(()=>{if(memoryRef?.current?.log&&memoryRef.current.log!==log.current)log.current=memoryRef.current.log;});
  function initializeLog(state:GameSessionState){log.current=startMatchLog({gameId:crypto.randomUUID(),scenarioHash:`local:${map.mapId}`,playerCount:state.participants.length,wardAssignment:Object.fromEntries(state.participants.map(id=>[id,id])),players:state.participants.map(id=>({playerId:id,nickname:'ローカル',wardId:id})),inactiveWards:WARDS.filter(w=>!state.participants.includes(w.id)).map(w=>w.id),rngSeed:state.events.seed,eventSettings:state.events.settings,victorySettings:{...defaultGameSettings,maxYears:state.maxYears},victoryTargetSC:state.victoryTargetSC},map,state,new Date().toISOString());}
  const [eventSeed,setEventSeed]=useState('local-game'),[eventsEnabled,setEventsEnabled]=useState(true);
  const [orders,setOrders]=useState<Record<string,Order>>(()=>memoryRef?.current?.orders??{});
  const [origins,setOrigins]=useState<Unit[]>(()=>memoryRef?.current?.origins??[]);
  const [retreatSubmissions,setRetreatSubmissions]=useState<Record<string,RetreatOrder>>(()=>memoryRef?.current?.retreatSubmissions??{});
  const [retreatId,setRetreatId]=useState(()=>memoryRef?.current?.retreatId??'');
  const [winter,setWinter]=useState<WinterOrders>(()=>memoryRef?.current?.winter??{builds:[],disbands:[]});
  const [winterWard,setWinterWard]=useState<WardId|''>(()=>memoryRef?.current?.winterWard??'');
  useEffect(()=>{if(memoryRef)memoryRef.current={orders,origins,retreatSubmissions,retreatId,winter,winterWard,log:log.current};});
  const [errors,setErrors]=useState<string[]>([]);
  const regionName=(id:string)=>map.regions.find(r=>r.regionId===id)?.name??id;
  const wardName=(id:string|null)=>WARDS.find(w=>w.id===id)?.name??'中立';
  const unitName=(u:Unit)=>`${regionName(u.regionId)} · ${wardName(u.ownerWardId)}`;
  const resolvedUnitName=(id:string)=>{const u=origins.find(u=>u.unitId===id)??state?.movement?.dislodgedUnits.find(d=>d.unit.unitId===id)?.unit??state?.board.units.find(u=>u.unitId===id);return u?unitName(u):'解散した軍';};
  function describe(order:Order) {
    if(playerFacing)return describeOrder(order,[...origins,...(state?.board.units??[])],regionName);
    const target='targetUnitId'in order?(origins.find(u=>u.unitId===order.targetUnitId)??state?.board.units.find(u=>u.unitId===order.targetUnitId)):undefined;
    return `${orderNames[order.type]}${target?` 支援対象: ${unitName(target)}`:''}${order.type==='bicycle-move'?` 経由 ${regionName(order.viaRegionId)}`:''}${'destination'in order?` → ${regionName(order.destination)}`:''}${order.type==='deploy-barricade'?` 対象 ${regionName(order.targetRegionId)}`:''}`;
  }
  function apply(response:GameResponse,before=state) {
    if(presentationLocked)return;
    if(!response.ok) {setErrors(response.errors);return;}
    if(before&&log.current)log.current=logTransition(log.current,map,before,response.result,new Date().toISOString(),before.phase==='orders'?Object.values(orders):[]);
    setErrors([]);onChange(response.result);
    if(response.result.phase!=='orders') onOrdersChange([],response.result.board.units);
    if(response.result.phase==='orders') {setOrders({});setOrigins([]);setRetreatSubmissions({});setWinter({builds:[],disbands:[]});}
  }
  function choose(order:Order|undefined,removeId?:string) {
    if(!state||(!order&&!removeId)||presentationLocked)return false;const next={...orders};if(order)next[order.unitId]=order;else if(removeId)delete next[removeId];
    const reserved=reserveGameOrders(map,state,state.board.units.map(u=>next[u.unitId]??{type:'hold',unitId:u.unitId}));
    if(!reserved.ok){setErrors(reserved.errors);return false;}
    onChange(reserved.result);setOrders(next);setErrors([]);onOrdersChange(Object.values(next),state.board.units);return true;
  }
  useEffect(()=>{if(commandRef)commandRef.current=choose;});
  function next() {
    if(!state) return;
    if(state.phase==='retreats'&&!state.retreatResolved&&!state.movement?.dislodgedUnits.length) {
      const resolved=adjudicateGameRetreats(map,state,[]);if(!resolved.ok) {apply(resolved);return;}
      if(log.current)log.current=logTransition(log.current,map,state,resolved.result,new Date().toISOString());
      apply(advanceGame(map,resolved.result),resolved.result);return;
    }
    apply(advanceGame(map,state));
  }
  const unit=state?.board.units.find(u=>u.regionId===selected)??state?.board.units[0];
  const choices=unit&&state?legalGameOrders(map,state,unit.unitId,Object.values(orders)):[];
  const draft:Order|undefined=unit?(orders[unit.unitId]??{type:'hold',unitId:unit.unitId}):undefined;
  const retreating=state?.movement?.dislodgedUnits.find(d=>d.unit.unitId===retreatId)??state?.movement?.dislodgedUnits[0];
  const privateOrder=retreating?retreatSubmissions[retreating.unit.unitId]:undefined;
  const activeWard=winterWard||state?.participants[0];
  const budget=state&&activeWard?winterBudget(map,state,activeWard):null;
  return <section className="game-session"><fieldset disabled={presentationLocked}>
    <h2>年間進行（ローカル）</h2>{state && <VictoryConditions game={state} />}
    {!state?<>
      <p>{playerFacing?'このPCで全勢力を操作する試行モードです。地図エディタとGame Previewで用意した盤面を使います。初期設定には軍がないため、先に地図設定を読み込んでください。':'現在のPreviewの支配・補給拠点の所有・軍をコピーして開始します。初期地点は地図設定のstartingUnitから固定します。'}</p>
      <h3>参加勢力</h3><p className="hint">初期選択は現在の軍の所有勢力です。未参加の区を脱落判定へ含めません。</p>
      <div className="participant-list">{WARDS.map(w=><label className="check" key={w.id}><input type="checkbox" aria-label={`参加勢力 ${w.name}`} checked={participants.includes(w.id)} onChange={e=>setParticipants(ids=>e.target.checked?[...ids,w.id]:ids.filter(id=>id!==w.id))} />{w.name}</label>)}</div>
      <label>規定年数（試遊用・変更可能）<input type="number" min="1" step="1" aria-label="規定年数" value={yearLimit} onChange={e=>setYearLimit(e.target.value)} /></label>
      <p className="hint">試遊の既定は5年。同じ補給拠点数は同順位・同率勝者です。</p>
      <label>再現用イベントseed<input aria-label="イベントseed" value={eventSeed} onChange={e=>setEventSeed(e.target.value)} /></label>
      <label className="check"><input aria-label="公開イベントを有効にする（検証用）" type="checkbox" checked={eventsEnabled} onChange={e=>setEventsEnabled(e.target.checked)} />公開イベントを有効にする（検証用）</label>
      <button onClick={()=>{
        const response=createGameSession(map,preview,participants,yearLimit===''?null:Number(yearLimit),15,{seed:eventSeed||'local-game',settings:eventsEnabled?undefined:noEvents});
        if(!response.ok) {setErrors(response.errors);return;}
        initializeLog(response.result);setErrors([]);setWinterWard(response.result.participants[0]);onStart(response.result);
      }}>現在のPreviewから開始</button>
    </>:<>
      <p className="phase-banner" data-testid="game-phase">第{state.year}年 · {seasonNames[state.season]} · {phaseNames[state.phase]}</p>
      <EventsPanel map={map} onLocate={eventLocator?.onLocate} onHighlight={eventLocator?.onHighlight} events={state.events} counts={inventoryCounts(state.events,state.participants)} regionName={regionName} />
      <InventoryPanel pulseKey={inventoryPulseKey} label="ローカル装備と予約" inventory={state.events.inventory} reservations={state.events.reservations} unitName={id=>{const u=state.board.units.find(u=>u.unitId===id)??state.movement?.dislodgedUnits.find(d=>d.unit.unitId===id)?.unit;return u?unitName(u):id;}} />
      <p className="hint">開始時の地図・初期地点を固定しています。ローカル状態はタブを閉じると失われます。Preview・設定JSONは更新しません。</p>
      <button onClick={()=>{if(initial){initializeLog(initial);setOrders({});setOrigins([]);setRetreatSubmissions({});setWinter({builds:[],disbands:[]});setErrors([]);onChange(structuredClone(initial));onOrdersChange([],initial.board.units);}}}>年間進行を初期状態へリセット</button>
      <div className="table-scroll"><table aria-label="ゲーム勢力集計"><thead><tr><th>勢力</th><th>補給拠点</th><th>軍</th><th>補給拠点以外の支配地域</th><th>敵の初期補給拠点</th></tr></thead><tbody>{state.participants.map(id=>{
        const counts=factionCounts(map,state.board,id);return <tr key={id}><th>{wardName(id)}</th><td>{counts.supplyCenters}</td><td>{counts.units}</td><td>{counts.nonSCRegions}</td><td>{conquestProgress(state,id).rivalInitialSC} / {state.requiredRivalInitialSupplyCentersForInstantWin}</td></tr>;
      })}</tbody></table></div>
      {state.phase==='orders'&&<>
        <h3>全軍の移動命令</h3>
        {unit&&draft&&!playerFacing?<>
          <label>ユニット<select aria-label="年間進行ユニット" value={unit.unitId} onChange={e=>onSelectRegion(state.board.units.find(u=>u.unitId===e.target.value)!.regionId)}>{state.board.units.map(u=><option key={u.unitId} value={u.unitId}>{unitName(u)}</option>)}</select></label>
          <label>命令種別<select aria-label="年間命令種別" value={draft.type} onChange={e=>choose(choices.find(o=>o.type===e.target.value))}>{(Object.keys(orderNames) as Order['type'][]).map(type=><option key={type} value={type} disabled={!choices.some(o=>o.type===type)}>{orderNames[type]}</option>)}</select></label>
          {'targetUnitId'in draft&&<label>支援対象<select aria-label="年間支援対象" value={draft.targetUnitId} onChange={e=>choose(choices.find(o=>o.type===draft.type&&'targetUnitId'in o&&o.targetUnitId===e.target.value))}>{state.board.units.filter(u=>choices.some(o=>o.type===draft.type&&'targetUnitId'in o&&o.targetUnitId===u.unitId)).map(u=><option key={u.unitId} value={u.unitId}>{unitName(u)}</option>)}</select></label>}
          {'destination'in draft&&draft.type!=='bicycle-move'&&<label>移動先<select aria-label="年間移動先" value={draft.destination} onChange={e=>choose(choices.find(o=>o.type===draft.type&&'destination'in o&&o.destination===e.target.value&&(!('targetUnitId'in draft)||('targetUnitId'in o&&o.targetUnitId===draft.targetUnitId))))}>{choices.filter(o=>o.type===draft.type&&'destination'in o&&(!('targetUnitId'in draft)||('targetUnitId'in o&&o.targetUnitId===draft.targetUnitId))).map(o=><option key={JSON.stringify(o)} value={'destination'in o?o.destination:''}>{'destination'in o?regionName(o.destination):''}</option>)}</select></label>}
          <button onClick={()=>choose(draft)}>この年間命令を確定</button>
          <EquipmentOrderFields draft={draft} choices={choices} choose={choose} regionName={regionName} prefix="年間" />
          <p className="hint">装備命令は所持装備・今季の予約・有効経路を満たす場合だけ選択できます。各勢力、各種類1軍までです。</p>
        </>:<p>{unit?'地図上の軍を選び、下部の操作で命令を入力してください。':'軍がいません。空の命令集合で裁定できます。'}</p>}
        <ul className="sandbox-orders">{state.board.units.map(u=><li key={u.unitId}>{unitName(u)}: {orders[u.unitId]?describe(orders[u.unitId]):'未入力'}</li>)}</ul>
        <button onClick={()=>{const next={...orders};for(const u of state.board.units) next[u.unitId]??={type:'hold',unitId:u.unitId};setOrders(next);setErrors([]);onOrdersChange(Object.values(next),state.board.units);}}>年間の未入力をHoldにする</button>
        <button onClick={()=>{const response=adjudicateGameOrders(map,state,Object.values(orders));if(response.ok){setOrigins(state.board.units);setRetreatSubmissions({});setRetreatId(response.result.movement?.dislodgedUnits[0]?.unit.unitId??'');}apply(response);}}>移動を裁定</button>
      </>}
      {state.phase==='retreats'&&<>
        <h3>撤退 · {state.movement?.dislodgedUnits.length??0}体</h3><p className="retreat-notice">撤退フェイズ中は交渉禁止</p>
        {!state.movement?.dislodgedUnits.length?<p>撤退する軍はありません。</p>:state.retreatResolved?<p>同時撤退の解決済みです。</p>:<>
          <p className="hint">選択軍の入力だけを表示し、他の撤退先は解決まで地図・一覧へ出しません。</p>
          <label>撤退ユニット<select aria-label="年間撤退ユニット" value={retreating!.unit.unitId} onChange={e=>setRetreatId(e.target.value)}>{state.movement.dislodgedUnits.map(d=><option key={d.unit.unitId} value={d.unit.unitId}>{unitName(d.unit)}</option>)}</select></label>
          <p>攻撃元: {regionName(retreating!.attackerOrigin)}</p>
          <label>秘密入力の撤退先<select aria-label="年間秘密撤退先" value={privateOrder?.type==='retreat'?privateOrder.destination:'disband'} onChange={e=>{
            const id=retreating!.unit.unitId;setRetreatSubmissions({...retreatSubmissions,[id]:e.target.value==='disband'?{type:'disband',unitId:id}:{type:'retreat',unitId:id,destination:e.target.value}});
          }}><option value="disband">解散</option>{retreating!.legalRetreatDestinations.map(id=><option key={id} value={id}>{regionName(id)}</option>)}</select></label>
          <button onClick={()=>{const id=retreating!.unit.unitId;setRetreatSubmissions({...retreatSubmissions,[id]:privateOrder??{type:'disband',unitId:id}});}}>この年間撤退入力を確定</button>
          <p>{privateOrder?'選択軍は入力済み':'選択軍は未入力'}{!retreating!.legalRetreatDestinations.length?' · 撤退不能のため解散':''}</p>
          <button onClick={()=>apply(adjudicateGameRetreats(map,state,Object.values(retreatSubmissions)))}>年間撤退を同時解決</button>
        </>}
        <button disabled={!!state.movement?.dislodgedUnits.length&&!state.retreatResolved} onClick={next}>次へ進む</button>
      </>}
      {state.phase==='sc-update'&&<><h3>{seasonNames[state.season]}の補給拠点の所有権更新</h3><p>現在の支配勢力を補給拠点の所有者へ反映します。</p><ul>{map.regions.filter(r=>r.enabled&&r.playableGeometry&&r.isSupplyCenter).map(r=>{
        const control=state.board.regionControl[r.regionId];return <li key={r.regionId}>{r.name}: {wardName(control.supplyCenterOwnerWardId)} → {wardName(control.controllerWardId)}</li>;
      })}</ul><button onClick={next}>次へ進む</button></>}
      {state.phase==='adjustments'&&budget&&activeWard&&<>
        <h3>冬のBuild / Disband</h3>
        <ul>{state.participants.map(id=>{const b=winterBudget(map,state,id);return <li key={id}>{wardName(id)}: 増員可能 {b.buildCount} / 必要解散 {b.disbandCount}</li>;})}</ul>
        <label>冬の操作勢力<select aria-label="冬の操作勢力" value={activeWard} onChange={e=>setWinterWard(e.target.value as WardId)}>{state.participants.map(id=><option key={id} value={id}>{wardName(id)}</option>)}</select></label>
        <p>増員可能 {budget.buildCount}体 · 必要解散 {budget.disbandCount}体</p><h3>空いている初期配置の補給拠点</h3>
        {!budget.buildRegionIds.length&&<p>増員可能地点なし</p>}
        {budget.buildRegionIds.map(id=>{const checked=winter.builds.some(b=>b.regionId===id);return <label className="check" key={id}><input type="checkbox" aria-label={`Build ${regionName(id)}`} checked={checked} disabled={!checked&&winter.builds.filter(b=>b.ownerWardId===activeWard).length>=budget.buildCount} onChange={e=>setWinter({...winter,builds:e.target.checked?[...winter.builds,{ownerWardId:activeWard,regionId:id}]:winter.builds.filter(b=>b.regionId!==id)})} />{regionName(id)}</label>;})}
        <h3>解散する軍を選択</h3>{state.board.units.filter(u=>u.ownerWardId===activeWard).map(u=><label className="check" key={u.unitId}><input type="checkbox" aria-label={`Disband ${unitName(u)}`} checked={winter.disbands.includes(u.unitId)} disabled={budget.disbandCount===0} onChange={e=>setWinter({...winter,disbands:e.target.checked?[...winter.disbands,u.unitId]:winter.disbands.filter(id=>id!==u.unitId)})} />{unitName(u)}</label>)}
        <p className="hint">増員枠は上限です。必要な解散は全て指定してください。自動選択はしません。</p>
        <button onClick={()=>apply(adjudicateGameWinter(map,state,winter))}>冬の増減員を確定</button>
      </>}
      {state.phase==='end-of-year'&&<><h3>冬の清算完了</h3><p>増員 {state.winterResult?.builtUnits.length??0}体 · 解散 {state.winterResult?.disbandedUnitIds.length??0}体</p><p>次に参加勢力の補給拠点が0か所・補給拠点以外の支配地域が0か所を判定します。</p><button onClick={next}>次へ進む</button></>}
      {!!state.scChanges.length&&<details className="sc-changes" open><summary>直前の補給拠点の所有権更新</summary>{state.scChanges.map(c=><p key={c.regionId}>{regionName(c.regionId)}: {wardName(c.previous)} → {wardName(c.owner)}</p>)}</details>}
      {state.movement&&<details className="annual-results" open><summary>移動の裁定理由</summary>{state.movement.orderResults.map(o=><p key={o.order.unitId}>{origins.find(u=>u.unitId===o.order.unitId)?unitName(origins.find(u=>u.unitId===o.order.unitId)!):o.order.unitId} · {describe(o.order)}: {reasonText[o.reason]}（攻撃{o.attackStrength} / 防御{o.defenseStrength}）</p>)}</details>}
      {state.retreatResult&&<div className="annual-retreat-results">{state.retreatResult.outcomes.map(o=><p key={o.unitId}>{playerFacing?resolvedUnitName(o.unitId):o.unitId}: {reasonText[o.reason]}{o.destination?` → ${regionName(o.destination)}`:''}</p>)}</div>}
      {!!state.movement?.equipmentResults.length&&<div aria-label="装備の裁定結果">{state.movement.equipmentResults.map(r=><p key={r.unitId}>{playerFacing?(origins.find(u=>u.unitId===r.unitId)?unitName(origins.find(u=>u.unitId===r.unitId)!):'軍'):r.unitId}: {playerFacing?(r.status==='success'?'成功':'失敗'):r.reason} {r.firstLeg&&`第1区間 ${playerFacing?reasonText[r.firstLeg.reason as keyof typeof reasonText]??'移動終了':r.firstLeg.reason}`} {r.secondLeg&&`第2区間 ${playerFacing?reasonText[r.secondLeg.reason as keyof typeof reasonText]??'移動終了':r.secondLeg.reason}`}</p>)}</div>}
      {state.endResult&&log.current&&<GameOver result={state.endResult} summary={summarizeMatch(log.current)} target={state.victoryTargetSC} onDownload={()=>{if(log.current)downloadMatchLog(exportMatchLog(log.current));}}/>}
      <p className="hint">規定年数: {state.maxYears}年</p>
    </>}
    {errors.map((error,i)=><p className="issue error" role="alert" key={i}>{playerMessage(error)}</p>)}
  </fieldset></section>;
}
