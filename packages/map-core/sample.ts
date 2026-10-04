import { createConfig, type RegionDataset, type SourceRegion, type Obstacle } from '../shared/model';

const squares = [
  ['sample-a', '架空地域A', '26101', 135.74, 35.04],
  ['sample-b', '架空地域B', '26101', 135.75, 35.04],
  ['sample-c', '架空地域C', '26102', 135.74, 35.05],
  ['sample-d', '架空地域D', '26102', 135.75, 35.05],
] as const;
export const sampleDataset: RegionDataset = { version: 1, kind: 'sample', regions: squares.map(([id, name, wardId, x, y], i): SourceRegion => ({
  regionId: id, name, wardId, sourceAreaNumber: String(i + 1),
  geometry: { type: 'Polygon', coordinates: [[[x, y], [x + 0.01, y], [x + 0.01, y + 0.01], [x, y + 0.01], [x, y]]] },
  source: { file: 'sample.ts', folderName: '架空データ', datasetId: 'sample', url: 'local sample',
    copyright: 'このプロジェクト', license: 'test fixture', placemarks: [] },
})) };
export const sampleConfig = createConfig(sampleDataset);
for (const settings of Object.values(sampleConfig.regions)) settings.enabled = true;
/** Fictional stripe in the fictional sample map. Never loaded into the Kyoto map automatically. */
export const sampleObstacle: Obstacle = {
  type: 'Feature', id: 'sample-stripe', properties: { name: '架空の分断テスト用障害物', source: '手作成のテスト用形状。京都御苑ではありません。' },
  geometry: { type: 'Polygon', coordinates: [[[135.744, 35.039], [135.746, 35.039], [135.746, 35.052], [135.744, 35.052], [135.744, 35.039]]] },
};
