import { z } from 'zod';
import { wardSchema, type MapDefinition, type WardId } from './model';

export const regionControlSchema = z.object({
  regionId: z.string().min(1),
  controllerWardId: wardSchema.nullable(),
  supplyCenterOwnerWardId: wardSchema.nullable(),
}).strict();
export const previewUnitSchema = z.object({
  unitId: z.string().min(1), ownerWardId: wardSchema,
  regionId: z.string().min(1), type: z.literal('army'),
}).strict();
export const gameStatePreviewSchema = z.object({
  regionControl: z.record(z.string(), regionControlSchema),
  units: z.array(previewUnitSchema),
}).strict().superRefine((state, ctx) => {
  for (const [id, control] of Object.entries(state.regionControl)) if (id !== control.regionId)
    ctx.addIssue({ code: 'custom', path: ['regionControl', id], message: 'regionControlのキーとregionIdが一致しません' });
  const ids = new Set<string>(), occupied = new Set<string>();
  for (const [i, unit] of state.units.entries()) {
    if (ids.has(unit.unitId)) ctx.addIssue({ code: 'custom', path: ['units', i], message: 'unitIdが重複しています' });
    if (occupied.has(unit.regionId)) ctx.addIssue({ code: 'custom', path: ['units', i], message: '同じ地域に複数のユニットがあります' });
    if (!state.regionControl[unit.regionId]) ctx.addIssue({ code: 'custom', path: ['units', i], message: 'ユニットの地域参照がありません' });
    ids.add(unit.unitId); occupied.add(unit.regionId);
  }
});
export type RegionControl = z.infer<typeof regionControlSchema>;
export type PreviewUnit = z.infer<typeof previewUnitSchema>;
export type GameStatePreview = z.infer<typeof gameStatePreviewSchema>;

export function canPreviewRegion(region: MapDefinition['regions'][number]): boolean {
  return region.enabled && region.playableGeometry !== null;
}
/** Display test initialization only. No RNG, capture, winter, victory or elimination rules. */
export function createPreview(map: MapDefinition): GameStatePreview {
  const regions = map.regions.filter(canPreviewRegion);
  return { regionControl: Object.fromEntries(regions.map(r => [r.regionId, {
    regionId: r.regionId, controllerWardId: r.wardId,
    supplyCenterOwnerWardId: r.isSupplyCenter ? r.homeWardId ?? null : null,
  }])), units: regions.filter(r => r.startingUnit).map(r => ({ unitId: `preview-${r.regionId}`,
    regionId: r.regionId, ownerWardId: r.startingUnit!.ownerWardId, type: 'army' })) };
}
export function validatePreview(state: GameStatePreview, map: MapDefinition): string[] {
  const issues: string[] = [];
  const allowed = new Map(map.regions.filter(canPreviewRegion).map(r => [r.regionId, r]));
  for (const control of Object.values(state.regionControl)) {
    const region = allowed.get(control.regionId);
    if (!region) issues.push(`${control.regionId}: 存在しない・除外・侵入不能の地域です`);
    else if (!region.isSupplyCenter && control.supplyCenterOwnerWardId !== null)
      issues.push(`${region.name}: 補給拠点でない地域には補給所有者を設定できません`);
  }
  for (const id of allowed.keys()) if (!state.regionControl[id]) issues.push(`${id}: 支配情報がありません`);
  for (const unit of state.units) if (!allowed.has(unit.regionId)) issues.push(`${unit.unitId}: 配置先が侵入不能または除外地域です`);
  return issues;
}
/** Retain preview edits after map editing, removing only now-ineligible references. */
export function reconcilePreview(state: GameStatePreview, map: MapDefinition): GameStatePreview {
  const initial = createPreview(map), allowed = new Map(map.regions.filter(canPreviewRegion).map(r => [r.regionId, r]));
  return { regionControl: Object.fromEntries(Object.entries(initial.regionControl).map(([id, control]) => [id, {
    ...(state.regionControl[id] ?? control),
    supplyCenterOwnerWardId: allowed.get(id)!.isSupplyCenter ? (state.regionControl[id] ? state.regionControl[id].supplyCenterOwnerWardId : control.supplyCenterOwnerWardId) : null,
  }])), units: state.units.filter(u => allowed.has(u.regionId)) };
}
export function setPreviewUnit(state: GameStatePreview, regionId: string, ownerWardId: WardId | null): GameStatePreview {
  const units = state.units.filter(u => u.regionId !== regionId);
  const old = state.units.find(u => u.regionId === regionId);
  if (ownerWardId) units.push({ unitId: old?.unitId ?? `preview-${regionId}`, ownerWardId, regionId, type: 'army' });
  return { ...state, units };
}
