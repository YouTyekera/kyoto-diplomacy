import type { AdjacencyGraph, AreaGeometry, MapConfig, RegionPair } from '../shared/model';
import { geometryParts, toMeters } from './geometry';

type Point = [number, number];
interface Segment { id: number; regionId: string; a: Point; b: Point; length: number; bounds: number[] }
export function canonicalPair(a: string, b: string): RegionPair { return a < b ? [a, b] : [b, a]; }
export function pairKey(a: string, b: string): string { return JSON.stringify(canonicalPair(a, b)); }
function intervalsOverlap(a: Segment, b: Segment, tolerance: number): [number, number] | null {
  const ax = (a.b[0] - a.a[0]) / a.length, ay = (a.b[1] - a.a[1]) / a.length;
  const bx = (b.b[0] - b.a[0]) / b.length, by = (b.b[1] - b.a[1]) / b.length;
  // Transverse crossings never count as shared boundary, even with tolerance.
  if (Math.abs(ax * by - ay * bx) > 0.01) return null;
  const project = (p: Point) => (p[0] - a.a[0]) * ax + (p[1] - a.a[1]) * ay;
  const t0 = project(b.a), t1 = project(b.b);
  const low = Math.max(0, Math.min(t0, t1)), high = Math.min(a.length, Math.max(t0, t1));
  if (high - low <= 1e-7) return null;
  const distanceAt = (t: number) => {
    const f = (t - t0) / (t1 - t0);
    const x = b.a[0] + f * (b.b[0] - b.a[0]), y = b.a[1] + f * (b.b[1] - b.a[1]);
    return Math.abs((x - a.a[0]) * ay - (y - a.a[1]) * ax);
  };
  if (distanceAt(low) > tolerance + 1e-7 || distanceAt(high) > tolerance + 1e-7) return null;
  return [low, high];
}
function mergedLength(intervals: [number, number][]) {
  intervals.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let total = 0, start = intervals[0][0], end = intervals[0][1];
  for (const [low, high] of intervals.slice(1)) {
    if (low <= end) end = Math.max(end, high);
    else { total += end - start; start = low; end = high; }
  }
  return total + end - start;
}
/** Cell index plus interval unions avoids quadratic scans and double counting fragmented edges. */
export function generateAdjacency(
  regions: { regionId: string; enabled: boolean; geometry: AreaGeometry | null }[],
  options: MapConfig['adjacency'],
): { graph: AdjacencyGraph; sharedBoundaryMeters: Record<string, number> } {
  const graph: AdjacencyGraph = {};
  const segments: Segment[] = [];
  for (const region of [...regions].sort((a, b) => a.regionId.localeCompare(b.regionId))) {
    if (!region.enabled) continue;
    graph[region.regionId] = [];
    if (!region.geometry) continue;
    for (const polygon of geometryParts(region.geometry)) for (const ring of polygon) {
      for (let i = 1; i < ring.length; i++) {
        const a = toMeters(ring[i - 1]), b = toMeters(ring[i]);
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (length <= 1e-7) continue;
        segments.push({ id: segments.length, regionId: region.regionId, a, b, length,
          bounds: [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])] });
      }
    }
  }
  const cellSize = 200, tolerance = options.toleranceMeters;
  const cells = new Map<string, Segment[]>();
  function cellKeys(segment: Segment, padding: number) {
    const [x0, y0, x1, y1] = segment.bounds;
    const keys: string[] = [];
    for (let x = Math.floor((x0 - padding) / cellSize); x <= Math.floor((x1 + padding) / cellSize); x++)
      for (let y = Math.floor((y0 - padding) / cellSize); y <= Math.floor((y1 + padding) / cellSize); y++) keys.push(`${x},${y}`);
    return keys;
  }
  const matches = new Map<string, { pair: RegionPair; intervals: Map<number, [number, number][]> }>();
  for (const a of segments) {
    const candidates = new Map<number, Segment>();
    for (const key of cellKeys(a, tolerance)) for (const b of cells.get(key) ?? []) {
      if (b.regionId !== a.regionId) candidates.set(b.id, b);
    }
    for (const b of candidates.values()) {
      const boundsA = a.bounds, boundsB = b.bounds;
      if (boundsA[0] > boundsB[2] + tolerance || boundsB[0] > boundsA[2] + tolerance ||
        boundsA[1] > boundsB[3] + tolerance || boundsB[1] > boundsA[3] + tolerance) continue;
      // Lower region ID is always the reference, independent of input order.
      const interval = intervalsOverlap(b, a, tolerance);
      if (!interval) continue;
      const key = pairKey(a.regionId, b.regionId);
      const entry = matches.get(key) ?? { pair: canonicalPair(a.regionId, b.regionId), intervals: new Map() };
      const existing = entry.intervals.get(b.id) ?? [];
      existing.push(interval); entry.intervals.set(b.id, existing); matches.set(key, entry);
    }
    for (const key of cellKeys(a, 0)) {
      const bucket = cells.get(key) ?? [];
      bucket.push(a); cells.set(key, bucket);
    }
  }
  const sharedBoundaryMeters: Record<string, number> = {};
  for (const [key, entry] of [...matches].sort(([a], [b]) => a.localeCompare(b))) {
    const length = [...entry.intervals.values()].reduce((sum, intervals) => sum + mergedLength(intervals), 0);
    sharedBoundaryMeters[key] = length;
    if (length + 1e-7 < options.minSharedBoundaryMeters) continue;
    const [a, b] = entry.pair;
    graph[a].push(b); graph[b].push(a);
  }
  for (const neighbors of Object.values(graph)) neighbors.sort();
  return { graph, sharedBoundaryMeters };
}
export function applyOverrides(base: AdjacencyGraph, adds: RegionPair[], removes: RegionPair[]): AdjacencyGraph {
  const graph = Object.fromEntries(Object.entries(base).map(([id, list]) => [id, new Set(list)]));
  for (const [a, b] of adds) {
    if (a === b || !graph[a] || !graph[b]) continue;
    graph[a].add(b); graph[b].add(a);
  }
  for (const [a, b] of removes) { graph[a]?.delete(b); graph[b]?.delete(a); }
  return Object.fromEntries(Object.entries(graph).map(([id, list]) => [id, [...list].sort()]));
}
export function toggleOverride(config: MapConfig, base: AdjacencyGraph, final: AdjacencyGraph, a: string, b: string): MapConfig {
  if (a === b) return config;
  const key = pairKey(a, b), desired = !(final[a] ?? []).includes(b);
  const adds = config.adjacencyAdd.filter(([x, y]) => pairKey(x, y) !== key);
  const removes = config.adjacencyRemove.filter(([x, y]) => pairKey(x, y) !== key);
  if (desired !== (base[a] ?? []).includes(b)) (desired ? adds : removes).push(canonicalPair(a, b));
  return { ...config, adjacencyAdd: adds, adjacencyRemove: removes };
}
