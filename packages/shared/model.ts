import { z } from 'zod';
import type { Polygon, MultiPolygon } from 'geojson';

export const WARDS = [
  { id: '26101', name: '北区', color: '#527ea6' },
  { id: '26102', name: '上京区', color: '#bb8468' },
  { id: '26103', name: '左京区', color: '#75915a' },
  { id: '26104', name: '中京区', color: '#b79b44' },
  { id: '26105', name: '東山区', color: '#a9779c' },
  { id: '26110', name: '山科区', color: '#649c9b' },
  { id: '26106', name: '下京区', color: '#bf716c' },
  { id: '26107', name: '南区', color: '#8884ba' },
  { id: '26108', name: '右京区', color: '#70a589' },
  { id: '26111', name: '西京区', color: '#a19071' },
  { id: '26109', name: '伏見区', color: '#b28fba' },
] as const;
export const wardSchema = z.enum(WARDS.map(w => w.id));
export type WardId = z.infer<typeof wardSchema>;
export type AreaGeometry = Polygon | MultiPolygon;
export const positionSchema = z.tuple([z.number().finite().min(-180).max(180), z.number().finite().min(-90).max(90)]);
export type DisplayAnchor = z.infer<typeof positionSchema>;
const position = positionSchema;
const ring = z.array(position).min(4).superRefine((v, ctx) => {
  if (v[0][0] !== v.at(-1)![0] || v[0][1] !== v.at(-1)![1])
    ctx.addIssue({ code: 'custom', message: 'リングは始点と終点が一致する必要があります' });
  if (new Set(v.map(p => p.join(','))).size < 3)
    ctx.addIssue({ code: 'custom', message: '異なる頂点が3点以上必要です' });
});
const polygonCoordinates = z.array(ring).min(1);
export const geometrySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Polygon'), coordinates: polygonCoordinates }).strict(),
  z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(polygonCoordinates).min(1) }).strict(),
]);
export const sourceSchema = z.object({
  file: z.string().min(1), sha256: z.string().optional(),
  datasetId: z.string().min(1), url: z.string().min(1),
  copyright: z.string().min(1), license: z.string().min(1),
  folderName: z.string(),
  placemarks: z.array(z.object({ id: z.string(), properties: z.record(z.string(), z.string()) }).strict()),
}).strict();
export const regionSchema = z.object({
  regionId: z.string().min(1), wardId: wardSchema,
  sourceAreaNumber: z.string().regex(/^\d+$/), name: z.string().min(1),
  geometry: geometrySchema, source: sourceSchema,
}).strict();
export type SourceRegion = Omit<z.infer<typeof regionSchema>, 'geometry'> & { geometry: AreaGeometry };
export const datasetSchema = z.object({
  version: z.literal(1), kind: z.enum(['kyoto-kml', 'sample']),
  regions: z.array(regionSchema).min(1),
}).strict();
export type RegionDataset = Omit<z.infer<typeof datasetSchema>, 'regions'> & { regions: SourceRegion[] };
export const settingsSchema = z.object({
  enabled: z.boolean(), isSupplyCenter: z.boolean(), homeWardId: wardSchema.nullable().default(null),
  startingUnit: z.object({ ownerWardId: wardSchema, type: z.literal('army') }).strict().nullable(),
  displayAnchorOverride: positionSchema.nullable().optional(),
}).strict();
export type RegionSettings = z.infer<typeof settingsSchema>;
export const obstacleSchema = z.object({
  type: z.literal('Feature'), id: z.string().min(1), geometry: geometrySchema,
  properties: z.object({ name: z.string().min(1), source: z.string().min(1) }).strict(),
}).strict();
export type Obstacle = Omit<z.infer<typeof obstacleSchema>, 'geometry'> & { geometry: AreaGeometry };
export const pairSchema = z.tuple([z.string().min(1), z.string().min(1)]);
export type RegionPair = z.infer<typeof pairSchema>;
export const configSchema = z.object({
  version: z.literal(1), mapId: z.string().min(1),
  regions: z.record(z.string(), settingsSchema),
  adjacency: z.object({
    toleranceMeters: z.number().finite().min(0).max(100),
    minSharedBoundaryMeters: z.number().finite().positive().max(10000),
  }).strict(),
  adjacencyAdd: z.array(pairSchema), adjacencyRemove: z.array(pairSchema),
  obstacles: z.array(obstacleSchema),
}).strict();
export type MapConfig = Omit<z.infer<typeof configSchema>, 'obstacles'> & { obstacles: Obstacle[] };
/** Editor and online use the same parser; no blank configuration fallback. */
export function parseMapConfig(input: unknown): MapConfig {
  return configSchema.parse(typeof input === 'string' ? JSON.parse(input) : input);
}
export const scenarioCountsSchema = z.object({
  regionRecords: z.number().int().nonnegative(), enabledRegions: z.number().int().nonnegative(),
  totalSC: z.number().int().nonnegative(), totalStartingUnits: z.number().int().nonnegative(),
}).strict();
export type ScenarioCounts = z.infer<typeof scenarioCountsSchema>;
export function mapConfigCounts(config: MapConfig): ScenarioCounts {
  const settings = Object.values(config.regions), enabled = settings.filter(r => r.enabled);
  return { regionRecords: settings.length, enabledRegions: enabled.length,
    totalSC: enabled.filter(r => r.isSupplyCenter).length, totalStartingUnits: enabled.filter(r => r.startingUnit).length };
}
export type MapRegion = SourceRegion & RegionSettings & { playableGeometry: AreaGeometry | null; displayAnchor?: DisplayAnchor | null };
export type AdjacencyGraph = Record<string, string[]>;
/** Static map only. Ownership, units in play, equipment and orders belong to a future GameState. */
export interface MapDefinition {
  version: 1;
  mapId: string;
  regions: MapRegion[];
  adjacency: AdjacencyGraph;
  obstacles: Obstacle[];
}
export const mapDefinitionSchema = z.object({
  version: z.literal(1), mapId: z.string().min(1),
  regions: z.array(regionSchema.extend(settingsSchema.shape).extend({
    playableGeometry: geometrySchema.nullable(), displayAnchor: positionSchema.nullable().optional(),
  })),
  adjacency: z.record(z.string(), z.array(z.string())),
  obstacles: z.array(obstacleSchema),
}).strict();

export function stableRegionId(wardId: WardId, areaNumber: string): string {
  if (!/^\d+$/.test(areaNumber)) throw new Error('国勢統計区番号が数値ではありません');
  return `kyoto-${wardId}-${Number(areaNumber).toString().padStart(2, '0')}`;
}
export function emptySettings(): RegionSettings {
  return { enabled: false, isSupplyCenter: false, homeWardId: null, startingUnit: null };
}
export function createConfig(dataset: RegionDataset): MapConfig {
  return { version: 1, mapId: 'kyoto-urban',
    regions: Object.fromEntries(dataset.regions.map(r => [r.regionId, emptySettings()])),
    adjacency: { toleranceMeters: 0.5, minSharedBoundaryMeters: 5 },
    adjacencyAdd: [], adjacencyRemove: [], obstacles: [] };
}
export function parseObstacleGeoJSON(input: unknown): Obstacle[] {
  const collection = z.object({ type: z.literal('FeatureCollection'), features: z.array(obstacleSchema) }).parse(input);
  if (new Set(collection.features.map(f => f.id)).size !== collection.features.length)
    throw new Error('障害物IDが重複しています');
  return collection.features;
}
