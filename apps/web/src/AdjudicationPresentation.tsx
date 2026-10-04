import { useEffect,useRef,useState,type ReactNode } from 'react';
import { uiMotion } from './ui-motion';
import type { ResolutionPresentation } from '../../../packages/game-core/model';
import settings from '../../../data/config/presentation-settings.json';
export { settings as presentationSettings };
export function usePresentation(snapshot:ResolutionPresentation|null|undefined){
  const seen=useRef(snapshot?.id),[frame,setFrame]=useState<{snapshot:ResolutionPresentation;elapsed:number}|null>(null),[drawerOpen,setDrawerOpen]=useState(false);
  useEffect(()=>{
    if(!snapshot){seen.current=undefined;setFrame(null);setDrawerOpen(false);return;}
    if(snapshot.id===seen.current)return;
    seen.current=snapshot.id;setDrawerOpen(false);setFrame({snapshot,elapsed:-uiMotion.ready});
  },[snapshot]);
  useEffect(()=>{
    if(!frame||frame.elapsed>=settings.settleEndMs)return;
    const start=performance.now()-frame.elapsed;let raf=0;
    const tick=()=>{const elapsed=Math.min(settings.settleEndMs,performance.now()-start);setFrame(previous=>previous?{...previous,elapsed}:null);if(elapsed<settings.settleEndMs)raf=requestAnimationFrame(tick);};
    raf=requestAnimationFrame(tick);
    const resume=()=>{if(!document.hidden){cancelAnimationFrame(raf);tick();}};
    document.addEventListener('visibilitychange',resume);
    // Background tabs may throttle RAF. Wall-clock completion still unlocks input.
    const end=setTimeout(()=>{cancelAnimationFrame(raf);setFrame(previous=>previous?{...previous,elapsed:settings.settleEndMs}:null);},settings.settleEndMs-frame.elapsed);
    return()=>{cancelAnimationFrame(raf);clearTimeout(end);document.removeEventListener('visibilitychange',resume);};
  },[frame?.snapshot.id,!!frame&&frame.elapsed>=settings.settleEndMs]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>{if(frame&&frame.elapsed>=settings.settleEndMs)setDrawerOpen(true);},[frame?.snapshot.id,!!frame&&frame.elapsed>=settings.settleEndMs]); // eslint-disable-line react-hooks/exhaustive-deps
  const [reduced,setReduced]=useState(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(()=>{const media=window.matchMedia('(prefers-reduced-motion: reduce)'),change=()=>setReduced(media.matches);media.addEventListener('change',change);return()=>media.removeEventListener('change',change);},[]);
  // Mark a newly received snapshot active on its first render. Board feedback must
  // queue before the effect starts RAF, rather than expire during the animation.
  const visibleFrame=snapshot&&snapshot.id!==seen.current?{snapshot,elapsed:-uiMotion.ready}:frame;
  return {frame:visibleFrame,active:!!visibleFrame&&visibleFrame.elapsed<settings.settleEndMs,result:visibleFrame?.snapshot??snapshot,drawerOpen,sliding:!!visibleFrame&&!reduced&&visibleFrame.elapsed>=settings.arrowsEndMs&&visibleFrame.elapsed<settings.slideEndMs&&visibleFrame.snapshot.orders.some(o=>o.type==='move'||o.type==='bicycle-move'),reduced,
    skip:()=>{setFrame(f=>f?{...f,elapsed:settings.settleEndMs}:null);setDrawerOpen(true);},close:()=>{setDrawerOpen(false);setFrame(null);},open:()=>setDrawerOpen(true)};
}
export type Presentation=ReturnType<typeof usePresentation>;
/** Presentation interpolation only; success, failure and final positions come from the core snapshot. */
export function moveFraction(progress:number,success:boolean){const t=Math.max(0,Math.min(1,progress));return success?t:.4*(t<.5?t*2:(1-t)*2);}
export function presentationPosition(snapshot:ResolutionPresentation,unitId:string,elapsed:number,point:(id:string)=>number[]|null,reduced=false):number[]|null {
  const unit=snapshot.before.find(u=>u.unitId===unitId);if(!unit)return null;
  const origin=point(unit.regionId),order=snapshot.orders.find(o=>o.unitId===unitId);if(!origin)return null;
  if(reduced||elapsed>=settings.slideEndMs){const final=snapshot.after.find(u=>u.unitId===unitId);return final?point(final.regionId):point(snapshot.movement.dislodgedUnits.find(d=>d.unit.unitId===unitId)?.unit.regionId??unit.regionId);}
  const progress=Math.max(0,(elapsed-settings.arrowsEndMs)/(settings.slideEndMs-settings.arrowsEndMs));
  const interpolate=(from:number[],to:number[]|null,t:number)=>to?from.map((v,i)=>v+(to[i]-v)*t):from;
  if(order?.type==='move')return interpolate(origin,point(order.destination),moveFraction(progress,snapshot.movement.orderResults.find(r=>r.order.unitId===unitId)?.status==='success'));
  if(order?.type==='bicycle-move'){
    const result=snapshot.movement.equipmentResults.find(r=>r.unitId===unitId),via=point(order.viaRegionId);
    if(progress<.5||result?.firstLeg?.status!=='success')return interpolate(origin,via,moveFraction(Math.min(1,progress*2),result?.firstLeg?.status==='success'));
    return via?interpolate(via,point(order.destination),moveFraction((progress-.5)*2,result.secondLeg?.status==='success')):origin;
  }
  return origin;
}
export function PresentationControls({presentation:p,onSkip,children}:{presentation:Presentation;onSkip:()=>void;children?:ReactNode}){
  if(p.active&&p.frame)return <section className="presentation-controls" aria-label="裁定演出" data-presentation-stage={p.frame.elapsed<0?'ready':p.frame.elapsed<settings.arrowsEndMs?'arrows':p.frame.elapsed<settings.slideEndMs?'slide':p.frame.elapsed<settings.impactEndMs?'impact':'settle'}><strong>{p.frame.elapsed<0?'全員確定 · 裁定を表示します':'同時命令を解決中'}</strong><button onClick={()=>{p.skip();onSkip();}}>スキップ</button></section>;
  if(!p.result)return null;
  if(!p.drawerOpen)return <button className="previous-result-chip" aria-expanded={false} aria-controls="previous-result-content" onClick={p.open}>前回の行軍結果</button>;
  const movement=p.result.movement;
  return <section className="previous-result-drawer presentation-controls" aria-label="裁定演出" data-testid="previous-result-drawer" data-presentation-stage="summary">
    <div className="previous-result-heading"><strong>前回の行軍結果</strong><span>移動成功 {movement.orderResults.filter(r=>r.order.type==='move'&&r.status==='success').length} · スタンドオフ {movement.standoffRegions.length} · 排除 {movement.dislodgedUnits.length}</span><button aria-expanded={true} aria-controls="previous-result-content" onClick={p.close}>結果を閉じる</button></div>
    <div id="previous-result-content" className="previous-result-content">{children??<ul>{movement.orderResults.map(r=><li key={r.order.unitId}>{r.order.type==='move'?'移動':r.order.type==='hold'?'待機':'支援'} · {r.status==='success'?'成功':'不成立'}</li>)}</ul>}</div>
  </section>;
}
