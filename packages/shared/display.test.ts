import { describe, expect, it } from 'vitest';
import { WARDS } from './model';
import { regionFill, wardColor } from './display';
import { createPreview } from './preview';
import { compileMap } from '../map-core/compile';
import { sampleDataset, sampleConfig } from '../map-core/sample';

describe('Phase 3B 地域fill', () => {
  it('全11controllerで隣接SC/非SCを同色にし、元区・SC所有者・軍に依存しない', () => {
    const config = structuredClone(sampleConfig);
    config.regions['sample-a'].isSupplyCenter = true;
    config.regions['sample-a'].homeWardId = '26102';
    config.regions['sample-a'].startingUnit = { ownerWardId: '26103', type: 'army' };
    const map = compileMap(sampleDataset, config).map, state = createPreview(map);
    const sc = map.regions.find(r => r.regionId === 'sample-a')!;
    const normal = map.regions.find(r => r.regionId === 'sample-b')!;
    expect(map.adjacency[sc.regionId]).toContain(normal.regionId);
    for (const ward of WARDS) {
      state.regionControl[sc.regionId].controllerWardId = ward.id;
      state.regionControl[normal.regionId].controllerWardId = ward.id;
      expect(regionFill(sc, state)).toBe(wardColor(ward.id));
      expect(regionFill(normal, state)).toBe(regionFill(sc, state));
      expect(regionFill({ ...normal, wardId: '26109' }, state)).toBe(regionFill(sc, state));
    }
  });
  it('中立/未支配のSCも通常地域と同じneutral fill', () => {
    const map = compileMap(sampleDataset, sampleConfig).map, state = createPreview(map);
    const region = map.regions[0];
    state.regionControl[region.regionId].controllerWardId = null;
    expect(regionFill(region, state)).toBe('#e5e8e4');
    expect(regionFill({ ...region, isSupplyCenter: true }, state)).toBe('#e5e8e4');
    delete state.regionControl[region.regionId];
    expect(regionFill(region, state)).toBe('#e5e8e4');
  });
  it('静的編集の元区色と未採用灰色を維持する', () => {
    const region = compileMap(sampleDataset, sampleConfig).map.regions[0];
    expect(regionFill(region)).toBe(wardColor(region.wardId));
    expect(regionFill({ ...region, enabled: false })).toBe('#e1e4e0');
  });
});
