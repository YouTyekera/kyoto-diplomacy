import { useEffect, useRef, useState } from 'react';
import type { GameStatePreview } from '../../../packages/shared/preview';
import type { Unit } from '../../../packages/rules-core';
import type { GroundEquipment } from '../../../packages/shared/events';
import type { WinterResult } from '../../../packages/game-core/model';
import { uiMotion } from './ui-motion';
import type { Presentation } from './AdjudicationPresentation';
import type { SfxManager } from './audio/sfx-manager';

export interface BoardFeedback {
  key: number; captured: string[]; built: string[]; removed: Unit[];
  pickups: string[]; ownSC: number; rival: boolean; inventory: boolean;
}
const empty: BoardFeedback = { key: 0, captured: [], built: [], removed: [], pickups: [], ownSC: 0, rival: false, inventory: false };
const noGroundEquipment: GroundEquipment[] = [];
export function pickupRegions(before: GroundEquipment[], after: GroundEquipment[], units: Unit[], ownWard?: string | null) {
  const remaining = new Set(after.map(e => e.equipmentId));
  return before.filter(e => !remaining.has(e.equipmentId) && units.some(u => u.regionId === e.regionId && (!ownWard || u.ownerWardId === ownWard))).map(e => e.regionId);
}
export function winterUnitFeedback(before: Unit[], after: Unit[], winter?: WinterResult | null) {
  return {
    built: after.filter(u => !before.some(v => v.unitId === u.unitId) && winter?.builtUnits.some(v => v.unitId === u.unitId)).map(u => u.unitId),
    removed: before.filter(u => !after.some(v => v.unitId === u.unitId) && winter?.disbandedUnitIds.includes(u.unitId)),
  };
}
/** Diffs authoritative public state only. No gameplay state is changed by this hook. */
export function useBoardFeedback(board: GameStatePreview | undefined, inventoryCount = 0, rivalCount = 0, ownWard?: string | null, animating = false, groundEquipment = noGroundEquipment, winter?: WinterResult | null) {
  const previous = useRef({ board, inventoryCount, rivalCount, groundEquipment }), queued = useRef<BoardFeedback>(empty), serial = useRef(0);
  const [feedback, setFeedback] = useState(empty);
  useEffect(() => {
    const old = previous.current;
    if (board && old.board && board !== old.board) {
      const captured = Object.entries(board.regionControl).filter(([id, c]) => c.supplyCenterOwnerWardId && c.supplyCenterOwnerWardId !== old.board!.regionControl[id]?.supplyCenterOwnerWardId).map(([id]) => id);
      const ownSC = ownWard ? Object.values(board.regionControl).filter(c => c.supplyCenterOwnerWardId === ownWard).length - Object.values(old.board.regionControl).filter(c => c.supplyCenterOwnerWardId === ownWard).length : 0;
      const {built,removed} = winterUnitFeedback(old.board.units,board.units,winter);
      queued.current = { ...queued.current, captured: [...new Set([...queued.current.captured, ...captured])], built: [...new Set([...queued.current.built, ...built])], removed: [...queued.current.removed, ...removed], ownSC: queued.current.ownSC + Math.max(0, ownSC) };
    }
    queued.current.rival ||= rivalCount > old.rivalCount;
    queued.current.inventory ||= inventoryCount > old.inventoryCount;
    if (board) queued.current.pickups = [...new Set([...queued.current.pickups, ...pickupRegions(old.groundEquipment, groundEquipment, board.units, ownWard)])];
    previous.current = { board, inventoryCount, rivalCount, groundEquipment };
    if (animating) return;
    const next = queued.current;
    if (!next.captured.length && !next.built.length && !next.removed.length && !next.pickups.length && !next.rival && !next.inventory) return;
    queued.current = { ...empty };
    setFeedback({ ...next, key: ++serial.current });
  }, [board, inventoryCount, rivalCount, ownWard, animating, groundEquipment, winter]);
  useEffect(() => { if (!feedback.key) return; const timer = setTimeout(() => setFeedback(empty), uiMotion.feedback); return () => clearTimeout(timer); }, [feedback.key]);
  return feedback;
}
export function PhaseTransition({ phaseKey, year, season, phase }: { phaseKey: string; year: number; season: string; phase: string }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => { setVisible(true); const timer = setTimeout(() => setVisible(false), uiMotion.phase); return () => clearTimeout(timer); }, [phaseKey]);
  const label = phase === 'orders' ? '命令' : phase === 'retreats' ? '撤退' : phase === 'adjustments' ? '軍備調整' : phase === 'finished' ? '対局終了' : '盤面確認';
  return visible ? <div key={phaseKey} className="phase-transition" role="status">第{year}年 {season === 'spring' ? '春' : season === 'autumn' ? '秋' : '冬'} — {label}</div> : null;
}
export function useResultCues(presentation:Presentation,sfx:SfxManager){
  const seen=useRef(presentation.result?.id);
  useEffect(()=>{
    if(presentation.active||!presentation.result||presentation.result.id===seen.current)return;
    seen.current=presentation.result.id;
    if(presentation.result.movement.orderResults.some(r=>(r.order.type==='support-hold'||r.order.type==='support-move')&&r.status==='success'))sfx.playCue('support-success');
    if(presentation.result.movement.standoffRegions.length)sfx.playCue('standoff');
  },[presentation.active,presentation.frame,presentation.result,sfx]);
}
