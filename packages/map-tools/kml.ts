import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { featureCollection, polygon, union } from '@turf/turf';
import type { Polygon } from 'geojson';
import { geometrySchema, stableRegionId, type SourceRegion, type WardId } from '../shared/model';

type XmlNode = Record<string, unknown>;
function objects(value: unknown): XmlNode[] {
  return (Array.isArray(value) ? value : [value]).filter((v): v is XmlNode => !!v && typeof v === 'object');
}
function descendants(node: XmlNode, tag: string): XmlNode[] {
  const result: XmlNode[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (key === tag) result.push(...objects(value));
    for (const child of objects(value)) result.push(...descendants(child, tag));
  }
  return result;
}
function textValue(value: unknown): string {
  return String(typeof value === 'object' && value !== null ? (value as XmlNode)['#text'] ?? '' : value ?? '');
}
// Verified from Dataset 00670 resource titles and original Document names.
// 32/34/36 refer to subareas within Fushimi, 38 to Rakusai, 40 to Keihoku.
const prefixWard: Record<string, WardId> = {
  '10': '26101', '12': '26102', '14': '26103', '16': '26104',
  '20': '26105', '22': '26110', '24': '26106', '26': '26107',
  '28': '26108', '30': '26111', '32': '26109', '34': '26109',
  '36': '26109', '38': '26111', '40': '26108',
};
export function parseKml(xml: string, file: string, sha256?: string): SourceRegion {
  const valid = XMLValidator.validate(xml);
  if (valid !== true) throw new Error(`${file}: XMLが不正です (${valid.err.msg})`);
  const root = new XMLParser({ ignoreAttributes: false, parseTagValue: false,
    parseAttributeValue: false, removeNSPrefix: true, processEntities: true }).parse(xml) as XmlNode;
  const containers = [...descendants(root, 'Document'), ...descendants(root, 'Folder')];
  const folderName = containers.map(n => textValue(n.name)).find(n => /^\d{2}_\d+/.test(n));
  if (!folderName?.endsWith('disv4326')) throw new Error(`${file}: Dataset 00670のWGS84 Document名ではありません。公式00670の国勢統計区KMLを使用してください。`);
  const match = folderName?.match(/^(\d{2})_(\d+)(.+?)(?:disv4326)?$/);
  if (!match) throw new Error(`${file}: 国勢統計区のDocument/Folder名が見つかりません。行政区全体KMLは対象外です。`);
  const [, prefix, areaNumber, name] = match;
  const wardId = prefixWard[prefix];
  if (!wardId) throw new Error(`${file}: 未対応の公式地域コード ${prefix}`);
  const placemarks = descendants(root, 'Placemark');
  const sourcePlacemarks = placemarks.map((p, index) => ({
    id: textValue(p['@_id']) || `${index}`,
    properties: Object.fromEntries(descendants(p, 'SimpleData').map(d => [textValue(d['@_name']), textValue(d)])),
  }));
  const geometries: Polygon[] = [];
  for (const p of placemarks) {
    for (const poly of descendants(p, 'Polygon')) {
      const outer = descendants(poly, 'outerBoundaryIs');
      if (outer.length !== 1) throw new Error(`${file}: 外周リング数が不正です`);
      const boundaries = [...outer, ...descendants(poly, 'innerBoundaryIs')];
      const coordinates = boundaries.map(b => {
        const linear = descendants(b, 'LinearRing')[0];
        const raw = textValue(linear?.coordinates).trim();
        if (!raw) throw new Error(`${file}: coordinatesが空です`);
        return raw.split(/\s+/).map(tuple => {
          const parts = tuple.split(',');
          if (parts.length < 2 || parts.slice(0, 2).some(n => !n.trim())) throw new Error(`${file}: 座標が不正です`);
          return [Number(parts[0]), Number(parts[1])] as [number, number];
        });
      });
      geometries.push(geometrySchema.parse({ type: 'Polygon', coordinates }) as Polygon);
    }
  }
  if (!geometries.length) throw new Error(`${file}: Polygonがありません`);
  // Union merges internal boundaries; disconnected parts and holes are preserved.
  const geometry = geometries.length === 1 ? geometries[0]
    : union(featureCollection(geometries.map(g => polygon(g.coordinates))))?.geometry;
  if (!geometry) throw new Error(`${file}: ポリゴン統合に失敗しました`);
  return {
    regionId: stableRegionId(wardId, areaNumber), wardId, sourceAreaNumber: areaNumber,
    name, geometry, source: {
      file, sha256, folderName: folderName!, placemarks: sourcePlacemarks,
      datasetId: '00670', url: 'https://data.city.kyoto.lg.jp/dataset/00670/',
      copyright: '京都市', license: 'CC BY 4.0',
    },
  };
}
