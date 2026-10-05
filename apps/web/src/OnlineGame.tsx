import { VictoryConditions } from './VictoryConditions';
import { playerMessage } from './player-language';
import { useEffect, useMemo, useState } from 'react';
import { WARDS, createConfig, parseMapConfig, mapConfigCounts, type MapConfig, type RegionDataset, type WardId } from '../../../packages/shared/model';
import { GameOver, downloadMatchLog } from './GameOver';
import { type PrivatePlayerView, type PublicGameView, type PublicRoomView, type OnlineRequest, type OnlineResponse } from '../../../packages/shared/online';
import { type GameOrder as Order, gameOrderNames } from '../../../packages/shared/events';
import { effectiveMap } from '../../../packages/game-core/events';
import { useEventLocator,EventsPanel, InventoryPanel } from './EventsPanel';
import { EquipmentOrderFields } from './EquipmentOrderFields';
import { reasonText } from '../../../packages/shared/rules-explanations';
import { MapCanvas } from './MapCanvas';
import { useOnline } from './useOnline';
import { victoryTarget, defaultGameSettings } from '../../../packages/online-core/initial';
import { ConnectionScope } from './ConnectionScope';
import { ConnectionStatus } from './ConnectionStatus';
import { RoomCard, RoomCode, invitedRoom } from './RoomCard';
import { useAudio,AudioSettings, useBgm } from './audio/AudioProvider';
import { BottomActionBar, useMapCommands, describeOrder } from './BottomActionBar';

import { usePresentation,PresentationControls } from './AdjudicationPresentation';
import { wardColor } from '../../../packages/shared/display';
import { PhaseTransition,useBoardFeedback,useResultCues } from './GameFeel';
const wardName = (id: string | null) => WARDS.find(w => w.id === id)?.name ?? '中立';
const seasonName = { spring: '春', autumn: '秋', winter: '冬' };
const phaseName = { orders: '移動命令', retreats: '撤退', adjustments: '冬の増減員', 'sc-update': '補給拠点の所有権更新', 'end-of-year': '年末判定', finished: '終了' };
const statusName = { editing: '入力中', finalized: '確定済み', 'not-required': '不要', disconnected: '切断', eliminated: '脱落' };
const orderName = gameOrderNames;
export function OnlineGame({ dataset, config, onBack, developer = false }: { dataset: RegionDataset; config: MapConfig; onBack: () => void; developer?: boolean }) {
  const online = useOnline(invitedRoom(window.location.search)||undefined);
  const [nickname, setNickname] = useState(''), [preferred, setPreferred] = useState<WardId | ''>('');
  const [code, setCode] = useState(() => invitedRoom(window.location.search));
  const [yearLimit, setYearLimit] = useState(String(defaultGameSettings.maxYears));
  const [fileError, setFileError] = useState('');
  const [newParticipant,setNewParticipant]=useState(false);
  const room = online.publicView, self = online.privateView, game = room?.game;
  const roomLocked=online.pending||!online.roomSessionReady;
  const saved=online.savedIdentities.filter(i=>!code||i.roomCode===code.trim().toUpperCase());
  const chooseIdentity=!online.hasCredentials&&saved.length>0&&!newParticipant;
  useEffect(() => { if (room && room.hostId === self?.playerId) setYearLimit(String(room.scenario.maxYears)); }, [room?.roomCode, room?.hostId, room?.scenario.maxYears, self?.playerId]); // eslint-disable-line react-hooks/exhaustive-deps
  useBgm('lobby');
  async function loadScenario(file: File) {
    let json: string;
    try { json = await file.text(); }
    catch { setFileError('ファイルを読み取れませんでした。設定JSONを選び直してください。'); return; }
    let parsed: unknown;
    try { parsed = JSON.parse(json); }
    catch { setFileError('JSONを解析できません。地図エディタで保存した設定JSONを確認してください。'); return; }
    let uploaded: MapConfig;
    try { uploaded = parseMapConfig(parsed); }
    catch { setFileError('地図設定の形式が正しくありません。地図エディタで保存した設定JSONを選んでください。'); return; }
    setFileError('');
    const response = await online.request({ action: 'scenario', json, fileName: file.name, counts: mapConfigCounts(uploaded) });
    if (!response.ok) setFileError(response.errors.map(playerMessage).join('\n'));
  }
  async function downloadLog() { const response = await online.request({ action: 'export-log' }); if (response.ok && response.matchLog) downloadMatchLog(response.matchLog); }
  const map = room?.map;
  const displayDataset: RegionDataset = useMemo(() => map ? { version: 1, kind: dataset.kind, regions: map.regions.map(r => ({ regionId: r.regionId, wardId: r.wardId, sourceAreaNumber: r.sourceAreaNumber, name: r.name, geometry: r.geometry, source: r.source })) } : dataset, [map, dataset]);
  const displayConfig: MapConfig = useMemo(() => map ? { ...createConfig(displayDataset), mapId: map.mapId, obstacles: map.obstacles, regions: Object.fromEntries(map.regions.map(r => [r.regionId, { enabled: r.enabled, isSupplyCenter: r.isSupplyCenter, homeWardId: r.homeWardId, startingUnit: r.startingUnit, displayAnchorOverride: r.displayAnchorOverride }])) } : config, [map, displayDataset, config]);
  return <section className="online-shell">
    {!game && <div className="player-page-heading"><button onClick={onBack}>{developer ? '地図エディタへ戻る' : 'トップへ戻る'}</button><ConnectionScope /><AudioSettings compact /></div>}
    {(!game||!online.connected)&&<ConnectionStatus state={online.connectionState} error={online.configurationError} retry={online.retry} />}
        {room&&!online.roomSessionReady&&<p className="notice" role="status" data-room-session="restoring">最後に確認したルームの状態です。ルームへ再接続しています…</p>}
    {room&&!online.roomSessionReady&&online.connectionState==='unavailable'&&<button onClick={online.forget}>保存した参加情報を消す</button>}
    {!game&&room&&online.roomSessionReady&&!room.players.find(p=>p.playerId===room.hostId)?.connected&&<HostReconnectNotice deadline={room.hostReconnectDeadline}/>}
    {online.sessionNotice&&<p className="notice" role="status">{online.sessionNotice}</p>}
    {online.errors.length > 0 && !fileError && <div className="notice error" role="alert">{online.errors.map(playerMessage).join('\n')}</div>}
    {!room ? <div className="online-entry"><h1>オンライン対戦</h1><p>3～11人で同時に命令を出します。標準シナリオですぐに始められます。カスタムJSONはロビーで読み込めます。</p>
      {code && <p>ルーム {code} への招待です。</p>}
      <label>ルームコード<input aria-label="参加ルームコード" maxLength={6} value={code} onChange={e => setCode(e.target.value.toUpperCase())} /></label>
      {chooseIdentity?<section aria-label="保存した参加者から復帰"><h2>{saved.length>1?'どの参加者として復帰しますか？':'この端末の参加履歴'}</h2>{saved.map(identity=><div key={`${identity.roomCode}:${identity.playerId}`}><button disabled={!online.transportConnected||online.pending} onClick={()=>online.restore(identity)}>{identity.nickname}として復帰</button><small> · {!code&&`ルーム ${identity.roomCode} · `}最後の参加: {new Date(identity.updatedAt).toLocaleString('ja-JP')}</small></div>)}<button onClick={()=>setNewParticipant(true)}>別の参加者として入る</button></section>:<>
      {!online.hasCredentials&&saved.length>0&&<button onClick={()=>setNewParticipant(false)}>保存した参加者から復帰する</button>}
      <label>ニックネーム<input autoFocus aria-label="オンラインニックネーム" maxLength={32} value={nickname} onChange={e => setNickname(e.target.value)} /></label>
      <label>希望区（保証なし）<select aria-label="オンライン希望区" value={preferred} onChange={e => setPreferred(e.target.value as WardId | '')}><option value="">希望なし</option>{WARDS.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
      <div className="action-buttons"><button className="primary" disabled={!online.connected || online.pending || !nickname.trim() || code.length !== 6 || online.hasCredentials} onClick={() => void online.request({ action: 'join', roomCode: code, nickname, preferredWardId: preferred || null })}>ルームへ参加</button>
      <button disabled={!online.connected || online.pending || !nickname.trim() || online.hasCredentials} onClick={() => void online.request({ action: 'create', nickname, preferredWardId: preferred || null, datasetKind: dataset.kind, config, ...(!developer?{scenario:'standard' as const}:{}) })}>ルームを作成</button></div></>}
      {online.hasCredentials && <><p>保存した参加情報で復帰を試みています。サーバー再起動でルームがなくなった場合は参加情報を消して作り直してください。</p><button onClick={online.forget}>保存した参加情報を消す</button></>}
      <p className="hint">同じPCで試す場合は新規タブを開いてください。同じタブの再読み込みで本人として復帰できます。</p>
    </div> : game && map ? <OnlineMatch key={online.presentationEpoch} room={room} game={game} self={self} dataset={displayDataset} config={displayConfig} developer={developer} pending={roomLocked} sessionReady={online.roomSessionReady} request={online.request} onDownload={() => void downloadLog()} onBack={onBack} /> : <>
      <RoomCard room={room} years={room.hostId === self?.playerId ? yearLimit || room.scenario.maxYears : room.scenario.maxYears} target={room.players.length >= 3 ? victoryTarget(room.players.length) : '3人参加後に計算'} />
      <div className="lobby-layout"><main className="lobby-setup"><h2>開始の準備</h2>
        <section aria-label="シナリオ検証"><h3>{room.scenario.source==='standard'?'標準シナリオ':room.scenario.source==='custom'?'カスタムシナリオ':room.scenario.scenarioName}</h3><p>{room.scenario.source==='standard'?'標準シナリオを選択済みです。ファイルの読み込みは不要です。':room.scenario.loaded ? 'カスタムJSON読込済み' : '保存JSON未読込・作成時のエディタ設定'}</p>
        <details><summary>シナリオ識別情報 · #{room.scenario.scenarioHash.slice(0, 8)}</summary><p>採用 {room.scenario.enabledRegions}地域 / 補給拠点 {room.scenario.totalSC} / 初期軍 {room.scenario.totalStartingUnits}</p>{developer && <p>{room.scenario.scenarioHash}</p>}</details>
        <details><summary>Error {room.scenario.errors.length} / Warning {room.scenario.warnings.length} · 詳細を見る</summary>{room.scenario.errors.map((e, i) => <p key={`e${i}`}>Error: {playerMessage(e)}</p>)}{room.scenario.warnings.map((e, i) => <p key={`w${i}`}>Warning: {playerMessage(e)}</p>)}</details></section>
        {room.hostId === self?.playerId && <><div className="scenario-options"><button aria-pressed={room.scenario.source==='standard'} disabled={roomLocked} onClick={()=>{setFileError('');void online.request({action:'standard-scenario'});}}>標準シナリオ</button><label className="file-button">カスタムJSONを読み込む<input aria-label="カスタムJSONを読み込む" type="file" accept=".json,application/json" disabled={roomLocked} onChange={e => { const file = e.target.files?.[0]; if (file) void loadScenario(file); e.target.value = ''; }} /></label></div>{fileError && <p role="alert">{fileError}</p>}
          <label>規定年数（試遊用・変更可能）<input aria-label="オンライン規定年数" disabled={roomLocked} type="number" min={1} step={1} value={yearLimit} onChange={e => { const value=e.target.value;setYearLimit(value);if(value===''||(Number.isInteger(Number(value))&&Number(value)>0))void online.request({action:'lobby-years',yearLimit:value===''?null:Number(value)}); }} /></label>
          <button className="primary" disabled={roomLocked || room.startErrors.length > 0} onClick={() => void online.request({ action: 'start', yearLimit: yearLimit ? Number(yearLimit) : null })}>オンラインゲーム開始</button></>}
        {room.startErrors.map(e => <p key={e}>{playerMessage(e)}</p>)}
        <label>自分の希望区<select aria-label="ロビー希望区" value={self?.preferredWardId ?? ''} disabled={roomLocked} onChange={e => void online.request({ action: 'preference', preferredWardId: (e.target.value || null) as WardId | null })}><option value="">希望なし</option>{WARDS.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
        <button disabled={roomLocked} onClick={() => void online.request({ action: 'leave' })}>開始前に退出</button>
      </main><aside><PlayerList room={room} self={self} sessionReady={online.roomSessionReady} pending={online.pending} request={online.request}/></aside></div>
    </>}
  </section>;
}
function HostReconnectNotice({deadline}:{deadline?:number|null}){
  const [now,setNow]=useState(Date.now);useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[deadline]);
  return <p role="status"><span>ホストの再接続を待っています…</span>{deadline&&<small> · 残り{Math.max(0,Math.ceil((deadline-now)/1000))}秒</small>}</p>;
}
function PlayerList({room,self,sessionReady,pending=false,request}:{room:PublicRoomView;self:PrivatePlayerView|null;sessionReady:boolean;pending?:boolean;request?:(input:OnlineRequest)=>Promise<OnlineResponse>}){
 return <section className="ready-panel" aria-label="提出状況"><h3>{room.game?'提出状況':'ロビー参加者'}</h3><ul>{room.players.map(p=><li key={p.playerId} data-player-id={p.playerId} data-status={sessionReady?p.status:'checking'} data-presence={sessionReady?(p.connected?'connected':'disconnected'):'checking'}><span>{p.nickname}{p.playerId===self?.playerId?'（自分）':''} {p.host?'ホスト':''}<small> · {p.wardId?wardName(p.wardId):'未割当'}{room.game&&p.wardId?` · ${Object.values(room.game.board.regionControl).filter(r=>r.supplyCenterOwnerWardId===p.wardId).length}か所`:''}</small></span><span className="ready-status">{!sessionReady?'確認中':room.game?statusName[p.status]:p.connected?'接続中':'切断'}</span>{!room.game&&room.hostId===self?.playerId&&!p.host&&<button disabled={!sessionReady||pending} onClick={()=>{if(window.confirm(`「${p.nickname}」をルームから退出させますか？`))void request?.({action:'kick',playerId:p.playerId});}}>退出させる</button>}</li>)}</ul></section>;
}
function OnlineMatch({ room, game, self, dataset, config, developer, pending, sessionReady,request, onDownload, onBack }: {
  room: PublicRoomView; game: PublicGameView; self: PrivatePlayerView | null; dataset: RegionDataset; config: MapConfig; developer: boolean; pending: boolean;sessionReady:boolean;
  request: (r: OnlineRequest) => Promise<OnlineResponse>; onDownload: () => void; onBack: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null), [ward, setWard] = useState('all');
  const [left, setLeft] = useState(developer), [right, setRight] = useState(developer);
  const map = room.map!;
  const seasonMap=useMemo(()=>effectiveMap(map,game.events),[map,game.events]);
  const locator=useEventLocator(),presentation=usePresentation(developer?null:game.presentation),{sfx}=useAudio();
  useResultCues(presentation,sfx);
  useBgm(presentation.active?'adjudication':game.status==='finished'?'result':'domestic');
  useEffect(()=>{sfx.setSliding(presentation.sliding);return()=>sfx.setSliding(false);},[sfx,presentation.sliding]);
  const regionName = (id: string) => map.regions.find(r => r.regionId === id)?.name ?? '地域';
  const compatible = self?.phaseKey === game.phaseKey;
  const orders = compatible && self ? self.orders : [];
  const own = game.board.units.filter(u => u.ownerWardId === self?.wardId);
  const required = room.players.find(p => p.playerId === self?.playerId)?.required ?? false;
  const commands = useMapCommands({ units: game.board.units, ownUnits: own,ownOrders:orders, legalOrders: compatible && game.phase === 'orders' && self ? self.legalOrders : {}, inventory: compatible && self ? self.inventory : [],
    choose: async order => (await request({ action: 'orders', phaseKey: game.phaseKey, orders: [...orders.filter(o => o.unitId !== order.unitId), order], finalize: false })).ok, remove: unitId => { void request({action:'orders',phaseKey:game.phaseKey,orders:orders.filter(o=>o.unitId!==unitId),finalize:false}); }, onCue: cue=>sfx.playCue(cue), locked: presentation.active || pending || !!self?.finalized || game.phase !== 'orders', contextKey: game.phaseKey });
  const countSC = Object.values(game.board.regionControl).filter(r => r.supplyCenterOwnerWardId === self?.wardId && self?.wardId).length;
  const feedback=useBoardFeedback(game.board,self?.inventory.length??0,game.rivalInitialSCByWard[self?.wardId??'']??0,self?.wardId,presentation.active,game.events.groundEquipment,game.lastResult?.winter);
  useEffect(()=>{if(feedback.ownSC)sfx.playCue('sc-capture');},[sfx,feedback.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const ownWinner=!!game.endResult&&!!self?.wardId&&game.endResult.winners.some(w=>w===self.wardId);
  useEffect(()=>{if(ownWinner)sfx.playCue('victory');},[sfx,ownWinner]);
  const selectedRegion = map.regions.find(r => r.regionId === selected);
  const missing = own.filter(u => !orders.some(o => o.unitId === u.unitId)).length;
  const previousResults=<PresentationControls presentation={presentation} onSkip={()=>{void request({action:'presentation-skipped',presentationId:game.presentation!.id});}}><PublicResults game={game} regionName={regionName} developer={developer}/></PresentationControls>;
  return <div className={`game-layout ${developer?'':'board-first'}`} data-testid="game-layout">
    <header className="game-topbar"><div><span data-testid="online-phase">第{game.year}年 · {seasonName[game.season]} · {phaseName[game.phase]}</span>{developer&&<small>{room.scenario.scenarioName} · <span>規定年数: {game.maxYears}年</span></small>}</div>
      <strong data-testid="own-ward"><i className="ward-swatch" style={{background:wardColor(self?.wardId)}}/>あなた: {wardName(self?.wardId ?? null)}</strong><span data-testid="victory-target">補給拠点 {countSC} / {game.victoryTargetSC}か所{feedback.ownSC>0&&<small key={feedback.key} className="sc-gain" role="status">補給拠点 +{feedback.ownSC}</small>}</span><span data-testid="rival-sc-progress" className={feedback.rival?"progress-pulse":""}>敵の初期補給拠点 {game.rivalInitialSCByWard[self?.wardId??""]??0} / {game.requiredRivalInitialSupplyCentersForInstantWin}</span><span>軍 {own.length}</span><span>{self?.finalized ? '確定済み' : required ? '入力中' : '不要'}</span>
      <RoomCode code={room.roomCode} chip />{developer&&<ConnectionScope />}<VictoryConditions game={game} /><AudioSettings compact /><button onClick={onBack}>{developer ? '地図エディタへ戻る' : 'トップへ戻る'}</button>
    </header>
    <div className="hud-toggles"><button aria-expanded={left} aria-controls="event-tray" onClick={() => setLeft(v => !v)}>イベント・結果</button>{!developer&&<ul className="ready-strip" aria-label="参加者の確定状況">{room.players.map(p=><li key={p.playerId} title={`${p.nickname} · ${sessionReady?statusName[p.status]:'確認中'}`}><i className="ward-swatch" style={{background:wardColor(p.wardId)}}/><span>{wardName(p.wardId)}</span><span className="ready-status">{sessionReady?(p.status==='finalized'?'✓ ':p.status==='editing'?'○ ':''):''}{sessionReady?statusName[p.status]:'確認中'}</span></li>)}</ul>}<button aria-expanded={right} aria-controls="info-tray" onClick={() => setRight(v => !v)}>参加者・装備</button></div>
    <div className={`game-workspace ${left ? '' : 'hide-left'} ${right ? '' : 'hide-right'}`}>
      {left && <aside id="event-tray" className="left-hud"><div className="tray-heading"><strong>イベント・結果</strong><button aria-label="イベントトレイを閉じる" onClick={()=>setLeft(false)}>閉じる</button></div>{!presentation.active&&previousResults}<EventsPanel compact={!developer} map={map} onHighlight={locator.onHighlight} onLocate={locator.onLocate} events={game.events} counts={game.inventoryCounts} regionName={regionName} />
        {developer&&<details className="recent-result" open><summary>最近の裁定結果</summary><PublicResults game={game} regionName={regionName} developer /></details>}
        {room.hostId === self?.playerId && !game.endResult && <button disabled={pending} onClick={onDownload}>試遊ログをダウンロード</button>}
      </aside>}
      <main className="game-map"><PhaseTransition phaseKey={game.phaseKey} year={game.year} season={game.season} phase={game.phase}/>{game.phase==='retreats'&&required&&<div className="action-ribbon" role="status">撤退が必要です · 撤退中は交渉禁止</div>}<div className="game-map-caption"><label>地図の行政区<select aria-label="オンライン行政区" value={ward} onChange={e => setWard(e.target.value)}><option value="all">全行政区</option>{WARDS.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label><details><summary>シナリオ詳細</summary><p>{room.scenario.fileName ?? '作成時の地図設定'} · #{room.scenario.scenarioHash.slice(0, 8)}</p><p>採用 {room.scenario.enabledRegions}地域 / 補給拠点 {room.scenario.totalSC} / 初期軍 {room.scenario.totalStartingUnits}</p>{developer && <p>{room.scenario.scenarioHash}</p>}</details></div>
        <MapCanvas dataset={dataset} config={config} result={{ map: seasonMap }} selected={selected} onSelect={id => { setSelected(id); commands.select(id); }} ward={ward} busy={false} preview={game.board} events={game.events} orders={presentation.active?presentation.frame!.snapshot.orders:orders} orderUnits={presentation.active?presentation.frame!.snapshot.before:game.board.units} legalTargetIds={commands.targets} secondaryTargetIds={commands.via?commands.targets:undefined} previewNext={!commands.action||commands.action==="move"} currentPlayerWardId={self?.wardId} onRightClick={commands.rightClick} eventFocus={locator.focus} eventHighlight={locator.highlight} presentation={presentation} retreatUnits={game.phase==='retreats'?self?.retreatUnits.map(d=>d.unit):undefined} acceptedOrder={commands.accepted} feedback={feedback} playerFacing={!developer} />
        {presentation.active?previousResults:!left&&presentation.result?<button className="previous-result-chip" onClick={()=>{setLeft(true);presentation.open();}}>前回の行軍結果</button>:null}<p className="source-note">© 京都市 · <a href="https://data.city.kyoto.lg.jp/dataset/00670/">Dataset 00670</a> · <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a> · KMLから変換（架空サンプルを除く）</p>
        {game.phase === 'orders' && compatible && <BottomActionBar commands={commands} units={game.board.units} regionName={regionName} draft={orders.find(o => o.unitId === commands.unit?.unitId)} />}
      </main>
      {right && <aside id="info-tray" className="right-hud"><div className="tray-heading"><strong>参加者・地域情報</strong><button aria-label="情報トレイを閉じる" onClick={()=>setRight(false)}>閉じる</button></div><PlayerList room={room} self={self} sessionReady={sessionReady}/>
        {compatible && self && <InventoryPanel pulseKey={feedback.inventory?feedback.key:0} developer={developer} inventory={self.inventory} reservations={self.reservations} unitName={id => { const u = game.board.units.find(u => u.unitId === id) ?? self.retreatUnits.find(d => d.unit.unitId === id)?.unit; return u ? `${regionName(u.regionId)} · ${wardName(u.ownerWardId)}` : '軍'; }} />}
        {!developer&&<details><summary>シナリオ詳細</summary><p>{room.scenario.scenarioName} · 規定年数: {game.maxYears}年</p><p>{room.scenario.fileName??'作成時の地図設定'} · #{room.scenario.scenarioHash.slice(0,8)}</p><p>採用 {room.scenario.enabledRegions}地域 / 補給拠点 {room.scenario.totalSC} / 初期軍 {room.scenario.totalStartingUnits}</p><ConnectionScope /></details>}
        <details><summary>無所属区 · {game.inactiveWards.length}区</summary>{game.inactiveWards.map(wardName).join('、')}</details>
        {selectedRegion && <section aria-label="オンライン地域詳細"><h3>{selectedRegion.name}</h3><p>{wardName(selectedRegion.wardId)} · 現在支配: {wardName(game.board.regionControl[selectedRegion.regionId]?.controllerWardId ?? null)}</p>{selectedRegion.isSupplyCenter && <p>補給拠点の所有: {wardName(game.board.regionControl[selectedRegion.regionId]?.supplyCenterOwnerWardId ?? null)}</p>}</section>}
        {game.phase === 'orders' && !developer && <details><summary>自分の命令一覧 · {orders.length} / {own.length}軍</summary><ul aria-label="自分の命令一覧">{own.map(u => <li key={u.unitId}>{regionName(u.regionId)}の軍: {orders.find(o => o.unitId === u.unitId) ? describeOrder(orders.find(o => o.unitId === u.unitId)!, game.board.units, regionName) : '未入力'}</li>)}</ul></details>}
      </aside>}
    </div>
    {compatible && self && (developer || game.phase !== 'orders') && <div className="phase-input"><fieldset disabled={presentation.active}><OnlineCommands key={game.phaseKey} game={game} self={self} selected={selected} onSelect={setSelected} request={request} pending={pending} regionName={regionName} required={required} /></fieldset></div>}
    {game.phase === 'orders' && !developer && compatible && self && <footer className="submission-bar"><span>入力済み {orders.length} / {own.length}軍 · 未入力{missing}軍はHoldになります。</span>{required && (!self.finalized ? <button className="primary" disabled={pending||presentation.active} onClick={() => void request({ action: 'orders', phaseKey: game.phaseKey, orders, finalize: true })}>命令書を確定</button> : <><strong>確定済み · 他の参加者を待っています</strong><button disabled={pending} onClick={() => void request({ action: 'unready', phaseKey: game.phaseKey })}>確定解除</button></>)}</footer>}
    {game.endResult && <GameOver result={game.endResult} summary={game.summary} target={game.victoryTargetSC} players={room.players} currentPlayerWardId={self?.wardId} onDownload={onDownload} pending={pending} />}
  </div>;
}
function PublicResults({ game, regionName, developer }: { game: PublicGameView; regionName: (id: string) => string; developer: boolean }) {
  const result = game.lastResult;
  const units = [...game.board.units, ...(result?.movement?.dislodgedUnits.map(d => d.unit) ?? []), ...(result?.movement?.units ?? [])];
  const unitName = (id: string) => { const u = units.find(u => u.unitId === id); return developer ? id : u ? `${regionName(u.regionId)}の軍` : '解散した軍'; };
  return <section className="online-result" aria-label="直前の公開裁定結果"><h3>直前の公開裁定結果</h3>{result ? <><p>第{result.year}年 · {seasonName[result.season]}</p>
    <ul>{result.movement?.orderResults.map(r => <li key={r.order.unitId}>{unitName(r.order.unitId)} · {describeOrder(r.order, units, regionName)} · {reasonText[r.reason]}</li>)}</ul>
    <p>スタンドオフ: {result.movement?.standoffRegions.map(regionName).join('、') || 'なし'}</p>
    {result.movement?.equipmentResults.map(r => <p key={r.unitId} data-equipment-result={r.type}>{unitName(r.unitId)}: {developer ? r.reason : r.status === 'success' ? '成功' : '失敗'}{r.viaRegionId ? ` 経由 ${regionName(r.viaRegionId)}` : ''}{r.destination ? ` → ${regionName(r.destination)}` : ''}{r.targetRegionId ? ` 対象 ${regionName(r.targetRegionId)}` : ''}{r.firstLeg ? ` · 第1区間 ${reasonText[r.firstLeg.reason as keyof typeof reasonText] ?? '移動結果'}` : ''}{r.secondLeg ? ` · 第2区間 ${reasonText[r.secondLeg.reason as keyof typeof reasonText] ?? '移動結果'}` : ''}</p>)}
    <p>排除: {result.movement?.dislodgedUnits.map(d => `${regionName(d.unit.regionId)} ${wardName(d.unit.ownerWardId)}`).join('、') || 'なし'}</p>
    {result.retreat?.outcomes.map(r => <p key={r.unitId}>撤退結果: {unitName(r.unitId)} · {reasonText[r.reason]}{r.destination ? ` → ${regionName(r.destination)}` : ''}</p>)}
    {result.winter && <p>冬: 増員{result.winter.builtUnits.length}軍 / 解散{result.winter.disbandedUnitIds.length}軍</p>}
    {result.scChanges.map(c => <p key={c.regionId}>{regionName(c.regionId)}の補給拠点: {wardName(c.previous)} → {wardName(c.owner)}</p>)}
  </> : <p>まだ裁定していません。</p>}</section>;
}
function OnlineCommands({game,self,selected,onSelect,request,pending,regionName,required}:{game:PublicGameView;self:PrivatePlayerView;selected:string|null;onSelect:(id:string)=>void;request:(r:OnlineRequest)=>Promise<OnlineResponse>;pending:boolean;regionName:(id:string)=>string;required:boolean}) {
  const [retreatId,setRetreatId]=useState('');
  const [winterDraft,setWinterDraft]=useState(self.winterDraft);
  const own=game.board.units.filter(u=>u.ownerWardId===self.wardId),unit=own.find(u=>u.regionId===selected)??own[0];
  const choices=unit?self.legalOrders[unit.unitId]??[]:[],draft=unit?self.orders.find(o=>o.unitId===unit.unitId)??choices[0]:undefined;
  const locked=pending||self.finalized,missing=own.filter(u=>!self.orders.some(o=>o.unitId===u.unitId)).length;
  const label=(u:{regionId:string;ownerWardId:string})=>`${regionName(u.regionId)} · ${wardName(u.ownerWardId)}`;
  function choose(order:Order|undefined) {if(order)void request({action:'orders',phaseKey:game.phaseKey,orders:[...self.orders.filter(o=>o.unitId!==order.unitId),order],finalize:false});}
  const retreating=self.retreatUnits.find(d=>d.unit.unitId===retreatId)??self.retreatUnits[0];
  const retreatOrder=retreating?self.retreatOrders.find(o=>o.unitId===retreating.unit.unitId):undefined;
  function winterChoice(key:'buildRegionIds'|'disbandUnitIds',id:string,checked:boolean) {
    const next={...winterDraft,[key]:checked?[...winterDraft[key],id]:winterDraft[key].filter(v=>v!==id)};
    setWinterDraft(next);
    void request({action:'winter',phaseKey:game.phaseKey,finalize:false,draft:next}).then(response=>{if(!response.ok)setWinterDraft(self.winterDraft);});
  }
  return <section className="online-commands" aria-label="自分の秘密入力">
    {game.phase==='retreats'&&<p className="retreat-notice">撤退フェイズ中は交渉禁止</p>}
    {!required&&game.phase!=='finished'&&<p>このフェイズの提出は不要です。</p>}
    {required&&game.phase==='orders'&&<>
      <h3>自軍の命令</h3>
      {unit&&draft&&<fieldset disabled={locked}>
        <label>自軍<select aria-label="オンライン自軍" value={unit.unitId} onChange={e=>onSelect(own.find(u=>u.unitId===e.target.value)!.regionId)}>{own.map(u=><option key={u.unitId} value={u.unitId}>{label(u)}</option>)}</select></label>
        <label>命令種別<select aria-label="オンライン命令種別" value={draft.type} onChange={e=>choose(choices.find(o=>o.type===e.target.value))}>{(Object.keys(orderName) as Order['type'][]).map(type=><option key={type} value={type} disabled={!choices.some(o=>o.type===type)}>{orderName[type]}</option>)}</select></label>
        {'targetUnitId'in draft&&<label>支援対象<select aria-label="オンライン支援対象" value={draft.targetUnitId} onChange={e=>choose(choices.find(o=>o.type===draft.type&&'targetUnitId'in o&&o.targetUnitId===e.target.value))}>{game.board.units.filter(u=>choices.some(o=>o.type===draft.type&&'targetUnitId'in o&&o.targetUnitId===u.unitId)).map(u=><option key={u.unitId} value={u.unitId}>{label(u)}</option>)}</select></label>}
        {'destination'in draft&&draft.type!=='bicycle-move'&&<label>移動先<select aria-label="オンライン移動先" value={draft.destination} onChange={e=>choose(choices.find(o=>o.type===draft.type&&'destination'in o&&o.destination===e.target.value&&(!('targetUnitId'in draft)||('targetUnitId'in o&&o.targetUnitId===draft.targetUnitId))))}>{choices.filter(o=>o.type===draft.type&&'destination'in o&&(!('targetUnitId'in draft)||('targetUnitId'in o&&o.targetUnitId===draft.targetUnitId))).map(o=><option key={JSON.stringify(o)} value={'destination'in o?o.destination:''}>{'destination'in o?regionName(o.destination):''}</option>)}</select></label>}
        <button onClick={()=>choose(draft)}>この命令を登録</button>
        <EquipmentOrderFields draft={draft} choices={choices} choose={choose} regionName={regionName} prefix="オンライン" />
        <p className="hint">装備命令は所持装備・予約・合法経路がある場合だけ選択できます。各種類1軍まで。予約と経路は自分だけに表示されます。</p>
      </fieldset>}
      <ul aria-label="自分の命令一覧">{own.map(u=>{const o=self.orders.find(o=>o.unitId===u.unitId);return <li key={u.unitId}>{label(u)}: {o?`${orderName[o.type]}${'destination'in o?` → ${regionName(o.destination)}`:''}${'targetUnitId'in o?` 支援 ${o.targetUnitId}`:''}`:'未入力'}</li>;})}</ul>
      <p>未入力{missing}軍はHoldになります。</p>
      {!self.finalized&&<button disabled={pending} onClick={()=>void request({action:'orders',phaseKey:game.phaseKey,orders:self.orders,finalize:true})}>命令書を確定</button>}
    </>}
    {required&&game.phase==='retreats'&&retreating&&<>
      <label>撤退する自軍<select aria-label="オンライン撤退軍" value={retreating.unit.unitId} disabled={locked} onChange={e=>setRetreatId(e.target.value)}>{self.retreatUnits.map(d=><option key={d.unit.unitId} value={d.unit.unitId}>{label(d.unit)}</option>)}</select></label>
      <label>秘密の撤退先<select aria-label="オンライン秘密撤退先" disabled={locked} value={retreatOrder?.type==='retreat'?retreatOrder.destination:retreatOrder?.type==='disband'?'disband':''} onChange={e=>{if(!e.target.value)return;const value=e.target.value;void request({action:'retreats',phaseKey:game.phaseKey,finalize:false,orders:[...self.retreatOrders.filter(o=>o.unitId!==retreating.unit.unitId),value==='disband'?{type:'disband',unitId:retreating.unit.unitId}:{type:'retreat',unitId:retreating.unit.unitId,destination:value}]});}}><option value="">未入力</option><option value="disband">解散</option>{retreating.legalRetreatDestinations.map(id=><option key={id} value={id}>{regionName(id)}</option>)}</select></label>
      <p>入力済み {self.retreatOrders.length} / {self.retreatUnits.length}軍（候補なしは自動解散）</p>
      {!self.finalized&&<button disabled={pending} onClick={()=>void request({action:'retreats',phaseKey:game.phaseKey,orders:self.retreatOrders,finalize:true})}>撤退命令書を確定</button>}
    </>}
    {required&&game.phase==='adjustments'&&self.winterBudget&&<>
      <p>補給拠点 {self.winterBudget.supplyCenters} · 軍 {self.winterBudget.units} · 増員可能 {self.winterBudget.buildCount}軍 · 必要解散 {self.winterBudget.disbandCount}軍</p>
      <fieldset disabled={locked}>{self.winterBudget.buildRegionIds.map(id=><label className="check" key={id}><input aria-label={`オンラインBuild ${regionName(id)}`} type="checkbox" checked={winterDraft.buildRegionIds.includes(id)} onChange={e=>winterChoice('buildRegionIds',id,e.target.checked)} />Build {regionName(id)}</label>)}
        {self.winterBudget.disbandCount>0&&own.map(u=><label className="check" key={u.unitId}><input aria-label={`オンラインDisband ${regionName(u.regionId)}`} type="checkbox" checked={winterDraft.disbandUnitIds.includes(u.unitId)} onChange={e=>winterChoice('disbandUnitIds',u.unitId,e.target.checked)} />Disband {label(u)}</label>)}
      </fieldset><p>増員0軍でも確定が必要です。解散は必要数を手動選択してください。</p>
      {!self.finalized&&<button disabled={pending} onClick={()=>void request({action:'winter',phaseKey:game.phaseKey,draft:winterDraft,finalize:true})}>冬調整を確定</button>}
    </>}
    {required&&self.finalized&&<><p>確定済みです。全員の確定を待っています。</p><button disabled={pending} onClick={()=>void request({action:'unready',phaseKey:game.phaseKey})}>確定解除</button></>}
  </section>;
}
