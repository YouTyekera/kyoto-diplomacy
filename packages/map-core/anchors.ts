import polylabel from 'polylabel';
import { area, polygon, booleanPointInPolygon, point } from '@turf/turf';
import { geometryParts, toMeters } from './geometry';
import type { AreaGeometry, DisplayAnchor } from '../shared/model';

export function fromMeters(position: number[]): DisplayAnchor {
  const rad = Math.PI / 180;
  return [position[0] / (rad * 6371008.8 * Math.cos(35 * rad)) + 135,
    position[1] / (rad * 6371008.8) + 35];
}
export function anchorIsInside(geometry: AreaGeometry | null, anchor: DisplayAnchor): boolean {
  return !!geometry && booleanPointInPolygon(point(anchor), geometry, { ignoreBoundary: true });
}
/** Pole of inaccessibility, measured in local metres; holes remain excluded. */
export function calculateDisplayAnchor(geometry: AreaGeometry | null): DisplayAnchor | null {
  if (!geometry) return null;
  const parts = geometryParts(geometry).map(coordinates => ({ coordinates,
    area: area(polygon(coordinates)), key: JSON.stringify(coordinates) }));
  // Geometry order cannot change which equal-area part wins.
  parts.sort((a, b) => b.area - a.area || a.key.localeCompare(b.key));
  for (const part of parts) {
    const projected = part.coordinates.map(ring => ring.map(toMeters));
    // 0.5m is sufficient for game display. Tiny polygons retry at higher precision.
    for (const precision of [0.5, 0.01, 0.0001]) {
      const found = polylabel(projected, precision);
      const anchor = fromMeters(found);
      if (found.distance > 0 && anchorIsInside(geometry, anchor)) return anchor;
    }
  }
  return null;
}
