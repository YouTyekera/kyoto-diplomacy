import { emptySettings, type RegionDataset, type MapConfig, type MapDefinition } from '../shared/model';
import { generateAdjacency, applyOverrides } from './adjacency';
import { subtractObstacles, geometryParts } from './geometry';
import { validateMap, geometryIsValid, type Issue } from './validation';
import { calculateDisplayAnchor, anchorIsInside } from './anchors';

export function compileMap(dataset: RegionDataset, config: MapConfig) {
  const issues: Issue[] = [];
  const issue = (severity: Issue['severity'], code: string, message: string, regionIds: string[]) => issues.push({ severity, code, message, regionIds });
  const validObstacles = config.obstacles.filter(o => {
    if (geometryIsValid(o.geometry)) return true;
    issue('error', 'invalid-obstacle', `${o.properties.name}: 不正な障害物形状`, []); return false;
  });
  const regions = dataset.regions.map(region => {
    const settings = config.regions[region.regionId] ?? emptySettings();
    let playableGeometry = region.geometry as MapDefinition['regions'][number]['playableGeometry'];
    if (!geometryIsValid(region.geometry)) {
      issue('error', 'invalid-geometry', `${region.name}: 不正な地域形状`, [region.regionId]);
      playableGeometry = null;
    } else {
      if (geometryParts(region.geometry).length > 1)
        issue('warning', 'source-multipolygon', `${region.name}: 原本から複数部分を持つ地域です`, [region.regionId]);
      try {
        const cut = subtractObstacles(region.geometry, validObstacles);
        playableGeometry = cut.geometry;
        if (cut.intersections.length) issue('warning', 'obstacle-intersection', `${region.name}: 障害物と重なります (${cut.intersections.join(', ')})`, [region.regionId]);
        if (cut.disconnected) issue('warning', 'disconnected-geometry', `${region.name}: 障害物差し引き後は${cut.partCount}部分です（原本${cut.originalPartCount}部分）。要確認。`, [region.regionId]);
        if (!cut.geometry) issue(settings.enabled ? 'error' : 'warning', 'obstacle-covered-region', `${region.name}: 障害物により移動可能領域がなくなります`, [region.regionId]);
      } catch (error) {
        playableGeometry = null;
        issue('error', 'geometry-operation-failed', `${region.name}: 地理演算に失敗 (${String(error)})`, [region.regionId]);
      }
    }
    let displayAnchor = calculateDisplayAnchor(playableGeometry);
    if (settings.displayAnchorOverride) {
      if (anchorIsInside(playableGeometry, settings.displayAnchorOverride)) displayAnchor = settings.displayAnchorOverride;
      else issue('error', 'invalid-display-anchor', `${region.name}: 表示位置が移動可能領域の外・境界上または障害物内です`, [region.regionId]);
    }
    if (settings.enabled && playableGeometry && !displayAnchor)
      issue('error', 'missing-display-anchor', `${region.name}: 内部の表示位置を計算できません`, [region.regionId]);
    if (!playableGeometry && settings.isSupplyCenter)
      issue('error', 'supply-center-on-impassable', `${region.name}: 移動可能領域のない地域へ補給拠点は設定できません`, [region.regionId]);
    if (!playableGeometry && settings.startingUnit)
      issue('error', 'starting-unit-on-impassable', `${region.name}: 移動可能領域のない地域へ初期ユニットは配置できません`, [region.regionId]);
    return { ...region, ...settings, playableGeometry, displayAnchor };
  });
  const generated = generateAdjacency(regions.map(r => ({ regionId: r.regionId, enabled: r.enabled, geometry: r.playableGeometry })), config.adjacency);
  const adjacency = applyOverrides(generated.graph, config.adjacencyAdd, config.adjacencyRemove);
  for (const [a, b] of config.adjacencyAdd) {
    if (regions.find(r => r.regionId === a)?.playableGeometry === null || regions.find(r => r.regionId === b)?.playableGeometry === null)
      issue('error', 'invalid-override', '移動可能領域のない地域への隣接追加', [a, b]);
  }
  const map: MapDefinition = { version: 1, mapId: config.mapId, regions, adjacency, obstacles: config.obstacles };
  return { map, baseAdjacency: generated.graph, sharedBoundaryMeters: generated.sharedBoundaryMeters,
    report: validateMap(map, config, issues) };
}
export type CompileResult = ReturnType<typeof compileMap>;
