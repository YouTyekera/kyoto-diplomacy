import { bbox, difference, feature, featureCollection, intersect, area } from '@turf/turf';
import type { FeatureCollection, Polygon, MultiPolygon } from 'geojson';
import type { AreaGeometry, Obstacle } from '../shared/model';

/** Local equirectangular projection at Kyoto's latitude. Units are metres. */
export function toMeters(position: number[]): [number, number] {
  const rad = Math.PI / 180;
  return [(position[0] - 135) * rad * 6371008.8 * Math.cos(35 * rad),
    (position[1] - 35) * rad * 6371008.8];
}
export function geometryParts(geometry: AreaGeometry): number[][][][] {
  return geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
}
export function subtractObstacles(geometry: AreaGeometry, obstacles: Obstacle[]) {
  let result: AreaGeometry | null = geometry;
  const intersections: string[] = [];
  for (const obstacle of obstacles) {
    if (!result) break;
    const a = bbox(result), b = bbox(obstacle.geometry);
    if (a[0] > b[2] || b[0] > a[2] || a[1] > b[3] || b[1] > a[3]) continue;
    const features: FeatureCollection<Polygon | MultiPolygon> = featureCollection([feature(result), feature(obstacle.geometry)]);
    const overlap = intersect(features);
    if (!overlap || area(overlap) <= 0) continue;
    intersections.push(obstacle.id);
    result = difference(features)?.geometry ?? null;
  }
  const parts = result ? geometryParts(result).length : 0;
  return { geometry: result, intersections,
    disconnected: intersections.length > 0 && parts > 1,
    partCount: parts, originalPartCount: geometryParts(geometry).length };
}
