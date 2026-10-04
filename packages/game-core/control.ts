import type { MapDefinition, WardId } from '../shared/model';
import type { GameStatePreview } from '../shared/preview';
import type { AdjudicationResult } from '../rules-core';
import type { SCChange } from './model';

/** Only successful movement captures; departure and retreat never erase control. */
export function applyMovementControl(board:GameStatePreview, movement:AdjudicationResult):GameStatePreview {
  const regionControl=structuredClone(board.regionControl);
  for(const outcome of movement.orderResults) if(outcome.order.type==='move'&&outcome.status==='success') {
    const unit=board.units.find(u=>u.unitId===outcome.order.unitId)!;
    regionControl[outcome.order.destination].controllerWardId=unit.ownerWardId;
  }
  return {regionControl,units:movement.units.map(u=>({...u}))};
}
export function updateSupplyCenters(map:MapDefinition, board:GameStatePreview):{board:GameStatePreview;changes:SCChange[]} {
  const next=structuredClone(board),changes:SCChange[]=[];
  for(const region of map.regions) if(region.enabled&&region.playableGeometry&&region.isSupplyCenter) {
    const control=next.regionControl[region.regionId],previous=control.supplyCenterOwnerWardId;
    control.supplyCenterOwnerWardId=control.controllerWardId;
    if(previous!==control.supplyCenterOwnerWardId) changes.push({regionId:region.regionId,previous,owner:control.supplyCenterOwnerWardId});
  }
  return {board:next,changes};
}
export function factionCounts(map:MapDefinition, board:GameStatePreview, wardId:WardId) {
  const regions=map.regions.filter(r=>r.enabled&&r.playableGeometry);
  return {
    supplyCenters:regions.filter(r=>r.isSupplyCenter&&board.regionControl[r.regionId]?.supplyCenterOwnerWardId===wardId).length,
    units:board.units.filter(u=>u.ownerWardId===wardId).length,
    nonSCRegions:regions.filter(r=>!r.isSupplyCenter&&board.regionControl[r.regionId]?.controllerWardId===wardId).length,
  };
}
