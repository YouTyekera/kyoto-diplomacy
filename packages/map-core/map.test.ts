import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { featureCollection, feature, area } from '@turf/turf';
import { createConfig, configSchema, datasetSchema, mapDefinitionSchema, stableRegionId, parseObstacleGeoJSON, WARDS,
  type AreaGeometry, type RegionDataset, type MapDefinition } from '../shared/model';
import { parseKml } from '../map-tools/kml';
import { sampleDataset, sampleObstacle } from './sample';
import { applyOverrides, generateAdjacency, pairKey, toggleOverride } from './adjacency';
import { subtractObstacles } from './geometry';
import { compileMap } from './compile';
import { validateMap, geometryIsValid } from './validation';

const root = resolve(import.meta.dirname, '../..');
function square(x: number, y: number, size = 0.01): AreaGeometry {
  return { type: 'Polygon', coordinates: [[[x, y], [x + size, y], [x + size, y + size], [x, y + size], [x, y]]] };
}
const options = { toleranceMeters: 0, minSharedBoundaryMeters: 5 };
const enabled = (regionId: string, geometry: AreaGeometry) => ({ regionId, enabled: true, geometry });
function allEnabled(dataset: RegionDataset) {
  const config = createConfig(dataset);
  for (const setting of Object.values(config.regions)) setting.enabled = true;
  return config;
}
const fixture = readFileSync(resolve(import.meta.dirname, 'fixtures/official-format.kml'), 'utf8');
describe('KMLと安定ID', () => {
  it('行政区と番号から決定的なIDを作る。名前・ゼロ埋めに依存しない', () => {
    expect(stableRegionId('26101', '1')).toBe('kyoto-26101-01');
    expect(stableRegionId('26101', '01')).toBe(stableRegionId('26101', '1'));
    expect(stableRegionId('26102', '01')).not.toBe(stableRegionId('26101', '01'));
    expect(() => stableRegionId('26101', 'foo')).toThrow();
  });
  it('実際の00670 Document構造から番号・名称・識別情報・穴を変換する', () => {
    const converted = parseKml(fixture, 'fixture.kml', 'test-hash');
    expect(converted).toMatchObject({ name: '架空地域', wardId: '26101', sourceAreaNumber: '01',
      regionId: 'kyoto-26101-01', source: { file: 'fixture.kml', sha256: 'test-hash', datasetId: '00670' } });
    expect(converted.source.placemarks[0].id).toBe('fixture.1');
    expect(converted.geometry.coordinates).toHaveLength(2);
    expect(converted.geometry.coordinates[0][0]).toHaveLength(2);
    expect(fixture).toContain(',100');
  });
  it('隣り合う複数Placemarkを統合し、分離部分をMultiPolygonで保持する', () => {
    const kml = '<kml><Document><name>14_12テストdisv4326</name>' +
      [square(135.5, 35, 0.125), square(135.625, 35, 0.125), square(135.875, 35, 0.125)].map((g, i) =>
        `<Placemark id="p${i}"><MultiGeometry><Polygon><outerBoundaryIs><LinearRing><coordinates>${g.coordinates[0].map(p => p.join(',')).join(' ')}</coordinates></LinearRing></outerBoundaryIs></Polygon></MultiGeometry></Placemark>`).join('') + '</Document></kml>';
    const converted = parseKml(kml, 'multi.kml');
    expect(converted.geometry.type).toBe('MultiPolygon');
    expect(converted.geometry.coordinates).toHaveLength(2);
    expect(converted.source.placemarks).toHaveLength(3);
  });
  it('不正なXML・座標・行政区全体KML・旧形式を明示的に拒否する', () => {
    expect(() => parseKml('<kml>', 'bad')).toThrow();
    expect(() => parseKml(fixture.replace('135.74,35.04,100', 'foo,35.04,100'), 'bad')).toThrow();
    expect(() => parseKml('<kml><Document><name>北区</name></Document></kml>', 'ward.kml')).toThrow();
    expect(() => parseKml(fixture.replace('disv4326', ''), 'old.kml')).toThrow('00670');
  });
});
describe('自動隣接とoverride', () => {
  it('点接触は隣接にしない', () => {
    const { graph } = generateAdjacency([enabled('a', square(135.74, 35.04)), enabled('b', square(135.75, 35.05))], options);
    expect(graph).toEqual({ a: [], b: [] });
  });
  it('共有辺を隣接とし、対称かつ入力順によらない', () => {
    const regions = [enabled('a', square(135.74, 35.04)), enabled('b', square(135.75, 35.04))];
    const result = generateAdjacency(regions, options);
    expect(result.graph).toEqual({ a: ['b'], b: ['a'] });
    expect(generateAdjacency([...regions].reverse(), options)).toEqual(result);
    expect(result.sharedBoundaryMeters[pairKey('a', 'b')]).toBeGreaterThan(1100);
  });
  it('辺の分割数が違っても正しい長さを測り、閾値を適用する', () => {
    const b = square(135.75, 35.04);
    if (b.type === 'Polygon') b.coordinates[0].splice(4, 0, [135.75, 35.045]);
    const regions = [enabled('a', square(135.74, 35.04)), enabled('b', b)];
    const length = generateAdjacency(regions, options).sharedBoundaryMeters[pairKey('a', 'b')];
    expect(length).toBeGreaterThan(1100); expect(length).toBeLessThan(1120);
    expect(generateAdjacency(regions, { ...options, minSharedBoundaryMeters: 1200 }).graph.a).toEqual([]);
  });
  it('許容距離で微小な座標差を扱い、離れた境界はつながない', () => {
    const regions = [enabled('a', square(135.74, 35.04)), enabled('b', square(135.750004, 35.04))];
    expect(generateAdjacency(regions, options).graph.a).toEqual([]);
    expect(generateAdjacency(regions, { ...options, toleranceMeters: 0.5 }).graph.a).toEqual(['b']);
    expect(generateAdjacency(regions, { ...options, toleranceMeters: 0.1 }).graph.a).toEqual([]);
  });
  it('MultiPolygonの全外周と穴の境界を扱う', () => {
    const first = square(135.7, 35), second = square(135.74, 35.04);
    const geometry: AreaGeometry = { type: 'MultiPolygon', coordinates: [first.coordinates as number[][][], second.coordinates as number[][][]] };
    expect(generateAdjacency([enabled('a', geometry), enabled('b', square(135.75, 35.04))], options).graph.a).toEqual(['b']);
    const withHole = parseKml(fixture, 'hole').geometry;
    expect(generateAdjacency([enabled('a', withHole), enabled('b', square(135.742, 35.042, 0.002))], options).graph.a).toEqual(['b']);
  });
  it('除外地域はグラフに含めず、overrideでも復活させない', () => {
    const { graph } = generateAdjacency([enabled('a', square(135.74, 35.04)), { ...enabled('b', square(135.75, 35.04)), enabled: false }], options);
    expect(applyOverrides(graph, [['a', 'b']], [])).toEqual({ a: [] });
  });
  it('adjacencyAddとadjacencyRemoveを対称に適用する', () => {
    expect(applyOverrides({ a: [], b: [] }, [['a', 'b']], [])).toEqual({ a: ['b'], b: ['a'] });
    expect(applyOverrides({ a: ['b'], b: ['a'] }, [], [['b', 'a']])).toEqual({ a: [], b: [] });
  });
  it('クリック切替は自動隣接との差分だけ保存し、元に戻せる', () => {
    const config = allEnabled(sampleDataset), result = compileMap(sampleDataset, config);
    const changed = toggleOverride(config, result.baseAdjacency, result.map.adjacency, 'sample-a', 'sample-b');
    expect(changed.adjacencyRemove).toEqual([['sample-a', 'sample-b']]);
    const back = toggleOverride(changed, result.baseAdjacency, applyOverrides(result.baseAdjacency, changed.adjacencyAdd, changed.adjacencyRemove), 'sample-a', 'sample-b');
    expect(back.adjacencyRemove).toEqual([]);
  });
});
describe('障害物と検証', () => {
  it('交差を検出し、差し引いても原本を変更しない', () => {
    const original = square(135.74, 35.04), copy = structuredClone(original);
    const cut = subtractObstacles(original, [sampleObstacle]);
    expect(cut.intersections).toEqual(['sample-stripe']);
    expect(cut.geometry?.type).toBe('MultiPolygon'); expect(cut.disconnected).toBe(true);
    expect(area(feature(cut.geometry!))).toBeLessThan(area(feature(original)));
    expect(original).toEqual(copy);
  });
  it('障害物がない・触れるだけ・元から複数部分なら分断を誤報しない', () => {
    expect(subtractObstacles(square(135.74, 35.04), []).disconnected).toBe(false);
    expect(subtractObstacles(square(135.8, 35.08), [sampleObstacle]).intersections).toEqual([]);
    const touching = { ...sampleObstacle, geometry: square(135.75, 35.04) };
    expect(subtractObstacles(square(135.74, 35.04), [touching]).intersections).toEqual([]);
  });
  it('分断・完全消失を警告し、差し引き後の形状から隣接を作る', () => {
    const config = allEnabled(sampleDataset); config.obstacles = [sampleObstacle];
    const result = compileMap(sampleDataset, config);
    expect(result.report.issues.some(i => i.code === 'disconnected-geometry')).toBe(true);
    const covering = { ...sampleObstacle, geometry: square(135.73, 35.03, 0.05) };
    config.obstacles = [covering]; const covered = compileMap(sampleDataset, config);
    expect(covered.map.regions.every(r => r.playableGeometry === null)).toBe(true);
    expect(covered.map.adjacency['sample-a']).toEqual([]);
    expect(covered.report.issues.some(i => i.code === 'obstacle-covered-region' && i.severity === 'error')).toBe(true);
    const stripe = { ...sampleObstacle, geometry: { type: 'Polygon' as const, coordinates: [[[135.749, 35.039], [135.751, 35.039], [135.751, 35.051], [135.749, 35.051], [135.749, 35.039]]] } };
    config.obstacles = [stripe];
    expect(compileMap(sampleDataset, config).map.adjacency['sample-a']).not.toContain('sample-b');
  });
  it('重複ID・参照・非対称・除外隣接・初期配置・overrideの問題を検出する', () => {
    const config = allEnabled(sampleDataset); config.regions['sample-b'].enabled = false;
    config.regions['sample-b'].startingUnit = { ownerWardId: '26101', type: 'army' };
    config.adjacencyAdd = [['sample-a', 'sample-a'], ['sample-a', 'missing'], ['sample-a', 'sample-b']];
    config.adjacencyRemove = [['sample-a', 'sample-b']];
    const map = compileMap(sampleDataset, config).map;
    map.regions.push(structuredClone(map.regions[1]));
    map.adjacency['sample-a'] = ['sample-b', 'missing'];
    const codes = validateMap(map, config).issues.map(i => i.code);
    for (const code of ['duplicate-region-id', 'duplicate-starting-unit', 'excluded-starting-unit', 'invalid-reference', 'asymmetric-adjacency', 'excluded-adjacency', 'invalid-override', 'excluded-override']) expect(codes).toContain(code);
  });
  it('連結成分・degree・行政区間接続・区と勢力の各集計を区別する', () => {
    const config = allEnabled(sampleDataset);
    config.regions['sample-a'].isSupplyCenter = true; config.regions['sample-a'].homeWardId = '26102';
    config.regions['sample-a'].startingUnit = { ownerWardId: '26102', type: 'army' };
    const report = compileMap(sampleDataset, config).report;
    expect(report.components).toHaveLength(1); expect(report.degrees['sample-a']).toBe(2);
    expect(report.crossWardPairs).toHaveLength(2);
    expect(report.counts.find(c => c.wardId === '26101')).toMatchObject({ enabled: 2, supplyCenters: 1, homeSupplyCenters: 0, startingUnits: 0, adjacentWards: 1 });
    expect(report.counts.find(c => c.wardId === '26102')).toMatchObject({ homeSupplyCenters: 1, startingUnits: 1 });
    config.regions['sample-b'].enabled = false; config.regions['sample-c'].enabled = false;
    expect(compileMap(sampleDataset, config).report.components).toHaveLength(2);
  });
  it('runtime validationで型・許容値・不正座標・余分なゲーム状態を拒否する', () => {
    const config = allEnabled(sampleDataset);
    expect(configSchema.parse(JSON.parse(JSON.stringify(config)))).toEqual(config);
    expect(() => configSchema.parse({ ...config, adjacency: { ...options, toleranceMeters: -1 } })).toThrow();
    expect(() => configSchema.parse({ ...config, adjacency: { ...options, minSharedBoundaryMeters: 0 } })).toThrow();
    expect(() => configSchema.parse({ ...config, currentOwner: '26101' })).toThrow();
    expect(() => configSchema.parse({ ...config, regions: { 'sample-a': { ...config.regions['sample-a'], startingUnit: [{ ownerWardId: '26101' }, { ownerWardId: '26101' }] } } })).toThrow();
    const bad = structuredClone(sampleDataset); bad.regions[0].geometry.coordinates[0][0] = [200, 35];
    expect(() => datasetSchema.parse(bad)).toThrow();
    expect(parseObstacleGeoJSON(featureCollection([feature(sampleObstacle.geometry, sampleObstacle.properties, { id: sampleObstacle.id })]))).toHaveLength(1);
    expect(() => parseObstacleGeoJSON({ type: 'FeatureCollection', features: [sampleObstacle, sampleObstacle] })).toThrow('重複');
    const map = compileMap(sampleDataset, config).map;
    expect(mapDefinitionSchema.parse(JSON.parse(JSON.stringify(map)))).toEqual(map);
    expect(() => mapDefinitionSchema.parse({ ...map, currentUnits: [] })).toThrow();
  });
  it('自己交差する形状を拒否する', () => {
    const bow: AreaGeometry = { type: 'Polygon', coordinates: [[[135.7, 35], [135.8, 35.1], [135.8, 35], [135.7, 35.1], [135.7, 35]]] };
    expect(geometryIsValid(bow)).toBe(false);
  });
});
describe('公式00670実データ', () => {
  const source = resolve(root, 'data/source/kyoto-2020-wgs84');
  it.skipIf(!existsSync(resolve(source, 'manifest.json')))('全227件の番号・行政区・名称と原本ハッシュを確認する', () => {
    const manifest = JSON.parse(readFileSync(resolve(source, 'manifest.json'), 'utf8')) as { resources: { title: string; file: string }[] };
    const generated = datasetSchema.parse(JSON.parse(readFileSync(resolve(root, 'data/generated/regions.json'), 'utf8')));
    expect(generated.regions).toHaveLength(227);
    expect(readdirSync(source).filter(f => f.endsWith('.kml'))).toHaveLength(227);
    const seen = new Set<string>();
    for (const resource of manifest.resources) {
      const original = readFileSync(resolve(source, resource.file));
      const hash = createHash('sha256').update(original).digest('hex');
      const region = parseKml(original.toString('utf8'), resource.file, hash);
      const match = resource.title.match(/(.+区)\s*第(\d+)国勢統計区\s*(.+)/)!;
      expect(WARDS.find(w => w.id === region.wardId)!.name).toBe(match[1]);
      expect(Number(region.sourceAreaNumber)).toBe(Number(match[2])); expect(region.name).toBe(match[3]);
      expect(generated.regions.find(r => r.regionId === region.regionId)?.source.sha256).toBe(hash);
      expect(seen.has(region.regionId)).toBe(false); seen.add(region.regionId);
    }
  }, 60000);
  it.skipIf(!existsSync(resolve(root, 'data/generated/regions.json')))('全地域を検証用に採用した場合も、エラーなしで対称な隣接を生成する', () => {
    const dataset = datasetSchema.parse(JSON.parse(readFileSync(resolve(root, 'data/generated/regions.json'), 'utf8')));
    const result = compileMap(dataset, allEnabled(dataset));
    expect(result.report.issues.filter(i => i.severity === 'error')).toEqual([]);
    expect(Object.values(result.map.adjacency).flat().length).toBeGreaterThan(500);
    for (const [id, neighbors] of Object.entries(result.map.adjacency)) for (const neighbor of neighbors) expect(result.map.adjacency[neighbor]).toContain(id);
    const serialized: MapDefinition = mapDefinitionSchema.parse(JSON.parse(JSON.stringify(result.map)));
    expect(serialized.regions).toHaveLength(227);
  }, 60000);
});
