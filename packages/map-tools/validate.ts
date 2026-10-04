import { readFile, writeFile } from 'node:fs/promises';
import { datasetSchema, configSchema } from '../shared/model';
import { compileMap } from '../map-core/compile';

try {
  const dataset = datasetSchema.parse(JSON.parse(await readFile('data/generated/regions.json', 'utf8')));
  const config = configSchema.parse(JSON.parse(await readFile(process.argv[2] ?? 'data/maps/kyoto-urban/initial-config.json', 'utf8')));
  const result = compileMap(dataset, config);
  console.table(result.report.counts);
  console.log(`地域${dataset.regions.length} / 採用${result.map.regions.filter(r => r.enabled).length} / 連結成分${result.report.components.length}`);
  for (const issue of result.report.issues) console.log(`${issue.severity}: ${issue.message}`);
  await writeFile('data/generated/validation-report.json', JSON.stringify(result.report, null, 2));
  if (result.report.issues.some(i => i.severity === 'error')) process.exitCode = 1;
  else await writeFile('data/generated/map-definition.json', JSON.stringify(result.map));
} catch (error) {
  console.error(error instanceof Error ? error.message : error); process.exitCode = 1;
}
