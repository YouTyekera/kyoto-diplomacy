import { useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { WARDS, type AreaGeometry, type MapConfig, type RegionDataset, type DisplayAnchor } from '../../../packages/shared/model';
import { geometryParts, toMeters } from '../../../packages/map-core/geometry';
import { fromMeters } from '../../../packages/map-core/anchors';
import type { CompileResult } from '../../../packages/map-core/compile';
import type { GameStatePreview } from '../../../packages/shared/preview';
import { regionFill } from '../../../packages/shared/display';
import { layoutMarkers, markerPixels } from './marker-layout';
import type { Unit } from '../../../packages/rules-core/model';
import type { PublicEvents } from '../../../packages/shared/events';
import type { ResolvedPublicOrder as Order } from '../../../packages/game-core/model';
import { describeOrder } from './BottomActionBar';
import { SupplyCenterMarker, ArmyMarker } from './MapMarkers';
import type { EventFocus } from './EventsPanel';
import { presentationPosition,presentationSettings,type Presentation } from './AdjudicationPresentation';
import { useCallback } from 'react';
import type { BoardFeedback } from './GameFeel';
import type { GameOrder } from '../../../packages/shared/events';
import { uiMotion } from './ui-motion';
import { fitBoard, clampBoardView, neutralSupplyScale } from './board-camera';
import { TerrainBackdrop } from './TerrainBackdrop';

interface Props {
  dataset: RegionDataset; config: MapConfig; result?: Pick<CompileResult, 'map'>;
  selected: string | null; onSelect: (id: string) => void; ward: string; busy: boolean;
  preview?: GameStatePreview; anchorMode?: boolean; onAnchor?: (point: DisplayAnchor) => void;
  obstacleDraft?: DisplayAnchor[];
  orders?: Order[]; orderUnits?: Unit[];
  events?:PublicEvents;
  legalTargetIds?:string[]; playerFacing?:boolean;
  currentPlayerWardId?:string|null;onRightClick?:(id:string)=>void;
  previewNext?:boolean;secondaryTargetIds?:string[];
  eventFocus?:EventFocus|null;eventHighlight?:string[];presentation?:Presentation;
  feedback?:BoardFeedback;acceptedOrder?:{key:number;order:GameOrder}|null;
  retreatUnits?:Unit[];
}
const defaultView = { x: 0, y: 0, width: 1000, height: 800 };
export function MapCanvas({ dataset, config, result, selected, onSelect:handleSelect, ward, busy, preview, anchorMode, onAnchor, obstacleDraft = [], orders = [], orderUnits = [],events, legalTargetIds = [], playerFacing = false,currentPlayerWardId,onRightClick,previewNext=false,secondaryTargetIds,eventFocus,eventHighlight=[],presentation,feedback,acceptedOrder,retreatUnits=[] }: Props) {
  const onSelect=useCallback((id:string)=>{if(!presentation?.active)handleSelect(id);},[handleSelect,presentation?.active]);
  const [acceptedRegion,setAcceptedRegion]=useState<string|null>(null);
  useEffect(()=>{const order=acceptedOrder?.order;if(!order){setAcceptedRegion(null);return;}const id='destination'in order?order.destination:order.type==='deploy-barricade'?order.targetRegionId:orderUnits.find(u=>u.unitId===order.unitId)?.regionId;setAcceptedRegion(id??null);const timer=setTimeout(()=>setAcceptedRegion(null),uiMotion.feedback);return()=>clearTimeout(timer);},[acceptedOrder?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const [view, setView] = useState(defaultView);
  const [hover, setHover] = useState('');
  const [showCut, setShowCut] = useState(true);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [pulse,setPulse]=useState<string[]>([]);
  const [cursor, setCursor] = useState({x:0,y:0});
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltipSize,setTooltipSize] = useState({width:190,height:65});
  const tooltipRegion = dataset.regions.find(r=>r.regionId===hoveredId);
  const tooltipVisible = !!tooltipRegion && !!config.regions[tooltipRegion.regionId]?.enabled && !!result?.map.regions.find(r=>r.regionId===tooltipRegion.regionId)?.playableGeometry;
  useEffect(()=>{const box=tooltipRef.current?.getBoundingClientRect();if(box)setTooltipSize({width:box.width,height:box.height});},[tooltipVisible,tooltipRegion?.regionId]);
  const [viewport, setViewport] = useState({ width: 1000, height: 800 });
  const compiledRegions=result?.map.regions,hasPreview=!!preview;
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; view: typeof defaultView; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  useEffect(() => {
    const svg = svgRef.current!;
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect; if (width && height) setViewport({ width, height });
    });
    observer.observe(svg); return () => observer.disconnect();
  }, []);
  const projection = useMemo(() => {
    const points = dataset.regions.flatMap(r => geometryParts(r.geometry).flat(2).map(toMeters));
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const scale = Math.min(940 / Math.max(1, maxX - minX), 740 / Math.max(1, maxY - minY));
    const offsetX = (1000 - (maxX - minX) * scale) / 2;
    const offsetY = (800 - (maxY - minY) * scale) / 2;
    const project = (p: number[]) => {
      const [x, y] = toMeters(p);
      return [offsetX + (x - minX) * scale, 800 - offsetY - (y - minY) * scale];
    };
    const unproject = (p: number[]) => fromMeters([(p[0] - offsetX) / scale + minX, (800 - offsetY - p[1]) / scale + minY]);
    const path = (geometry: AreaGeometry) => geometryParts(geometry).map(polygon => polygon.map(ring =>
      ring.map((p, i) => `${i ? 'L' : 'M'}${project(p).join(',')}`).join(' ') + 'Z').join(' ')).join(' ');
    return { project, unproject, path };
  }, [dataset]);
  const rendered = useMemo(() => dataset.regions.map(r => {
    const compiled = compiledRegions?.find(c => c.regionId === r.regionId);
    const cut = compiled?.playableGeometry;
    const geometry = (hasPreview || showCut) && compiled ? cut : r.geometry;
    return { ...r, path: geometry ? projection.path(geometry) : '',
      center: compiled?.displayAnchor ? projection.project(compiled.displayAnchor) : null,
      displayAnchor: compiled?.displayAnchor };
  }), [dataset, projection, compiledRegions, showCut, hasPreview]);
  const aspect=viewport.width/viewport.height;
  const playableView=useMemo(()=>{
    const points=compiledRegions?.filter(r=>r.enabled&&r.playableGeometry).flatMap(r=>geometryParts(r.playableGeometry!).flat(2).map(projection.project))??[];
    if(!points.length)return defaultView;
    return fitBoard(points,aspect,1.1)??defaultView;
  },[compiledRegions,projection,aspect]);
  const operationPoints=useMemo(()=>compiledRegions?.filter(r=>r.enabled&&r.displayAnchor&&(r.isSupplyCenter||r.startingUnit)).map(r=>projection.project(r.displayAnchor!))??[],[compiledRegions,projection]);
  const operationView=useMemo(()=>operationPoints.length>1?fitBoard(operationPoints,aspect)??playableView:playableView,[operationPoints,aspect,playableView]);
  const [fitMode,setFitMode]=useState<'operation'|'all'|null>('operation');
  const hasMap=!!result;
  useEffect(()=>{if(playerFacing&&hasMap)setView(v=>clampBoardView(fitMode ? fitMode==='all'?playableView:operationView : v,playableView,aspect));},[playerFacing,hasMap,fitMode,operationView,playableView,aspect]);
  const terrainPaths=useMemo(()=>[...rendered.filter(r=>config.regions[r.regionId]?.enabled).map(r=>r.path),...config.obstacles.map(o=>projection.path(o.geometry))],[rendered,config,projection]);
  const unitsPerPixel = Math.max(view.width / viewport.width, view.height / viewport.height);
  useEffect(()=>{
    if(!eventFocus)return;
    const points=eventFocus.regionIds.map(id=>rendered.find(r=>r.regionId===id)?.center).filter((p):p is number[]=>!!p);
    if(!points.length)return;
    setFitMode(null);
    const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
    setView(v=>{
      const width=Math.min(v.width,Math.max(100,(Math.max(...xs)-Math.min(...xs))*1.7,(Math.max(...ys)-Math.min(...ys))*1.7*aspect));
      const next={x:(Math.min(...xs)+Math.max(...xs)-width)/2,y:(Math.min(...ys)+Math.max(...ys)-width/aspect)/2,width,height:width/aspect};
      return playerFacing?clampBoardView(next,playableView,aspect):next;
    });
    setPulse(eventFocus.regionIds);const timer=setTimeout(()=>setPulse([]),presentationSettings.focusPulseMs);return()=>clearTimeout(timer);
  },[eventFocus?.key,projection]); // eslint-disable-line react-hooks/exhaustive-deps
  const focusedIds=useMemo(()=>new Set([...eventHighlight,...pulse]),[eventHighlight,pulse]);
  const legalSet=useMemo(()=>new Set(legalTargetIds),[legalTargetIds]);
  const secondaryIds=useMemo(()=>secondaryTargetIds??(previewNext&&hoveredId&&legalSet.has(hoveredId)?result?.map.adjacency[hoveredId]??[]:[]),[secondaryTargetIds,previewNext,hoveredId,legalSet,result]);
  const secondarySet=useMemo(()=>new Set(secondaryIds),[secondaryIds]);
  const zoomLevel = 1000 / view.width;
  const tokenScale = unitsPerPixel * markerPixels(zoomLevel) * (playerFacing?1.18:1) / 14;
  const markers = useMemo(() => {
    const eligible = rendered.filter(r => r.center && config.regions[r.regionId]?.enabled &&
      (config.regions[r.regionId].isSupplyCenter || (preview ? preview.units.some(u => u.regionId === r.regionId) : config.regions[r.regionId].startingUnit)));
    return layoutMarkers(eligible.map(r => ({ regionId: r.regionId, anchor: r.center!, priority: r.regionId === selected })));
  }, [rendered, config, preview, selected]);
  const neighbors = useMemo(()=>new Set(selected ? result?.map.adjacency[selected] ?? [] : []),[selected,result]);
  const pointInView = (clientX: number, clientY: number) => {
    const point = new DOMPoint(clientX, clientY).matrixTransform(svgRef.current!.getScreenCTM()!.inverse());
    return [point.x, point.y];
  };
  function zoom(factor: number, center = [view.x + view.width / 2, view.y + view.height / 2]) {
    setFitMode(null);
    setView(v => {
      const width = Math.max(8, Math.min(playerFacing?playableView.width*1.04:4000, v.width * factor));
      const ratio = width / v.width;
      const next={ x: center[0] - (center[0] - v.x) * ratio, y: center[1] - (center[1] - v.y) * ratio,
        width, height: v.height * ratio };
      return playerFacing?clampBoardView(next,playableView,aspect):next;
    });
  }
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    function wheel(e: WheelEvent) {
      e.preventDefault();
      const center = pointInView(e.clientX, e.clientY);
      zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, center);
    }
    svg.addEventListener('wheel', wheel, { passive: false });
    return () => svg.removeEventListener('wheel', wheel);
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps
  function move(e: PointerEvent<SVGSVGElement>) {
    setCursor({x:e.clientX,y:e.clientY});
    const current = drag.current;
    // A right-button gesture must never reuse the previous left-button pan origin.
    if (!current || !(e.buttons & 1)) return;
    const dx = e.clientX - current.x, dy = e.clientY - current.y;
    if (Math.hypot(dx, dy) <= 3 && !current.moved) return;
    current.moved = true;
    setFitMode(null);
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    const scale = Math.max(current.view.width / rect.width, current.view.height / rect.height);
    const next={ ...current.view, x: current.view.x - dx * scale, y: current.view.y - dy * scale };
    setView(playerFacing?clampBoardView(next,playableView,aspect):next);
  }
  function focusWard() {
    setFitMode(null);
    const points = playerFacing
      ? (compiledRegions??[]).filter(r=>r.enabled&&r.playableGeometry&&(ward!=='all'?r.wardId===ward:selected?r.regionId===selected:true)).flatMap(r=>geometryParts(r.playableGeometry!).flat(2).map(projection.project))
      : dataset.regions.filter(r=>ward==='all'||r.wardId===ward).flatMap(r=>geometryParts(r.geometry).flat(2).map(projection.project));
    if (!points.length) return;
    const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
    const width = Math.max(20, Math.max(...xs) - Math.min(...xs)) * 1.15;
    const height = Math.max(16, Math.max(...ys) - Math.min(...ys)) * 1.15;
    const ratio=playerFacing?aspect:1.25;
    const fitWidth = playerFacing?Math.min(view.width,Math.max(width,height*ratio)):Math.max(width,height*ratio), fitHeight = fitWidth / ratio;
    const next={ x: (Math.min(...xs) + Math.max(...xs) - fitWidth) / 2,
      y: (Math.min(...ys) + Math.max(...ys) - fitHeight) / 2, width: fitWidth, height: fitHeight };
    setView(playerFacing?clampBoardView(next,playableView,aspect):next);
  }
  const markerItems = markers.map(marker => {
    const r = rendered.find(region => region.regionId === marker.regionId)!;
    const settings = config.regions[r.regionId];
    const unitOwner = preview ? preview.units.find(u => u.regionId === r.regionId)?.ownerWardId : settings.startingUnit?.ownerWardId;
    const owner = preview ? preview.regionControl[r.regionId]?.supplyCenterOwnerWardId : null;
    const unitName = WARDS.find(w => w.id === unitOwner)?.name;
    const markerUnit = orderUnits.find(u => u.regionId === r.regionId);
    const order = orders.find(o => o.unitId === markerUnit?.unitId);
    const supportRegion = order && 'targetUnitId' in order ? orderUnits.find(u => u.unitId === order.targetUnitId)?.regionId : undefined;
    const command = order ? playerFacing ? ` · 命令: ${describeOrder(order, orderUnits, id => rendered.find(r => r.regionId === id)?.name ?? '地域')}` : ` · 命令: ${order.type}${supportRegion ? ` 支援対象 ${rendered.find(region => region.regionId === supportRegion)?.name ?? supportRegion}` : ''}${'destination' in order ? ` → ${rendered.find(region => region.regionId === order.destination)?.name ?? order.destination}` : ''}` : '';
    const active = selected === r.regionId || hoveredId === r.regionId;
    const title = `${unitOwner?(currentPlayerWardId===unitOwner?'自軍':`${unitName}軍`)+' / ':''}${r.name}${settings.isSupplyCenter ? ` · 補給拠点: ${owner ? WARDS.find(w => w.id === owner)?.name : '中立（未所有）'}` : ''}${command}`;
    return { marker, r, settings, unitOwner, owner, unitName, active, title };
  });
  const impactStandoffs=presentation?.active&&presentation.frame&&presentation.frame.elapsed>=presentationSettings.slideEndMs&&presentation.frame.elapsed<presentationSettings.impactEndMs?presentation.frame.snapshot.movement.standoffRegions:undefined;
  const regionElements=useMemo(()=>rendered.map(r => {
        const settings = config.regions[r.regionId], isSelected = r.regionId === selected;
        const fill = regionFill({ ...r, enabled: !!settings?.enabled, isSupplyCenter: !!settings?.isSupplyCenter }, preview);
        const control = preview?.regionControl[r.regionId];
        const nameOf = (id: string | null | undefined) => WARDS.find(w => w.id === id)?.name ?? '中立';
        return <g key={r.regionId}>
          <path data-region-id={r.regionId} data-display-center={r.center?.join(',')} d={r.path} fillRule="evenodd"
            fill={fill} data-controller-ward-id={control?.controllerWardId ?? ''}
            className={`region ${settings?.enabled ? 'playable-region' : 'excluded-region'} ${isSelected ? 'selected' : ''} ${hoveredId === r.regionId ? 'hovered' : ''} ${!playerFacing && neighbors.has(r.regionId) ? 'neighbor' : ''} ${legalSet.has(r.regionId) ? 'legal-target' : ''} ${secondarySet.has(r.regionId)&&(!!secondaryTargetIds||!legalSet.has(r.regionId))?'secondary-target':''} ${focusedIds.has(r.regionId)?'event-highlight':''} ${pulse.includes(r.regionId)?'event-pulse':''} ${acceptedRegion===r.regionId?'order-accepted-pulse':''} ${impactStandoffs?.includes(r.regionId)?'standoff-flash':''}`}
            opacity={ward === 'all' || ward === (preview ? control?.controllerWardId : r.wardId) ? 1 : 0.35}
            role="button" tabIndex={0} aria-label={`${r.name} (${WARDS.find(w => w.id === r.wardId)!.name})`}
            onMouseEnter={() => { setHoveredId(r.regionId); setHover(`${r.name} · ${preview ? `現在支配: ${nameOf(control?.controllerWardId)}` : WARDS.find(w => w.id === r.wardId)!.name} · ${settings?.enabled ? '採用' : '除外'}`); }}
            onMouseLeave={() => { setHover(''); setHoveredId(null); }}
            onClick={() => { if (!suppressClick.current && !anchorMode) onSelect(r.regionId); }}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(r.regionId); } }}>
            <title>{r.name} ({WARDS.find(w => w.id === r.wardId)!.name})</title>
          </path>
        </g>;
      }),[rendered,config,selected,preview,ward,hoveredId,playerFacing,neighbors,legalSet,secondarySet,secondaryTargetIds,focusedIds,pulse,acceptedRegion,impactStandoffs,anchorMode,onSelect]);
  const inspected=rendered.find(r=>r.regionId===(hoveredId??selected));
  function resetCamera(){
    if(!playerFacing){setFitMode(null);setView(defaultView);return;}
    const unitPoints=preview?.units.map(u=>rendered.find(r=>r.regionId===u.regionId)?.center).filter((p):p is number[]=>!!p)??[];
    setFitMode(null);
    setView(clampBoardView(operationPoints.length>1?fitBoard([...operationPoints,...unitPoints],aspect)??playableView:playableView,playableView,aspect));
  }
  return <section className={`map-section ${playerFacing?'player-map':''} ${presentation?.active?'presentation-active':''}`} aria-label="地図">
    <div className="map-controls">
      <button onClick={() => zoom(1 / 1.5)} aria-label="拡大">＋</button>
      <button onClick={() => zoom(1.5)} aria-label="縮小">−</button>
      <button onClick={resetCamera} title={playerFacing?'補給拠点と軍を中心に表示':''}>全体に戻す</button>
      {playerFacing&&<button onClick={()=>{setFitMode('all');setView(playableView);}}>全域を表示</button>}
      <button onClick={focusWard}>{playerFacing?'選択地域を拡大':'選択区を拡大'}</button>
      {!playerFacing && <label><input type="checkbox" checked={preview ? true : showCut} disabled={!!preview} onChange={e => setShowCut(e.target.checked)} />障害物差し引き後</label>}
      {busy && <span className="calculating" role="status">隣接・検証を計算中…</span>}
    </div>
    <svg ref={svgRef} className="map" viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`} preserveAspectRatio="xMidYMid meet"
      onContextMenu={e=>{if(onRightClick){e.preventDefault();drag.current=null;const target=(e.target as Element).closest('[data-region-id],[data-marker-region],[data-supply-region],[data-ground-region]');onRightClick(target?.getAttribute('data-region-id')??target?.getAttribute('data-marker-region')??target?.getAttribute('data-supply-region')??target?.getAttribute('data-ground-region')??'');}}}
      aria-label="国勢統計区の地図"
      onClick={e => { if (anchorMode && !suppressClick.current) onAnchor?.(projection.unproject(pointInView(e.clientX, e.clientY))); }}
      onPointerDown={e => { suppressClick.current=false;drag.current=e.button===0?{ x: e.clientX, y: e.clientY, view, moved: false }:null; }}
      onPointerUp={e=>{suppressClick.current=!!drag.current?.moved;drag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
      onPointerMove={move} onPointerLeave={()=>{setHoveredId(null);setHover('');}} onPointerCancel={() => { drag.current = null; }}>
      <defs><pattern id="obstacle-hatch" width={8 * unitsPerPixel} height={8 * unitsPerPixel} patternUnits="userSpaceOnUse">
        <path d={`M0 ${8 * unitsPerPixel}L${8 * unitsPerPixel} 0`} stroke="#7b2749" strokeWidth={1.5 * unitsPerPixel} />
      </pattern><marker id="order-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="#234e7a" /></marker>
      <marker id="support-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M1 1L9 5L1 9" fill="none" stroke="#885022" strokeWidth="2" /></marker></defs>
      {playerFacing&&<TerrainBackdrop playablePaths={terrainPaths} view={view} unitsPerPixel={unitsPerPixel} />}
      {regionElements}
      {config.obstacles.map(o => <g key={o.id} data-obstacle-id={o.id}>
        <path d={projection.path(o.geometry)} fill="#354640" fillOpacity="0.6" stroke="#263b34"
          className="obstacle obstacle-fill" fillRule="evenodd"><title>{o.properties.name} · 侵入不能</title></path>
        <path d={projection.path(o.geometry)} fill="url(#obstacle-hatch)" opacity="0.16" className="obstacle-hatching" fillRule="evenodd" />
      </g>)}
      {orders.filter(o=>o.type!=='hold').map(order=>{
        const unit=orderUnits.find(u=>u.unitId===order.unitId);if(!unit) return null;
        const from=rendered.find(r=>r.regionId===unit.regionId)?.center;
        if(order.type==='bicycle-move') {
          const via=rendered.find(r=>r.regionId===order.viaRegionId)?.center,to=rendered.find(r=>r.regionId===order.destination)?.center;
          return from&&via&&to?<polyline key={order.unitId} className="order-line bicycle-line" points={[from,via,to].map(p=>p.join(',')).join(' ')} fill="none" stroke="#234e7a" strokeWidth="2" vectorEffect="non-scaling-stroke" markerEnd="url(#order-arrow)" />:null;
        }
        const targetId=order.type==='deploy-barricade'?order.targetRegionId:order.type==='move'||order.type==='support-move'?order.destination:orderUnits.find(u=>u.unitId===order.targetUnitId)?.regionId;
        const to=rendered.find(r=>r.regionId===targetId)?.center;if(!from||!to) return null;
        const support=order.type==='support-hold'||order.type==='support-move';
        return <line key={order.unitId} className={support?'order-line support-line':'order-line move-line'} x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]}
          stroke={support?'#885022':'#234e7a'} strokeWidth="2" strokeDasharray={support?'5 4':undefined} vectorEffect="non-scaling-stroke" markerEnd={`url(#${support?'support-arrow':'order-arrow'})`} />;
      })}
      {events&&[...events.temporaryBusEdges.map(e=>({...e,type:'bus',remaining:0})),...events.roadworkEdges.map(e=>({...e,type:'roadwork',remaining:0})),...events.activeBarricades.map(e=>({...e,type:'barricade',remaining:e.remainingMovementSeasons}))].map(e=>{
        const a=rendered.find(r=>r.regionId===e.a)?.center,b=rendered.find(r=>r.regionId===e.b)?.center;if(!a||!b)return null;
        const mid=[(a[0]+b[0])/2,(a[1]+b[1])/2],color=e.type==='bus'?'#147c9f':e.type==='roadwork'?'#d07412':'#8c3d42';
        return <g key={`${e.type}-${e.a}-${e.b}`} className={`event-edge ${focusedIds.has(e.a)&&focusedIds.has(e.b)?'event-edge-focused':''}`} data-event-edge={e.type} data-edge-a={e.a} data-edge-b={e.b} pointerEvents="none">
          {e.type==='bus'?<line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={color} strokeWidth="3" strokeDasharray="8 4" vectorEffect="non-scaling-stroke" />:<line x1={a[0]*.25+b[0]*.75} y1={a[1]*.25+b[1]*.75} x2={a[0]*.75+b[0]*.25} y2={a[1]*.75+b[1]*.25} stroke={color} strokeWidth="5" vectorEffect="non-scaling-stroke" />}
          {e.type==='roadwork'&&<path d={`M${mid[0]-4*unitsPerPixel} ${mid[1]-4*unitsPerPixel}l${8*unitsPerPixel} ${8*unitsPerPixel}m${-8*unitsPerPixel} 0l${8*unitsPerPixel} ${-8*unitsPerPixel}`} stroke={color} strokeWidth="3" vectorEffect="non-scaling-stroke"/>}
          <text x={mid[0]} y={mid[1]-5*unitsPerPixel} fontSize={11*unitsPerPixel} textAnchor="middle" className="region-marker-label">{e.type==='bus'?'臨時バス':e.type==='roadwork'?'工事':`封鎖 ${e.remaining}`}</text>
        </g>;
      })}
      {events?.groundEquipment.map(e=>{const at=rendered.find(r=>r.regionId===e.regionId)?.center;if(!at)return null;return <g key={e.equipmentId} data-ground-equipment={e.type} data-ground-region={e.regionId} transform={`translate(${at.join(' ')}) scale(${tokenScale})`} role="button" tabIndex={0} aria-label={`${e.type==='bicycle'?'自転車':'バリケード'} ${rendered.find(r=>r.regionId===e.regionId)?.name}`} onMouseEnter={()=>{setHoveredId(e.regionId);setHover(`${rendered.find(r=>r.regionId===e.regionId)?.name} · ${e.type==='bicycle'?'自転車':'バリケード'}`);}} onMouseLeave={()=>{setHoveredId(null);setHover('');}} onClick={()=>{if(!suppressClick.current&&!anchorMode)onSelect(e.regionId);}} onKeyDown={v=>{if(v.key==='Enter')onSelect(e.regionId);}}>
        <rect x="-10" y="-10" width="20" height="20" rx="3" fill="#fffbea" stroke="#463e30" strokeWidth="1.5" />
        {e.type==='bicycle'?<g fill="none" stroke="#234e7a" strokeWidth="1.4"><circle cx="-5" cy="4" r="3"/><circle cx="5" cy="4" r="3"/><path d="M-5 4L-1-3L5 4H-5L0 0M-2-4H1M3-5H5L5 4"/></g>:<g stroke="#8c3d42" strokeWidth="2"><path d="M-6-5V7M6-5V7M-8-3H8M-8 2H8"/></g>}
      </g>;})}
      <g className="supply-layer">
      {markerItems.filter(item => item.settings.isSupplyCenter).map(({ marker, r, owner, active, title }) => <g key={r.regionId}
        className={`supply-region-marker ${active ? 'marker-active' : ''} ${feedback?.captured.includes(r.regionId)?'sc-captured':''}`} data-supply-region={r.regionId} role="button" tabIndex={0} aria-label={title}
        onMouseEnter={() => { setHoveredId(r.regionId); setHover(title); }} onMouseLeave={() => { setHoveredId(null); setHover(''); }}
        onClick={() => { if (!suppressClick.current && !anchorMode) onSelect(r.regionId); }} onKeyDown={e => { if (e.key === 'Enter') onSelect(r.regionId); }}>
        <title>{title}</title><g transform={`translate(${marker.x} ${marker.y}) scale(${tokenScale})`}><circle className="supply-hit-target" r={Math.max(8.5,10*unitsPerPixel/tokenScale)} fill="transparent" stroke="none" pointerEvents="all" /><circle className="supply-selection-ring" cx="0" cy="0" r="8.5" fill="none" stroke="#287f96" strokeWidth="1.3" vectorEffect="non-scaling-stroke" pointerEvents="none" /><SupplyCenterMarker owner={owner} preview={!!preview} neutralScale={playerFacing?neutralSupplyScale(view.width,playableView.width):1} /></g>
      </g>)}
      </g>
      <g className="army-layer" visibility={presentation?.active?'hidden':undefined}>
      {markerItems.map(({ marker, r, unitOwner, unitName, active, title }) => {
        return <g key={r.regionId} className={`region-marker ${active ? 'marker-active' : ''} ${legalSet.has(r.regionId)?'legal-unit':''} ${selected===r.regionId&&unitOwner?'selected-army':''} ${feedback?.built.includes(preview?.units.find(u=>u.regionId===r.regionId)?.unitId??'')?'army-built':''}`} data-marker-region={r.regionId}
          data-anchor={r.displayAnchor?.join(',')} role="button" tabIndex={0} aria-label={title}
          onMouseEnter={() => { setHoveredId(r.regionId); setHover(title); }} onMouseLeave={() => { setHoveredId(null); setHover(''); }}
          onClick={() => { if (!suppressClick.current && !anchorMode) onSelect(r.regionId); }}
          onKeyDown={e => { if (e.key === 'Enter') onSelect(r.regionId); }}>
          <title>{title}</title>
          <circle className="marker-anchor" cx={marker.anchor[0]} cy={marker.anchor[1]} r={0.5 * unitsPerPixel} opacity="0" />
          <g className="token-position" transform={`translate(${marker.x} ${marker.y}) scale(${tokenScale})`}>
            {unitOwner && <><ArmyMarker owner={unitOwner} isOwnUnit={unitOwner===currentPlayerWardId} />{orders.some(o=>o.type==='hold'&&orderUnits.find(u=>u.unitId===o.unitId)?.regionId===r.regionId)&&<g className="hold-indicator" aria-label="待機命令"><path d="M8-7h7v5c0 3-3.5 5-3.5 5S8 1 8-2Z" fill="#fffefa" stroke="#31594b" strokeWidth="1"/><path d="M10-4h3" stroke="#31594b" strokeWidth="1"/></g>}</>}
          </g>
          {(playerFacing?(hoveredId??selected)===r.regionId:(active||zoomLevel>=4)) && <g transform={`translate(${marker.x} ${marker.y}) scale(${unitsPerPixel})`} pointerEvents="none">
            <text className="region-marker-label" y="25" textAnchor="middle" fontSize="11">{r.name}{!playerFacing&&active&&unitName?` · ${unitName}`:''}</text>
          </g>}
        </g>;
      })}
      </g>
      {presentation?.active&&presentation.frame&&<g className={`presentation-layer ${presentation.reduced?'reduced-motion':''}`} pointerEvents="none">
        {presentation.frame.snapshot.before.map(unit=>{const frame=presentation.frame!;const at=presentationPosition(frame.snapshot,unit.unitId,frame.elapsed,id=>rendered.find(r=>r.regionId===id)?.center??null,presentation.reduced);if(!at)return null;
          const dislodged=frame.snapshot.movement.dislodgedUnits.some(d=>d.unit.unitId===unit.unitId);
          return <g key={unit.unitId} data-presentation-unit={unit.unitId} data-move-status={frame.snapshot.movement.orderResults.find(r=>r.order.unitId===unit.unitId)?.status} className={dislodged&&frame.elapsed>=presentationSettings.slideEndMs&&frame.elapsed<presentationSettings.impactEndMs?'dislodged-shake':''} transform={`translate(${at.join(' ')}) scale(${tokenScale})`} opacity={dislodged&&frame.elapsed>=presentationSettings.impactEndMs?.35:1}><ArmyMarker owner={unit.ownerWardId} isOwnUnit={unit.ownerWardId===currentPlayerWardId}/></g>;
        })}
      </g>}
      {!presentation?.active&&retreatUnits.map(unit=>{const at=rendered.find(r=>r.regionId===unit.regionId)?.center;if(!at)return null;return <g key={unit.unitId} className="retreat-required-marker" aria-label={`${rendered.find(r=>r.regionId===unit.regionId)?.name}の軍は撤退が必要`} transform={`translate(${at.join(' ')}) scale(${unitsPerPixel})`} pointerEvents="none"><g transform="translate(18 -24)"><rect x="-4" y="-14" width="34" height="20" rx="4" fill="#fff5df" stroke="#a66b1b"/><text fontSize="11" className="region-marker-label">撤退</text></g></g>;})}
      {feedback&&<g key={feedback.key} className="board-feedback-layer" pointerEvents="none">{feedback.removed.map(u=>{const at=rendered.find(r=>r.regionId===u.regionId)?.center;return at?<g key={u.unitId} className="army-disbanded" transform={`translate(${at.join(' ')}) scale(${tokenScale})`}><ArmyMarker owner={u.ownerWardId}/></g>:null;})}{feedback.pickups.map(id=>{const at=rendered.find(r=>r.regionId===id)?.center;return at?<g key={id} transform={`translate(${at.join(' ')}) scale(${unitsPerPixel})`} className="equipment-picked-up"><text fontSize="12" textAnchor="middle" className="region-marker-label">装備取得 ↗</text></g>:null;})}</g>}
      {selected && rendered.find(r => r.regionId === selected)?.center && !markers.some(m => m.regionId === selected) && (() => {
        const r = rendered.find(region => region.regionId === selected)!;
        return <g className="selected-anchor" transform={`translate(${r.center!.join(' ')}) scale(${unitsPerPixel})`}>
          <circle r="5" fill="#fff" stroke="#cc552d" strokeWidth="2" />
          <text y="22" textAnchor="middle" fontSize="12" className="region-marker-label">{r.name}</text>
        </g>;
      })()}
      {!!obstacleDraft.length && <g className="obstacle-draft">
        <polyline points={obstacleDraft.map(p => projection.project(p).join(',')).join(' ')} fill="none" stroke="#7b2749" strokeWidth="3" vectorEffect="non-scaling-stroke" />
        {obstacleDraft.map((p, i) => { const point = projection.project(p); return <g key={i}><circle cx={point[0]} cy={point[1]} r={3 * unitsPerPixel} fill="#7b2749" />
          <text x={point[0] + 5 * unitsPerPixel} y={point[1] - 5 * unitsPerPixel} fontSize={12 * unitsPerPixel} className="region-marker-label">{i + 1}</text></g>; })}
      </g>}
    </svg>
    {tooltipVisible && tooltipRegion && <div ref={tooltipRef} role="tooltip" className="region-tooltip" style={{
      left:Math.max(8,Math.min(cursor.x+14,window.innerWidth-tooltipSize.width-8)),
      top:Math.max(8,Math.min(cursor.y+16,window.innerHeight-tooltipSize.height-8)),
    }}><strong>{preview?.units.some(u=>u.regionId===tooltipRegion.regionId)?`${preview.units.find(u=>u.regionId===tooltipRegion.regionId)?.ownerWardId===currentPlayerWardId?'自軍':WARDS.find(w=>w.id===preview.units.find(u=>u.regionId===tooltipRegion.regionId)?.ownerWardId)?.name+'軍'} / `:''}{tooltipRegion.name}</strong><span>{WARDS.find(w=>w.id===tooltipRegion.wardId)?.name}</span>{config.regions[tooltipRegion.regionId]?.isSupplyCenter&&<span>補給拠点: {WARDS.find(w=>w.id===preview?.regionControl[tooltipRegion.regionId]?.supplyCenterOwnerWardId)?.name??'中立（未所有）'}</span>}</div>}
    {playerFacing&&inspected&&config.regions[inspected.regionId]?.enabled&&<div className="region-inspector" aria-label="地域インスペクタ"><strong>{inspected.name}</strong><span>{WARDS.find(w=>w.id===inspected.wardId)?.name} · 支配: {WARDS.find(w=>w.id===preview?.regionControl[inspected.regionId]?.controllerWardId)?.name??'中立'}</span>{config.regions[inspected.regionId]?.isSupplyCenter&&<div>補給拠点: {WARDS.find(w=>w.id===preview?.regionControl[inspected.regionId]?.supplyCenterOwnerWardId)?.name??'中立（未所有）'}</div>}</div>}
    {secondaryIds.length>0&&<p className="two-hop-hint">{secondaryTargetIds?'自転車の第2区間の移動先':'次の一歩の参考（現在の通行条件基準）'}</p>}
    <div className="map-footer"><span aria-live="polite">{hover || 'ドラッグで移動 · ホイールで拡大 · クリックで地域を選択'}</span>
      <span>Armyピン: {preview ? '現在の陸軍' : '初期ユニット'} / 円: 補給拠点 / 濃色領域: 侵入不能 / 青実線: Move / 茶破線: Support</span></div>
  </section>;
}

