import { WARDS, type MapRegion } from './model';
import type { GameStatePreview } from './preview';

export function wardColor(wardId: string | null | undefined): string {
  return WARDS.find(w => w.id === wardId)?.color ?? '#aab3ad';
}
export function regionFill(region: Pick<MapRegion, 'regionId' | 'wardId' | 'enabled' | 'isSupplyCenter'>,
  preview?: GameStatePreview): string {
  if (!region.enabled) return '#e1e4e0';
  if (!preview) return wardColor(region.wardId);
  const controller = preview.regionControl[region.regionId]?.controllerWardId;
  if (!controller) return '#e5e8e4';
  return wardColor(controller);
}
