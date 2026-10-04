import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { WARDS, createConfig, datasetSchema, parseMapConfig, parseObstacleGeoJSON,
  type RegionDataset, type MapConfig, type RegionSettings, type WardId, type DisplayAnchor, type Obstacle } from '../../../packages/shared/model';
import { gameStatePreviewSchema, createPreview, reconcilePreview, validatePreview, type GameStatePreview } from '../../../packages/shared/preview';
import { anchorIsInside } from '../../../packages/map-core/anchors';
import { sampleDataset, sampleConfig, sampleObstacle } from '../../../packages/map-core/sample';
import { configReferenceIssues, geometryIsValid } from '../../../packages/map-core/validation';
import type { CompileResult } from '../../../packages/map-core/compile';
import { pairKey, toggleOverride } from '../../../packages/map-core/adjacency';
import { MapCanvas } from './MapCanvas';
import { PreviewInspector } from './PreviewInspector';
import { RulesSandbox } from './RulesSandbox';
import { GameSessionPanel, type LocalUiMemory } from './GameSessionPanel';
import { OnlineGame } from './OnlineGame';
import type { GameSessionState } from '../../../packages/game-core';
import { effectiveMap } from '../../../packages/game-core/events';
import type { GameOrder } from '../../../packages/shared/events';
import type { Order, Unit } from '../../../packages/rules-core/model';
import gyoenProposal from '../../../data/maps/kyoto-urban/kyoto-gyoen-obstacle.geojson?raw';
import { useAudio,AudioSettings, useBgm } from './audio/AudioProvider';
import { invitedRoom } from './RoomCard';
import { BottomActionBar, useMapCommands } from './BottomActionBar';
import { recordMatch } from '../../../packages/game-core/match-log';
import { legalGameOrders } from '../../../packages/game-core/equipment-orders';

import { useEventLocator } from './EventsPanel';
import { LandingPage } from './LandingPage';
import { usePresentation,PresentationControls } from './AdjudicationPresentation';
import { PhaseTransition,useBoardFeedback,useResultCues } from './GameFeel';
function storageKey(dataset: RegionDataset) { return `kyoto-map-v1-${dataset.kind}-${dataset.regions.map(r => r.regionId).join('|')}`; }
function download(name: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}
function WardSelect({ value, onChange, nullable = false, label }: { value: string; onChange: (v: string) => void; nullable?: boolean; label: string }) {
  return <select aria-label={label} value={value} onChange={e => onChange(e.target.value)}>
    {nullable && <option value="">未設定</option>}
    {WARDS.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
  </select>;
}
export function App() {
  const [dataset, setDataset] = useState<RegionDataset | null>(null);
  const [config, setConfig] = useState<MapConfig | null>(null);
  const [computed, setComputed] = useState<{ config: MapConfig; dataset: RegionDataset; result: CompileResult } | null>(null);
  const [calculationError, setCalculationError] = useState('');
  const [message, setMessage] = useState('');
  const [loadError, setLoadError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState('select');
  const [ward, setWard] = useState('all');
  const [search, setSearch] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [tab, setTab] = useState('edit');
  const [screenMode, setScreenMode] = useState<'home' | 'settings' | 'edit' | 'preview' | 'rules' | 'game' | 'online'>('home');
  const [developer, setDeveloper] = useState(() => new URLSearchParams(window.location.search).get('tool') === 'editor');
  const [localPlayer, setLocalPlayer] = useState(false);
  const localMemory = useRef<LocalUiMemory|null>(null);
  const [sessionState, setSessionState] = useState<GameSessionState|null>(null);
  const [sessionInitial, setSessionInitial] = useState<GameSessionState|null>(null);
  const [sessionContext, setSessionContext] = useState<{config:MapConfig;result:CompileResult}|null>(null);
  const [gameOrders, setGameOrders] = useState<GameOrder[]>([]);
  const [gameOrderUnits, setGameOrderUnits] = useState<Unit[]>([]);
  const [sandboxInitial, setSandboxInitial] = useState<GameStatePreview | null>(null);
  const [sandboxState, setSandboxState] = useState<GameStatePreview | null>(null);
  const [sandboxOrders, setSandboxOrders] = useState<Order[]>([]);
  const [sandboxOrderUnits, setSandboxOrderUnits] = useState<Unit[]>([]);
  const [preview, setPreview] = useState<GameStatePreview | null>(null);
  const [obstacleDraft, setObstacleDraft] = useState<DisplayAnchor[]>([]);
  const [obstacleName, setObstacleName] = useState('京都御苑（ゲーム用境界）');
  const [obstacleSource, setObstacleSource] = useState('ユーザーが地図上で指定したゲーム用境界。SPEC.md第8節の滋野・京極の補正。');
  const [editingObstacleId, setEditingObstacleId] = useState<string | null>(null);
  const [movingVertex, setMovingVertex] = useState<number | null>(null);

  function activate(next: RegionDataset) {
    setLoadError('');
    let settings = next.kind === 'sample' ? structuredClone(sampleConfig) : createConfig(next);
    if (next.kind === 'kyoto-kml') settings.obstacles = parseObstacleGeoJSON(JSON.parse(gyoenProposal));
    try {
      const saved = localStorage.getItem(storageKey(next));
      if (saved) {
        const parsed = parseMapConfig(saved);
        if (!configReferenceIssues(next, parsed).some(i => ['invalid-reference', 'missing-setting'].includes(i.code))) settings = parsed;
      }
    } catch { setMessage('ブラウザ内の設定を復元できなかったため、初期設定を開きました。'); }
    setDataset(next); setConfig(settings); setSelected(null); setWard('all'); setSearch(''); setMode('select');
    setPreview(null);
    const initialScreen = invitedRoom(window.location.search) ? 'online' : developer ? 'edit' : 'home';
    try {setScreenMode(sessionStorage.getItem('kyoto-online-session-v1')?'online':initialScreen);} catch {setScreenMode(initialScreen);}
    localMemory.current=null;setSessionState(null);setSessionInitial(null);setSessionContext(null);setGameOrders([]);setGameOrderUnits([]);
    setObstacleDraft([]); setEditingObstacleId(null);
  }
  async function loadOfficial() {
    setLoadError('');
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}regions.json`, { cache: 'no-store', headers: { Accept: 'application/json' } });
      if (response.status === 404) {
        activate(sampleDataset); setMessage('KML変換データがありません。架空のサンプルを表示しています。'); return;
      }
      if (!response.ok) throw new Error(`地図読込 HTTP ${response.status}`);
      activate(datasetSchema.parse(await response.json()));
    } catch (error) { setLoadError(`地図を読み込めません: ${errorMessage(error)}。npm.cmd run map:import を確認してください。`); }
  }
  useEffect(() => { void loadOfficial(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!dataset || !config) return;
    setCalculationError('');
    const worker = new Worker(new URL('./map.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = event => {
      if (event.data.error) setCalculationError(event.data.error);
      else setComputed({ dataset, config, result: event.data.result });
    };
    worker.onerror = event => setCalculationError(event.message || '地図計算に失敗しました');
    const timer = setTimeout(() => worker.postMessage({ dataset, config }), 120);
    return () => { clearTimeout(timer); worker.terminate(); };
  }, [dataset, config]);
  useEffect(() => {
    if (!dataset || !config || computed?.dataset !== dataset || computed.config !== config) return;
    setPreview(current => {
      if (current) return reconcilePreview(current, computed.result.map);
      try {
        const saved = localStorage.getItem(`${storageKey(dataset)}-preview`);
        if (saved) return reconcilePreview(gameStatePreviewSchema.parse(JSON.parse(saved)), computed.result.map);
      } catch { /* Invalid display-only state never changes the static map configuration. */ }
      return createPreview(computed.result.map);
    });
  }, [computed, dataset, config]);
  useEffect(() => {
    if (!dataset || !preview) return;
    try { localStorage.setItem(`${storageKey(dataset)}-preview`, JSON.stringify(preview)); }
    catch { /* Preview JSON export remains available if browser storage is full. */ }
  }, [dataset, preview]);
  useEffect(() => {
    if (!dataset || !config) return;
    try { localStorage.setItem(storageKey(dataset), JSON.stringify(config)); setSaveStatus('ブラウザ内に自動保存済み'); }
    catch { setSaveStatus('自動保存できません。設定JSONを保存してください。'); }
  }, [dataset, config]);
  const list = useMemo(() => dataset?.regions.filter(r => (ward === 'all' || r.wardId === ward) &&
    `${r.name} ${r.sourceAreaNumber} ${r.regionId}`.includes(search)) ?? [], [dataset, ward, search]);
  const result = computed?.dataset === dataset ? computed.result : undefined;
  const busy = !computed || computed.config !== config || computed.dataset !== dataset;
  const locator=useEventLocator(),presentation=usePresentation(localPlayer?sessionState?.presentation:null),{sfx}=useAudio();
  useResultCues(presentation,sfx);
  useEffect(()=>{sfx.setSliding(screenMode==="game"&&presentation.sliding);return()=>sfx.setSliding(false);},[sfx,screenMode,presentation.sliding]);
  const localChoose = useRef<((order: GameOrder|undefined,removeId?:string) => void|boolean) | null>(null);
  const boardFeedback=useBoardFeedback(sessionState?.board,sessionState?.events.inventory.length??0,0,null,presentation.active,sessionState?.events.groundEquipment,sessionState?.winterResult);
  const localLegal = useMemo(() => sessionState && sessionContext && sessionState.phase === 'orders' ? Object.fromEntries(sessionState.board.units.map(u => [u.unitId, legalGameOrders(sessionContext.result.map, sessionState, u.unitId, gameOrders)])) : {}, [sessionState, sessionContext, gameOrders]);
  const localEvents=sessionState?.events;
  const localMapResult=useMemo(()=>localEvents&&sessionContext?{map:effectiveMap(sessionContext.result.map,localEvents)}:undefined,[sessionContext,localEvents]);
  const localCommands = useMapCommands({ ownOrders:gameOrders,units: sessionState?.board.units ?? [], ownUnits: sessionState?.board.units ?? [], legalOrders: localLegal, inventory: sessionState?.events.inventory ?? [], choose: order => localChoose.current?.(order), remove: id=>{localChoose.current?.(undefined,id);},onCue:cue=>sfx.playCue(cue), locked: presentation.active || sessionState?.phase !== 'orders', contextKey: `${sessionState?.year}:${sessionState?.season}:${sessionState?.phase}` });
  useBgm(screenMode === 'game' ? presentation.active?'adjudication':sessionState?.status === 'finished' ? 'result' : sessionState ? 'domestic' : 'lobby' : screenMode === 'online' ? 'lobby' : 'title');
  if (loadError) return <main className="loading"><h1>地図読込エラー</h1><p role="alert">{loadError}</p><button onClick={() => activate(sampleDataset)}>架空サンプルを開く</button></main>;
  if (!dataset || !config) return <main className="loading">地図を読み込んでいます…</main>;
  if (screenMode === 'online') return <OnlineGame dataset={dataset} config={config} developer={developer} onBack={()=>setScreenMode(developer?'edit':'home')} />;
  if (screenMode === 'settings') return <main className="main-menu"><button onClick={() => setScreenMode('home')}>トップへ戻る</button><h1>設定</h1><AudioSettings /></main>;
  if (screenMode === 'home') return <LandingPage online={()=>{setDeveloper(false);setScreenMode('online');}} local={()=>{setDeveloper(false);setLocalPlayer(true);setScreenMode('game');}} settings={()=>setScreenMode('settings')} localDisabled={!preview||busy}>
    <div className="action-buttons"><button onClick={() => {setDeveloper(true);setLocalPlayer(false);setScreenMode('edit');}}>地図エディタ</button><button disabled={!preview || busy} onClick={() => {setDeveloper(true);setLocalPlayer(false);setScreenMode('preview');}}>Game Preview</button><button disabled={!preview || busy || !!result?.report.issues.some(i => i.severity === 'error')} onClick={() => {const initial=structuredClone(preview!);setSandboxInitial(initial);setSandboxState(initial);setSandboxOrders([]);setSandboxOrderUnits(initial.units);setDeveloper(true);setLocalPlayer(false);setScreenMode('rules');}}>Rules Sandbox</button></div>
  </LandingPage>;
  const region = dataset.regions.find(r => r.regionId === selected);
  const settings = selected ? config.regions[selected] : undefined;
  const neighbors = selected ? result?.map.adjacency[selected] ?? [] : [];
  const regionName = (id: string) => dataset.regions.find(r => r.regionId === id)?.name ?? id;
  function updateRegion(patch: Partial<RegionSettings>) {
    if (!selected) return;
    setConfig(current => current && ({ ...current, regions: { ...current.regions, [selected]: { ...current.regions[selected], ...patch } } }));
  }
  function selectRegion(id: string) {
    if (screenMode !== 'edit') { setSelected(id); if (screenMode === 'game' && localPlayer) localCommands.select(id); return; }
    if (mode === 'adjacency' && selected && selected !== id) {
      if (busy || !result) { setMessage('計算完了を待ってから隣接を編集してください。'); return; }
      if (!config!.regions[id]?.enabled || !config!.regions[selected]?.enabled) { setMessage('隣接は採用地域同士で編集してください。'); return; }
      setConfig(toggleOverride(config!, result.baseAdjacency, result.map.adjacency, selected, id));
    } else {
      setSelected(id);
      if (mode === 'toggle') setConfig(current => current && ({ ...current, regions: { ...current.regions,
        [id]: { ...current.regions[id], enabled: !current.regions[id].enabled } } }));
    }
  }
  function bulk(enabled: boolean) {
    if (ward === 'all') return;
    setConfig(current => current && ({ ...current, regions: Object.fromEntries(Object.entries(current.regions).map(([id, value]) =>
      [id, dataset!.regions.find(r => r.regionId === id)?.wardId === ward ? { ...value, enabled } : value])) }));
  }
  async function importJson(event: ChangeEvent<HTMLInputElement>, kind: 'config' | 'obstacle' | 'preview') {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    try {
      const data: unknown = JSON.parse(await file.text());
      if (kind === 'config') {
        const next = parseMapConfig(data);
        const refs = configReferenceIssues(dataset!, next).filter(i => ['invalid-reference', 'missing-setting'].includes(i.code));
        if (refs.length) throw new Error(refs.map(i => i.message).join('\n'));
        setConfig(next); setMessage('設定JSONを読み込みました。検証結果も確認してください。');
      } else if (kind === 'preview') {
        if (!result || busy) throw new Error('地図計算が完了してから読み込んでください');
        const state = gameStatePreviewSchema.parse(data);
        const issues = validatePreview(state, result.map);
        if (issues.length) throw new Error(issues.join('\n'));
        setPreview(state); setMessage('表示確認用のプレビュー状態を読み込みました。');
      } else {
        const obstacles = parseObstacleGeoJSON(data);
        if (obstacles.some(o => !geometryIsValid(o.geometry))) throw new Error('自己交差など不正な障害物形状があります');
        setConfig(current => current && ({ ...current, obstacles }));
        setMessage('障害物レイヤーを読み込みました（既存レイヤーを置換）。');
      }
    } catch (error) { setMessage(`読込エラー: ${errorMessage(error)}`); }
  }
  function exportMap() {
    if (!result || busy || result.report.issues.some(i => i.severity === 'error')) return;
    const split = result.report.issues.some(i => ['disconnected-geometry', 'source-multipolygon'].includes(i.code));
    if (split && !window.confirm('複数部分を持つ地域があります。検証結果を確認し、同じ論理地域のMultiPolygonとして書き出しますか？')) return;
    download('map-definition.json', result.map);
  }
  const errors = result?.report.issues.filter(i => i.severity === 'error') ?? [];
  const warnings = result?.report.issues.filter(i => i.severity === 'warning') ?? [];
  const activeContext = screenMode === 'game' ? sessionContext : null;
  const standardGyoen = parseObstacleGeoJSON(JSON.parse(gyoenProposal))[0];
  const currentGyoen = (activeContext?.config ?? config).obstacles.find(o => o.id === standardGyoen.id);
  const differentGyoen = dataset.kind === 'kyoto-kml' && JSON.stringify(currentGyoen?.geometry) !== JSON.stringify(standardGyoen.geometry);
  function setAnchor(point: DisplayAnchor) {
    if (mode === 'obstacle') {
      setObstacleDraft(points => movingVertex === null ? [...points, point] : points.map((p, i) => i === movingVertex ? point : p));
      setMovingVertex(null); return;
    }
    const playable = result?.map.regions.find(r => r.regionId === selected)?.playableGeometry ?? null;
    if (busy || !selected) { setMessage('採用地域を選び、計算完了を待ってください。'); return; }
    if (!anchorIsInside(playable, point)) { setMessage('表示位置は選択地域の移動可能領域の内部へ設定してください。境界や障害物内には置けません。'); return; }
    updateRegion({ displayAnchorOverride: point }); setMode('select'); setMessage('表示位置を保存しました。設定JSONにも保存されます。');
  }
  function saveObstacleDraft() {
    if (obstacleDraft.length < 3 || !obstacleName.trim() || !obstacleSource.trim()) { setMessage('3頂点以上と障害物名・出典または編集意図を入力してください。'); return; }
    const geometry = { type: 'Polygon' as const, coordinates: [[...obstacleDraft, obstacleDraft[0]]] };
    if (!geometryIsValid(geometry)) { setMessage('自己交差または重複する頂点があります。境界を囲む順に指定し直してください。'); return; }
    let id = editingObstacleId ?? 'user-obstacle-1';
    if (!editingObstacleId) for (let i = 1; config!.obstacles.some(o => o.id === id); i++) id = `user-obstacle-${i + 1}`;
    const obstacle: Obstacle = { type: 'Feature', id, properties: { name: obstacleName.trim(), source: obstacleSource.trim() }, geometry };
    setConfig({ ...config!, obstacles: [...config!.obstacles.filter(o => o.id !== id), obstacle] });
    setObstacleDraft([]); setEditingObstacleId(null); setMode('select'); setMessage('侵入不能境界を設定に保存しました。元KMLは変更していません。設定JSONまたは障害物GeoJSONを保存してください。');
  }
  return <div className={`app-shell ${localPlayer && screenMode === 'game' ? 'local-trial' : ''}`}>
    <header>
      <div><span className="eyebrow">KYOTO DIPLOMACY / {localPlayer?'LOCAL':'DEVELOPMENT TOOLS'}</span><h1>{screenMode === 'game' ? '年間進行（ローカル）' : screenMode === 'rules' ? 'ルールサンドボックス' : screenMode === 'preview' ? 'ゲームプレビュー' : '地図エディタ'}</h1>{localPlayer&&sessionState&&<p>第{sessionState.year}年 · {sessionState.season==='spring'?'春':sessionState.season==='autumn'?'秋':'冬'} · {sessionState.phase==='orders'?'移動命令':sessionState.phase==='retreats'?'撤退':sessionState.phase==='adjustments'?'冬の増減員':sessionState.phase==='finished'?'終了':'進行確認'}</p>}</div>
      <div className="header-actions">
        <button onClick={() => {setLocalPlayer(false);setScreenMode('home');}}>トップへ戻る</button><AudioSettings compact />
        {!localPlayer&&<>
        <button onClick={() => { download('kyoto-urban-config.json', config); setMessage('設定JSONをダウンロードしました。'); }}>設定JSONを保存</button>
        <label className="file-button">設定JSONを読込<input type="file" disabled={screenMode === 'rules' || screenMode === 'game'} accept=".json,application/json" aria-label="設定JSONを読込" onChange={e => void importJson(e, 'config')} /></label>
        <button onClick={exportMap} disabled={busy || !!errors.length}>MapDefinition出力</button>
        </>}
      </div>
    </header>
    <div className="status-bar" hidden={localPlayer}>
      <span>{dataset.kind === 'sample' ? '架空サンプル（京都の地図ではありません）' : `京都市公式KML · ${dataset.regions.length}国勢統計区`}</span>
      <span>採用 {Object.values(config.regions).filter(r => r.enabled).length} / {dataset.regions.length}</span>
      <span>{saveStatus}</span>
      <div className="screen-modes"><button aria-pressed={screenMode === 'edit'} onClick={() => { setScreenMode('edit'); setMode('select'); }}>編集モード</button>
        <button aria-pressed={screenMode === 'preview'} disabled={!preview || busy} onClick={() => { setScreenMode('preview'); setMode('select'); }}>ゲームプレビュー</button>
        <button aria-pressed={screenMode === 'rules'} disabled={screenMode === 'rules' || !preview || busy || !!errors.length} onClick={() => {
          const initial=structuredClone(preview!);setSandboxInitial(initial);setSandboxState(initial);setSandboxOrders([]);setSandboxOrderUnits(initial.units);setScreenMode('rules');setMode('select');
        }}>ルールサンドボックス</button>
        <button disabled={busy || !!errors.length} onClick={()=>{setScreenMode('online');setMode('select');}}>オンライン対戦</button>
        <button aria-pressed={screenMode === 'game'} disabled={!preview || busy || (!sessionState && !!errors.length)} onClick={() => {setScreenMode('game');setMode('select');}}>年間進行（ローカル）</button></div>
      <button onClick={() => { if (dataset.kind === 'sample') void loadOfficial(); else activate(sampleDataset); }}>{dataset.kind === 'sample' ? '京都市データを開く' : '架空サンプルで確認'}</button>
    </div>
    {message && <div className="notice" role="status"><span>{message}</span><button aria-label="通知を閉じる" onClick={() => setMessage('')}>×</button></div>}
    {calculationError && <div className="notice error" role="alert">計算エラー: {calculationError}</div>}
    {differentGyoen && <div className="notice gyoen-notice">読み込み中の御苑境界は標準案と異なります。編集モードの「御苑のゲーム用境界案を読み込む」で更新できます。現在の境界を保持しています。</div>}
    <div className="workspace">
      <aside className="region-browser" hidden={localPlayer}>
        <h2>地域一覧</h2>
        <label>行政区<select aria-label="行政区フィルター" value={ward} onChange={e => setWard(e.target.value)}><option value="all">全行政区</option>{WARDS.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
        <div className="button-row"><button disabled={ward === 'all' || screenMode !== 'edit'} onClick={() => bulk(true)}>区を全採用</button><button disabled={ward === 'all' || screenMode !== 'edit'} onClick={() => bulk(false)}>区を全除外</button></div>
        <label>地域名・番号<input aria-label="地域を検索" value={search} placeholder="修学院第一、12…" onChange={e => setSearch(e.target.value)} /></label>
        <div className="legend">{WARDS.map(w => <span key={w.id}><i style={{ background: w.color }} />{w.name}</span>)}<span><i style={{ background: '#e1e4e0' }} />除外</span></div>
        <div className="region-list" aria-label="地域一覧">
          {list.map(r => <button key={r.regionId} className={selected === r.regionId ? 'active' : ''} onClick={() => selectRegion(r.regionId)}>
            <span className={`dot ${config.regions[r.regionId]?.enabled ? 'enabled' : ''}`} />
            <span>{r.name}<small>{WARDS.find(w => w.id === r.wardId)!.name} · 第{Number(r.sourceAreaNumber)}区</small></span>
            <span className="list-marks">{config.regions[r.regionId]?.isSupplyCenter ? '○' : ''}{config.regions[r.regionId]?.startingUnit ? '▲' : ''}</span>
          </button>)}
        </div>
        <p className="hint">{screenMode !== 'edit' ? '領土の色は現在の支配勢力、軍ピンは軍の所属勢力、補給拠点の円のリングは補給拠点所有勢力です。' : '採用範囲は未選択で開始します。都市部の範囲を確認して選んでください。'}</p>
      </aside>
      <main>
        {screenMode === 'edit' ? <div className="mode-bar"><span>クリック操作</span>{[['select', '詳細を選択'], ['toggle', '採用・除外を切替'], ['adjacency', '隣接override']].map(([value, label]) =>
          <button key={value} aria-pressed={mode === value} className={mode === value ? 'active' : ''} onClick={() => setMode(value)}>{label}</button>)}
          {mode === 'anchor' && <span className="anchor-instruction">選択地域の内部をクリックして表示位置を指定</span>}
          {mode === 'obstacle' && <span className="anchor-instruction">地図をクリックして侵入不能境界の頂点を指定</span>}</div>
          : <div className="mode-bar preview-caption">{screenMode === 'game' ? '年間進行 · Move成功で支配更新 · 春秋に補給拠点の更新 · 冬に増減員' : screenMode === 'rules' ? 'ローカル陸軍裁定 · controller / 補給拠点 owner / 年・季節は更新しません' : '表示確認専用 · 勢力色は現在の支配を表します · 裁定は行いません'}</div>}
        {localPlayer&&screenMode==='game'&&sessionState&&<><PhaseTransition phaseKey={`${sessionState.year}:${sessionState.season}:${sessionState.phase}`} year={sessionState.year} season={sessionState.season} phase={sessionState.phase}/>{sessionState.phase==='retreats'&&!sessionState.retreatResolved&&!!sessionState.movement?.dislodgedUnits.length&&<div className="action-ribbon" role="status">撤退が必要です · 撤退中は交渉禁止</div>}</>}
        <MapCanvas key={dataset.kind} dataset={dataset} config={activeContext?.config ?? config} result={screenMode==='game'&&localMapResult?localMapResult:activeContext?.result ?? result} selected={selected} onSelect={selectRegion} ward={ward} busy={busy && !activeContext}
          preview={screenMode === 'game' ? sessionState?.board ?? preview ?? undefined : screenMode === 'rules' ? sandboxState ?? undefined : screenMode === 'preview' ? preview ?? undefined : undefined} anchorMode={screenMode === 'edit' && (mode === 'anchor' || mode === 'obstacle')} onAnchor={setAnchor}
          orders={screenMode === 'game' ? presentation.active?presentation.frame!.snapshot.orders:gameOrders : screenMode === 'rules' ? sandboxOrders : []} orderUnits={screenMode === 'game' ? presentation.active?presentation.frame!.snapshot.before:gameOrderUnits : sandboxOrderUnits}
          events={screenMode==='game'?sessionState?.events:undefined}
          eventFocus={screenMode==="game"?locator.focus:null} eventHighlight={screenMode==="game"?locator.highlight:[]} presentation={screenMode==="game"?presentation:undefined} retreatUnits={localPlayer&&sessionState?.phase==='retreats'&&!sessionState.retreatResolved?sessionState.movement?.dislodgedUnits.map(d=>d.unit):undefined} acceptedOrder={localPlayer?localCommands.accepted:undefined} feedback={localPlayer?boardFeedback:undefined} onRightClick={localPlayer?localCommands.rightClick:undefined} previewNext={localPlayer&&(!localCommands.action||localCommands.action==="move")} secondaryTargetIds={localPlayer&&localCommands.via?localCommands.targets:undefined} legalTargetIds={localPlayer?localCommands.targets:[]} playerFacing={localPlayer}
          obstacleDraft={screenMode === 'edit' ? obstacleDraft : []} />
        <PresentationControls presentation={screenMode==="game"?presentation:{...presentation,frame:null,result:null,active:false}} onSkip={()=>{if(localMemory.current?.log&&sessionState&&sessionContext)localMemory.current.log=recordMatch(localMemory.current.log,sessionContext.result.map,sessionState,new Date().toISOString(),{type:"presentation-skipped"});}}/>
        {localPlayer&&screenMode==='game'&&sessionState?.phase==='orders'&&<BottomActionBar commands={localCommands} units={sessionState.board.units} regionName={regionName} draft={gameOrders.find(o=>o.unitId===localCommands.unit?.unitId)} />}
        <div className="source-note">© 京都市 · <a href="https://data.city.kyoto.lg.jp/dataset/00670/" target="_blank" rel="noreferrer">Dataset 00670</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a> · KMLから変換（架空サンプルを除く）
          {config.obstacles.some(o => o.id === 'kyoto-gyoen-game-obstacle') && <span> · 御苑境界案の参照: <a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noreferrer">地理院タイル</a> / <a href="https://www.env.go.jp/garden/kyotogyoen/2_guide/map.html" target="_blank" rel="noreferrer">環境省御苑案内図</a></span>}
        </div>
      </main>
      <aside className="inspector">
        {(screenMode === 'game' || sessionState) && result && preview && <div hidden={screenMode !== 'game'}><GameSessionPanel key={dataset.kind} map={sessionContext?.result.map ?? result.map} preview={preview} state={sessionState} initial={sessionInitial} selected={selected}
          onStart={state => {setSessionContext({config:structuredClone(config),result:structuredClone(result)});setSessionInitial(structuredClone(state));setSessionState(state);setGameOrders([]);setGameOrderUnits(state.board.units);}}
          inventoryPulseKey={localPlayer&&boardFeedback.inventory?boardFeedback.key:0} presentationLocked={presentation.active} eventLocator={locator} playerFacing={localPlayer} commandRef={localChoose} memoryRef={localMemory} onChange={setSessionState} onSelectRegion={setSelected} onOrdersChange={(orders,units) => {setGameOrders(orders);setGameOrderUnits(units);}} /></div>}
        {screenMode === 'game' ? null : screenMode === 'rules' && sandboxInitial && result ? <RulesSandbox map={result.map} initial={sandboxInitial} selected={selected}
          onSelectRegion={setSelected} onBoardChange={units => setSandboxState(state => state && ({...state, units}))}
          onOrdersChange={(orders, units) => {setSandboxOrders(orders);setSandboxOrderUnits(units);}} /> : screenMode === 'preview' && preview && result ? <>
          <PreviewInspector map={result.map} state={preview} selected={selected} onChange={setPreview} />
          <div className="button-row"><button onClick={() => download('game-state-preview.json', preview)}>Preview JSONを保存</button>
            <label className="file-button">Preview JSONを読込<input type="file" accept=".json" aria-label="Preview JSONを読込" onChange={e => void importJson(e, 'preview')} /></label></div>
          <button disabled={busy} onClick={() => { setPreview(createPreview(result.map)); setMessage('静的マップ設定から表示用の初期状態を作り直しました。'); }}>マップ設定からPreviewを再生成</button>
        </> : <>
        <div className="tabs"><button className={tab === 'edit' ? 'active' : ''} onClick={() => setTab('edit')}>編集</button><button className={tab === 'validate' ? 'active' : ''} onClick={() => setTab('validate')}>検証 {errors.length ? `(${errors.length})` : ''}</button></div>
        {tab === 'edit' ? <>
          <h2>{region?.name ?? '地域を選択'}</h2>
          {region && settings ? <div className="region-details">
            <p>{WARDS.find(w => w.id === region.wardId)!.name} · 第{Number(region.sourceAreaNumber)}国勢統計区</p>
            <code>{region.regionId}</code>
            <label className="check"><input type="checkbox" aria-label="この地域を採用" checked={settings.enabled} onChange={e => updateRegion({ enabled: e.target.checked })} />この地域を採用</label>
            <label className="check"><input type="checkbox" aria-label="補給拠点" checked={settings.isSupplyCenter} onChange={e => updateRegion({ isSupplyCenter: e.target.checked })} />補給拠点（Supply Center）</label>
            <details className="legacy-settings"><summary>互換用 / 将来検討（homeWardId）</summary>
              <p className="hint">オンライン開始時、採用した補給拠点の元行政区と一致する場合だけ初期補給拠点の所有者になります。未設定なら中立開始です。Build・現在支配・撤退には使いません。</p>
              <label>ホーム勢力<WardSelect label="ホーム勢力" nullable value={settings.homeWardId ?? ''} onChange={v => updateRegion({ homeWardId: (v || null) as WardId | null })} /></label>
            </details>
            <label className="check"><input type="checkbox" aria-label="初期ユニット" checked={!!settings.startingUnit} onChange={e => updateRegion({ startingUnit: e.target.checked ? { ownerWardId: region.wardId, type: 'army' } : null })} />初期ユニットを置く</label>
            {settings.startingUnit && <label>初期ユニットの勢力<WardSelect label="初期ユニットの勢力" value={settings.startingUnit.ownerWardId} onChange={v => updateRegion({ startingUnit: { ownerWardId: v as WardId, type: 'army' } })} /></label>}
            <h3>地域内の表示位置</h3>
            <p className="hint">{settings.displayAnchorOverride ? '手動指定を使用中' : '領域内部の見やすい点を自動計算'}。補給拠点・ユニット・地域名をこの位置に結び付けます。</p>
            <button disabled={busy || !settings.enabled} aria-pressed={mode === 'anchor'} onClick={() => setMode(mode === 'anchor' ? 'select' : 'anchor')}>表示位置をこの地点に設定</button>
            {settings.displayAnchorOverride && <button onClick={() => updateRegion({ displayAnchorOverride: null })}>表示位置を自動に戻す</button>}
            <h3>隣接地域 · {neighbors.length}</h3>
            <p className="hint">「隣接override」モードで別地域をクリックすると追加・削除します。青枠は最終的な隣接です。</p>
            <ul className="neighbor-list">{neighbors.map(id => <li key={id}><button onClick={() => setSelected(id)}>{regionName(id)}</button><button aria-label={`${regionName(id)}への隣接を削除`} disabled={busy} onClick={() => setConfig(toggleOverride(config, result!.baseAdjacency, result!.map.adjacency, selected!, id))}>削除</button></li>)}</ul>
            <details><summary>元KML情報</summary><p>{region.source.file}</p><p>Document / Folder: {region.source.folderName}</p><p>Dataset: {region.source.datasetId}</p><p>Placemark: {region.source.placemarks.length}件</p><code>{region.source.sha256}</code></details>
          </div> : <p className="hint">地図または左の一覧から地域をクリックしてください。</p>}
          <h3>自動隣接の許容値</h3>
          <label>座標誤差の許容距離 (m)<input type="number" aria-label="許容距離" min="0" max="100" step="0.1" value={config.adjacency.toleranceMeters} onChange={e => {
            const value = Number(e.target.value); if (e.target.value !== '' && value >= 0 && value <= 100) setConfig({ ...config, adjacency: { ...config.adjacency, toleranceMeters: value } });
          }} /></label>
          <label>共有境界の最小長 (m)<input type="number" aria-label="共有境界の最小長" min="0.01" max="10000" step="1" value={config.adjacency.minSharedBoundaryMeters} onChange={e => {
            const value = Number(e.target.value); if (value > 0 && value <= 10000) setConfig({ ...config, adjacency: { ...config.adjacency, minSharedBoundaryMeters: value } });
          }} /></label>
          <details><summary>手動override ({config.adjacencyAdd.length + config.adjacencyRemove.length})</summary>
            {(['adjacencyAdd', 'adjacencyRemove'] as const).map(key => config[key].map(([a, b], i) => <div className="override" key={`${key}-${pairKey(a, b)}-${i}`}>
              <span>{key === 'adjacencyAdd' ? '追加' : '削除'}: {regionName(a)} ↔ {regionName(b)}</span>
              <button onClick={() => setConfig({ ...config, [key]: config[key].filter((_, index) => index !== i) })}>差分を取消</button>
            </div>))}
          </details>
          <h3>障害物レイヤー · {config.obstacles.length}</h3>
          {dataset.kind === 'kyoto-kml' && <button onClick={() => {
            const proposal = parseObstacleGeoJSON(JSON.parse(gyoenProposal));
            setConfig({ ...config, obstacles: [...config.obstacles.filter(o => !proposal.some(p => p.id === o.id)), ...proposal] });
            setMessage('御苑のゲーム用境界を読み込みました。下辺は滋野の南端まで延長しています。境界を編集し、設定JSONで保存できます。');
          }}>御苑のゲーム用境界案を読み込む</button>}
          <label className="file-button">障害物GeoJSONを読込<input type="file" aria-label="障害物GeoJSONを読込" accept=".json,.geojson,application/json" onChange={e => void importJson(e, 'obstacle')} /></label>
          <button onClick={() => download('obstacles.geojson', { type: 'FeatureCollection', features: config.obstacles })}>障害物GeoJSONを保存</button>
          {config.obstacles.map(o => <div className="override" key={o.id}><span>{o.properties.name}</span>
            {o.geometry.type === 'Polygon' && o.geometry.coordinates.length === 1 && <button onClick={() => {
              if (o.geometry.type !== 'Polygon') return;
              setMovingVertex(null); setEditingObstacleId(o.id); setObstacleDraft(o.geometry.coordinates[0].slice(0, -1).map(p => [p[0], p[1]]));
              setObstacleName(o.properties.name); setObstacleSource(o.properties.source); setMode('obstacle');
            }}>境界を編集</button>}
            <button onClick={() => setConfig({ ...config, obstacles: config.obstacles.filter(x => x.id !== o.id) })}>削除</button></div>)}
          {!!config.obstacles.length && <details><summary>障害物の出典・編集意図</summary>{config.obstacles.map(o => <p key={o.id}><strong>{o.properties.name}</strong><br />{o.properties.source}</p>)}</details>}
          {dataset.kind === 'sample' && <button onClick={() => setConfig({ ...config, obstacles: [sampleObstacle] })}>分断テスト用の障害物を追加</button>}
          <button aria-pressed={mode === 'obstacle'} onClick={() => { setMode('obstacle'); setMovingVertex(null); setEditingObstacleId(null); setObstacleDraft([]); }}>地図上で侵入不能境界を作成</button>
          {mode === 'obstacle' && <div className="obstacle-editor">
            <p className="hint">地図をクリックして境界の頂点を順番に指定してください。現在 {obstacleDraft.length} 頂点。既存境界の修正は末尾の点を戻して追加できます。</p>
            {movingVertex !== null && <p className="anchor-instruction">頂点 {movingVertex + 1} の移動先を地図上でクリック</p>}
            <div className="vertex-list">{obstacleDraft.map((point, i) => <div className="override" key={i}>
              <span>{i + 1}: {point.map(v => v.toFixed(6)).join(', ')}</span>
              <button aria-pressed={movingVertex === i} onClick={() => setMovingVertex(i)}>頂点{i + 1}を移動</button>
            </div>)}</div>
            <label>障害物名<input aria-label="障害物名" value={obstacleName} onChange={e => setObstacleName(e.target.value)} /></label>
            <label>境界の出典・編集意図<textarea aria-label="境界の出典・編集意図" value={obstacleSource} onChange={e => setObstacleSource(e.target.value)} /></label>
            <div className="button-row"><button disabled={!obstacleDraft.length} onClick={() => { setMovingVertex(null); setObstacleDraft(points => points.slice(0, -1)); }}>頂点を1つ戻す</button><button onClick={() => { setMovingVertex(null); setObstacleDraft([]); setMode('select'); setEditingObstacleId(null); }}>作成を取消</button></div>
            <button onClick={saveObstacleDraft}>侵入不能境界を確定</button>
          </div>}
          <p className="hint">京都御苑は通常地域として登録しません。下辺を滋野の南端まで延長し、京極側にも差し引きを適用します。分断しても同じ地域として保持し、必要な通行可否は隣接overrideで調整できます。元geometryは保持します。</p>
        </> : <>
          <h2>マップ検証</h2><p>{busy ? '再計算中…' : `エラー ${errors.length} · 警告 ${warnings.length}`}</p>
          <button disabled={busy || !result} onClick={() => download('validation-report.json', result!.report)}>検証レポートを保存</button>
          <p>連結成分: {result?.report.components.length ?? '—'}</p>
          {result?.report.components.map((ids, i) => <details key={i}><summary>成分 {i + 1} · {ids.length}地域</summary><p>{ids.map(regionName).join('、')}</p></details>)}
          <div className="issues">{result?.report.issues.map((issue, i) => <div className={`issue ${issue.severity}`} key={i}><strong>{issue.severity === 'error' ? 'エラー' : '警告'}</strong> {issue.message}
            {issue.regionIds.filter(id => dataset.regions.some(r => r.regionId === id)).map(id => <button key={id} onClick={() => { setSelected(id); setTab('edit'); }}>{regionName(id)}</button>)}</div>)}</div>
          <details><summary>各地域の隣接数</summary><ul>{Object.entries(result?.report.degrees ?? {}).map(([id, degree]) => <li key={id}><button onClick={() => setSelected(id)}>{regionName(id)}</button>: {degree}</li>)}</ul></details>
          <details><summary>行政区間の接続ペア ({result?.report.crossWardPairs.length ?? 0})</summary><ul>{result?.report.crossWardPairs.map(([a, b]) => <li key={pairKey(a, b)}>{regionName(a)} ↔ {regionName(b)}</li>)}</ul></details>
        </>}
        <h3>行政区・勢力ごとの設定数</h3>
        <div className="table-scroll"><table><thead><tr><th>区</th><th title="区内の採用地域">採用</th><th title="区内の採用補給拠点">拠点</th><th title="勢力の初期ユニット">軍</th><th title="直接接する行政区数">接区</th></tr></thead><tbody>
          {result?.report.counts.map(c => <tr key={c.wardId}><th>{WARDS.find(w => w.id === c.wardId)!.name}</th><td>{c.enabled}</td><td>{c.supplyCenters}</td><td>{c.startingUnits}</td><td>{c.adjacentWards}</td></tr>)}
        </tbody></table></div><p className="hint">除外地域の設定は保持されますが、集計には含まれません。未使用地域の初期配置やoverrideは検証エラーとして表示します。</p>
        </>}
      </aside>
    </div>
  </div>;
}
