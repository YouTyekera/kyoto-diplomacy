import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
import { createHash } from 'node:crypto';
import { parseKml } from './kml';
import { datasetSchema, createConfig } from '../shared/model';

const sourceDir = resolve(process.argv[2] ?? 'data/source/kyoto-2020-wgs84');
async function filesIn(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const groups = await Promise.all(entries.map(e => e.isDirectory() ? filesIn(join(directory, e.name))
    : /\.kml$/i.test(e.name) ? [join(directory, e.name)] : []));
  return groups.flat().sort();
}
try {
  await mkdir(sourceDir, { recursive: true });
  const files = await filesIn(sourceDir);
  if (!files.length) {
    console.log(`KMLがありません: ${sourceDir}\nサンプル表示は利用可能です。KML配置後、再実行してください。`);
  } else {
    const regions = [];
    for (const file of files) {
      const original = await readFile(file);
      regions.push(parseKml(original.toString('utf8'), relative(sourceDir, file).replaceAll('\\', '/'),
        createHash('sha256').update(original).digest('hex')));
    }
    if (new Set(regions.map(r => r.regionId)).size !== regions.length)
      throw new Error('地域ID重複。行政区全体KMLや同じ地域の複数ファイルが混在していないか確認してください。');
    const dataset = datasetSchema.parse({ version: 1, kind: 'kyoto-kml', regions: regions.sort((a, b) => a.regionId.localeCompare(b.regionId)) });
    await mkdir(resolve('data/generated'), { recursive: true });
    await writeFile(resolve('data/generated/regions.geojson'), JSON.stringify({
      type: 'FeatureCollection', features: dataset.regions.map(r => ({ type: 'Feature', id: r.regionId,
        geometry: r.geometry, properties: { ...r, geometry: undefined } })),
    }));
    await writeFile(resolve('data/generated/regions.json'), JSON.stringify(dataset));
    await mkdir(resolve('data/maps/kyoto-urban'), { recursive: true });
    // Never replace the user's saved map configuration.
    try { await writeFile(resolve('data/maps/kyoto-urban/initial-config.json'), JSON.stringify(createConfig(dataset), null, 2), { flag: 'wx' }); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; }
    console.log(`${regions.length}地域を変換しました。原本は変更していません。`);
    if (regions.length !== 227) console.log('注意: 京都市全227地域の一部だけを読み込んでいます。');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
