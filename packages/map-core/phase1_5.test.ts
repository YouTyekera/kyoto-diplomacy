import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { area, centroid, feature, booleanPointInPolygon } from '@turf/turf';
import { configSchema, createConfig, datasetSchema, mapDefinitionSchema, parseObstacleGeoJSON, type AreaGeometry } from '../shared/model';
import { createPreview, gameStatePreviewSchema, reconcilePreview, setPreviewUnit, validatePreview } from '../shared/preview';
import { regionFill, wardColor } from '../shared/display';
import { calculateDisplayAnchor, anchorIsInside } from './anchors';
import { compileMap } from './compile';
import { sampleDataset, sampleConfig, sampleObstacle } from './sample';
import { layoutMarkers, markerPixels } from '../../apps/web/src/marker-layout';

const root = resolve(import.meta.dirname, '../..');
const readJson = (path: string) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const square = (x: number, y: number, size: number): AreaGeometry => ({ type: 'Polygon',
  coordinates: [[[x,y],[x+size,y],[x+size,y+size],[x,y+size],[x,y]]] });
describe('Phase 1.5 表示アンカー', () => {
  it('centroidが外に出る凹型でも内部点を返す', () => {
    const geometry: AreaGeometry = { type: 'Polygon', coordinates: [[[135,35],[135.01,35],[135.01,35.002],
      [135.002,35.002],[135.002,35.01],[135,35.01],[135,35]]] };
    expect(booleanPointInPolygon(centroid(feature(geometry)), geometry)).toBe(false);
    expect(anchorIsInside(geometry, calculateDisplayAnchor(geometry)!)).toBe(true);
  });
  it('穴・境界を避け、細長い小領域とnullを扱う', () => {
    const outer = square(135,35,0.01), hole = square(135.002,35.002,0.006);
    const geometry: AreaGeometry = { type: 'Polygon', coordinates: [outer.coordinates[0] as number[][], hole.coordinates[0] as number[][]] };
    expect(anchorIsInside(geometry, calculateDisplayAnchor(geometry)!)).toBe(true);
    expect(anchorIsInside(geometry, [135.005,35.005])).toBe(false);
    expect(anchorIsInside(geometry, [135,35])).toBe(false);
    const tiny = square(135,35,0.0000001);
    expect(anchorIsInside(tiny, calculateDisplayAnchor(tiny)!)).toBe(true);
    expect(calculateDisplayAnchor(null)).toBeNull();
  });
  it('MultiPolygonの最大部分を選び、同面積でも入力順に依存しない', () => {
    const small = square(135,35,0.001), large = square(135.01,35,0.01);
    const multi: AreaGeometry = { type: 'MultiPolygon', coordinates: [small.coordinates as number[][][], large.coordinates as number[][][]] };
    expect(anchorIsInside(large, calculateDisplayAnchor(multi)!)).toBe(true);
    const same = square(135.02,35,0.01);
    multi.coordinates = [large.coordinates as number[][][], same.coordinates as number[][][]];
    const anchor = calculateDisplayAnchor(multi);
    multi.coordinates.reverse();
    expect(calculateDisplayAnchor(multi)).toEqual(anchor);
  });
  it('overrideを保存・再読込でき、外・境界・障害物内の指定を拒否する', () => {
    const config = structuredClone(sampleConfig);
    config.regions['sample-a'].displayAnchorOverride = [135.742,35.042];
    const restored = configSchema.parse(JSON.parse(JSON.stringify(config)));
    expect(compileMap(sampleDataset, restored).map.regions[0].displayAnchor).toEqual([135.742,35.042]);
    for (const point of [[135.8,35.08],[135.74,35.04],[135.745,35.045]] as [number,number][]) {
      config.regions['sample-a'].displayAnchorOverride = point; config.obstacles = [sampleObstacle];
      const result = compileMap(sampleDataset, config);
      expect(result.report.issues.map(i => i.code)).toContain('invalid-display-anchor');
      expect(anchorIsInside(result.map.regions[0].playableGeometry, result.map.regions[0].displayAnchor!)).toBe(true);
    }
  });
  it('Phase 2Aでは近接マーカーを押し出さず、順序・ズームによらず所属先を保持する', () => {
    const input = [{regionId:'a',anchor:[0,0],priority:true},{regionId:'b',anchor:[1,1],priority:false}];
    const markers = layoutMarkers(input);
    expect(markers).toEqual(layoutMarkers([...input].reverse()));
    for(const marker of markers) expect([marker.x,marker.y]).toEqual(marker.anchor);
    expect(markerPixels(0.01)).toBe(10);expect(markerPixels(100)).toBe(22);
    expect(markerPixels(1)).toBeLessThan(markerPixels(4));
  });
});
describe('Phase 1.5 Previewと後方互換', () => {
  function mapWithSC() {
    const config = structuredClone(sampleConfig); config.regions['sample-a'].isSupplyCenter = true;
    config.regions['sample-a'].homeWardId = '26102';
    config.regions['sample-a'].startingUnit = {ownerWardId:'26103',type:'army'};
    return compileMap(sampleDataset, config).map;
  }
  it('支配・SC所有・ユニットを別々に初期化し、除外と侵入不能を含めない', () => {
    const map = mapWithSC(); map.regions[1].enabled = false; map.regions[2].playableGeometry = null;
    const state = createPreview(map);
    expect(state.regionControl['sample-a']).toEqual({regionId:'sample-a',controllerWardId:'26101',supplyCenterOwnerWardId:'26102'});
    expect(state.units[0]).toMatchObject({regionId:'sample-a',ownerWardId:'26103'});
    expect(Object.keys(state.regionControl)).toEqual(['sample-a','sample-d']);
    map.regions[0].homeWardId = null;
    expect(createPreview(map).regionControl['sample-a'].supplyCenterOwnerWardId).toBeNull();
  });
  it('runtime validationが無効勢力・参照・重複・不正な型を拒否する', () => {
    const map = mapWithSC(), state = createPreview(map);
    expect(gameStatePreviewSchema.parse(JSON.parse(JSON.stringify(state)))).toEqual(state);
    for (const mutate of [
      (s: typeof state) => { s.units[0].ownerWardId = 'invalid' as never; },
      (s: typeof state) => { s.units.push({...s.units[0]}); },
      (s: typeof state) => { s.units[0].type = 'fleet' as never; },
      (s: typeof state) => { s.units[0].regionId = 'missing'; },
      (s: typeof state) => { s.regionControl['sample-a'].regionId = 'wrong'; },
    ]) { const bad = structuredClone(state); mutate(bad); expect(gameStatePreviewSchema.safeParse(bad).success).toBe(false); }
    const outside = structuredClone(state); outside.regionControl['missing'] = {regionId:'missing',controllerWardId:null,supplyCenterOwnerWardId:null};
    expect(validatePreview(outside, map).length).toBeGreaterThan(0);
    outside.regionControl['sample-b'].supplyCenterOwnerWardId = '26101';
    expect(validatePreview(outside, map).some(i=>i.includes('補給拠点でない'))).toBe(true);
  });
  it('塗りはcontrollerを参照し、元区・home・unit・SC所有者から独立する', () => {
    const map = mapWithSC(), region = map.regions[0], state = createPreview(map);
    state.regionControl[region.regionId].controllerWardId = '26104';
    expect(regionFill(region,state)).toBe(wardColor('26104'));
    expect(regionFill(region)).toBe(wardColor('26101'));
    // Phase 3B supersedes the former SC/non-SC tint distinction.
    expect(regionFill({...region,isSupplyCenter:false},state)).toBe(regionFill(region,state));
    state.regionControl[region.regionId].controllerWardId = null;
    expect(regionFill(region,state)).toBe('#e5e8e4');
  });
  it('Previewを編集しても静的地図に影響せず、中立状態を再計算で上書きしない', () => {
    const map = mapWithSC(), before = structuredClone(map);
    let state = createPreview(map); state.regionControl['sample-a'].controllerWardId = '26104';
    state.regionControl['sample-a'].supplyCenterOwnerWardId = null;
    state = setPreviewUnit(state,'sample-a','26105');
    expect(map).toEqual(before);
    expect(reconcilePreview(state,map)).toEqual(state);
    map.regions[0].enabled = false;
    const pruned = reconcilePreview(state,map);
    expect(pruned.regionControl['sample-a']).toBeUndefined(); expect(pruned.units).toEqual([]);
  });
  it('Phase 1形式の設定とアンカーのないMapDefinitionを引き続き読める', () => {
    const legacy = structuredClone(sampleConfig); legacy.regions['sample-a'].homeWardId = '26102';
    expect(configSchema.parse(JSON.parse(JSON.stringify(legacy)))).toEqual(legacy);
    const map = mapWithSC(); for (const region of map.regions) delete region.displayAnchor;
    expect(mapDefinitionSchema.parse(JSON.parse(JSON.stringify(map)))).toEqual(map);
    const optional = structuredClone(legacy) as unknown as {regions:Record<string,Record<string,unknown>>};
    delete optional.regions['sample-a'].homeWardId;
    expect(configSchema.parse(optional).regions['sample-a'].homeWardId).toBeNull();
    expect(configSchema.parse(readJson('data/maps/kyoto-urban/initial-config.json')).version).toBe(1);
  });
});
describe.skipIf(!existsSync(resolve(root, 'data/generated/regions.json')))('京都御苑のゲーム用境界案', () => {
  const dataset = existsSync(resolve(root, 'data/generated/regions.json')) ? datasetSchema.parse(readJson('data/generated/regions.json')) : sampleDataset;
  const obstacles = parseObstacleGeoJSON(readJson('data/maps/kyoto-urban/kyoto-gyoen-obstacle.geojson'));
  it('滋野南端まで御苑を延長し、京極・原本・同一logical regionを保持する', () => {
    const config = createConfig(dataset); config.obstacles = obstacles;
    for(const id of ['kyoto-26102-13','kyoto-26102-11']) config.regions[id].enabled = true;
    const before = JSON.stringify(dataset), result = compileMap(dataset,config);
    for (const id of ['kyoto-26102-13','kyoto-26102-11']) {
      const region = result.map.regions.find(r=>r.regionId===id)!;
      expect(area(feature(region.playableGeometry!))).toBeLessThan(area(feature(region.geometry)));
      expect(anchorIsInside(region.playableGeometry,region.displayAnchor!)).toBe(true);
      expect(anchorIsInside(obstacles[0].geometry,region.displayAnchor!)).toBe(false);
    }
    const shigeno = result.map.regions.find(r=>r.name==='滋野')!;
    expect(anchorIsInside(shigeno.geometry,[135.760,35.022])).toBe(true);
    expect(anchorIsInside(shigeno.playableGeometry,[135.760,35.022])).toBe(false);
    const southernmost = Math.min(...(shigeno.geometry.type==='Polygon'?shigeno.geometry.coordinates.flat():shigeno.geometry.coordinates.flat(2)).map(p=>p[1]));
    expect(obstacles[0].geometry.coordinates[0][0][1]).toBe(southernmost);
    expect(result.map.regions.filter(r=>r.regionId==='kyoto-26102-13')).toHaveLength(1);
    expect(anchorIsInside(shigeno.geometry,[135.760,35.027])).toBe(true);
    expect(anchorIsInside(shigeno.playableGeometry,[135.760,35.027])).toBe(false);
    expect(JSON.stringify(dataset)).toBe(before);
    expect(result.map.regions.some(r=>r.regionId===obstacles[0].id)).toBe(false);
    expect(Object.keys(result.map.adjacency)).not.toContain(obstacles[0].id);
    expect(Object.keys(createPreview(result.map).regionControl)).not.toContain(obstacles[0].id);
    expect(result.report.issues.filter(i=>i.severity==='error')).toEqual([]);
  });
  it('完全侵入不能の地域はSC・配置がエラーになり、Previewから除外する', () => {
    const config = structuredClone(sampleConfig); config.obstacles = [{...sampleObstacle,geometry:square(135.73,35.03,0.05)}];
    config.regions['sample-a'].isSupplyCenter = true;
    config.regions['sample-a'].startingUnit = {ownerWardId:'26101',type:'army'};
    const result = compileMap(sampleDataset,config);
    expect(result.report.issues.map(i=>i.code)).toEqual(expect.arrayContaining(['supply-center-on-impassable','starting-unit-on-impassable']));
    expect(createPreview(result.map)).toEqual({regionControl:{},units:[]});
  });
  it('公式227地域のアンカーはすべて差し引き後形状内にある', () => {
    const config = createConfig(dataset); config.obstacles = obstacles;
    for(const setting of Object.values(config.regions)) setting.enabled = true;
    const result = compileMap(dataset,config);
    expect(result.map.regions).toHaveLength(227);
    for(const region of result.map.regions) expect(anchorIsInside(region.playableGeometry,region.displayAnchor!)).toBe(true);
    expect(result.report.issues.filter(i=>i.severity==='error')).toEqual([]);
  },60000);
});
