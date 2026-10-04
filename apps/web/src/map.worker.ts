import { compileMap } from '../../../packages/map-core/compile';
import type { MapConfig, RegionDataset } from '../../../packages/shared/model';

self.onmessage = (event: MessageEvent<{ dataset: RegionDataset; config: MapConfig }>) => {
  try { self.postMessage({ result: compileMap(event.data.dataset, event.data.config) }); }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : String(error) }); }
};
