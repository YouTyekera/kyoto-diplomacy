import { booleanValid, kinks, feature } from '@turf/turf';
import type { AdjacencyGraph, MapConfig, MapDefinition, RegionDataset, WardId } from '../shared/model';
import { WARDS } from '../shared/model';
import { geometryParts } from './geometry';
import { pairKey } from './adjacency';

export interface Issue { severity: 'error' | 'warning'; code: string; message: string; regionIds: string[] }
export interface ValidationReport {
  issues: Issue[];
  components: string[][];
  degrees: Record<string, number>;
  counts: { wardId: WardId; enabled: number; supplyCenters: number; homeSupplyCenters: number; startingUnits: number; adjacentWards: number }[];
  crossWardPairs: [string, string][];
}
export function geometryIsValid(geometry: RegionDataset['regions'][number]['geometry']): boolean {
  return booleanValid(feature(geometry)) && geometryParts(geometry).every(coordinates =>
    kinks({ type: 'Polygon', coordinates }).features.length === 0);
}
export function configReferenceIssues(dataset: RegionDataset, config: MapConfig): Issue[] {
  const issues: Issue[] = [];
  const ids = new Set(dataset.regions.map(r => r.regionId));
  const add = (code: string, message: string, regionIds: string[]) => issues.push({ severity: 'error' as const, code, message, regionIds });
  for (const id of Object.keys(config.regions)) if (!ids.has(id)) add('invalid-reference', `設定に存在しない地域: ${id}`, [id]);
  for (const id of ids) if (!config.regions[id]) add('missing-setting', `地域設定がありません: ${id}`, [id]);
  const adds = new Set(config.adjacencyAdd.map(([a, b]) => pairKey(a, b)));
  for (const [label, pairs] of [['追加', config.adjacencyAdd], ['削除', config.adjacencyRemove]] as const) {
    const seen = new Set<string>();
    for (const [a, b] of pairs) {
      const key = pairKey(a, b);
      if (!ids.has(a) || !ids.has(b)) add('invalid-reference', `隣接${label}に存在しない参照`, [a, b]);
      if (a === b || seen.has(key)) add('invalid-override', `自己隣接または重複した隣接${label}`, [a, b]);
      if (!config.regions[a]?.enabled || !config.regions[b]?.enabled) add('excluded-override', `隣接${label}が除外地域を参照しています`, [a, b]);
      if (label === '削除' && adds.has(key)) add('invalid-override', '同じ隣接が追加と削除の両方に指定されています', [a, b]);
      seen.add(key);
    }
  }
  if (new Set(config.obstacles.map(o => o.id)).size !== config.obstacles.length)
    add('duplicate-obstacle-id', '障害物IDが重複しています', []);
  return issues;
}
export function validateMap(map: MapDefinition, config: MapConfig, extraIssues: Issue[] = []): ValidationReport {
  const issues = [...extraIssues, ...configReferenceIssues({ version: 1, kind: 'kyoto-kml', regions: map.regions }, config)];
  const add = (severity: Issue['severity'], code: string, message: string, regionIds: string[]) => issues.push({ severity, code, message, regionIds });
  const byId = new Map(map.regions.map(r => [r.regionId, r]));
  const seen = new Set<string>(), units = new Set<string>();
  for (const region of map.regions) {
    const id = region.regionId;
    if (seen.has(id)) add('error', 'duplicate-region-id', `地域IDが重複: ${id}`, [id]);
    seen.add(id);
    if (region.startingUnit) {
      if (units.has(id)) add('error', 'duplicate-starting-unit', '初期ユニット配置が重複', [id]);
      units.add(id);
      if (!region.enabled) add('error', 'excluded-starting-unit', `${region.name}: 除外地域に初期配置があります`, [id]);
    }
  }
  const degrees: Record<string, number> = {};
  const crossWardPairs: [string, string][] = [];
  const wardNeighbors = new Map<WardId, Set<WardId>>();
  for (const [id, neighbors] of Object.entries(map.adjacency)) {
    const region = byId.get(id);
    if (!region || !region.enabled) add('error', 'excluded-adjacency', `隣接グラフの地域が不正: ${id}`, [id]);
    if (new Set(neighbors).size !== neighbors.length) add('error', 'duplicate-adjacency', '隣接が重複しています', [id]);
    for (const otherId of neighbors) {
      const other = byId.get(otherId);
      if (!other) add('error', 'invalid-reference', `隣接先が存在しません: ${otherId}`, [id, otherId]);
      else if (!other.enabled) add('error', 'excluded-adjacency', '除外地域への隣接', [id, otherId]);
      if (id === otherId) add('error', 'self-adjacency', '自己隣接', [id]);
      if (!(map.adjacency[otherId] ?? []).includes(id)) add('error', 'asymmetric-adjacency', '隣接が非対称です', [id, otherId]);
      if (region && other && region.enabled && other.enabled && region.wardId !== other.wardId) {
        const list = wardNeighbors.get(region.wardId) ?? new Set(); list.add(other.wardId); wardNeighbors.set(region.wardId, list);
        if (id < otherId) crossWardPairs.push([id, otherId]);
      }
    }
  }
  for (const region of map.regions) if (region.enabled) {
    const neighbors = map.adjacency[region.regionId] ?? [];
    degrees[region.regionId] = neighbors.length;
    if (!neighbors.length) add('warning', 'isolated-region', `${region.name}: 孤立地域`, [region.regionId]);
  }
  const components = connectedComponents(map.adjacency, map.regions.filter(r => r.enabled).map(r => r.regionId));
  if (!components.length) add('warning', 'no-enabled-regions', '採用地域がありません。地図の使用範囲は未設定です。', []);
  if (components.length > 1) add('warning', 'disconnected-map', `地図が${components.length}個の連結成分に分かれています`, []);
  const counts = WARDS.map(w => ({ wardId: w.id,
    enabled: map.regions.filter(r => r.enabled && r.wardId === w.id).length,
    supplyCenters: map.regions.filter(r => r.enabled && r.isSupplyCenter && r.wardId === w.id).length,
    homeSupplyCenters: map.regions.filter(r => r.enabled && r.isSupplyCenter && r.homeWardId === w.id).length,
    startingUnits: map.regions.filter(r => r.enabled && r.startingUnit?.ownerWardId === w.id).length,
    adjacentWards: wardNeighbors.get(w.id)?.size ?? 0,
  }));
  return { issues, components, counts, degrees, crossWardPairs: crossWardPairs.sort(([a, b], [c, d]) => a.localeCompare(c) || b.localeCompare(d)) };
}
export function connectedComponents(graph: AdjacencyGraph, ids: string[]): string[][] {
  const allowed = new Set(ids), visited = new Set<string>(), components: string[][] = [];
  for (const id of [...ids].sort()) {
    if (visited.has(id)) continue;
    const component: string[] = [], queue = [id]; visited.add(id);
    for (let i = 0; i < queue.length; i++) {
      const current = queue[i]; component.push(current);
      for (const neighbor of graph[current] ?? []) if (allowed.has(neighbor) && !visited.has(neighbor)) {
        visited.add(neighbor); queue.push(neighbor);
      }
    }
    components.push(component.sort());
  }
  return components;
}
