import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { configSchema, datasetSchema, createConfig, parseMapConfig, mapConfigCounts } from '../shared/model';
import { requestSchema } from '../shared/online';
import { sampleDataset, sampleConfig } from '../map-core/sample';
import { compileScenario, validateScenarioForOnlinePlay, type ScenarioDiagnostic } from './scenario';
import { RoomManager, serializePublicState } from './room-manager';

const json = readFileSync('tests/fixtures/phase5a1-kyoto-map-config.json', 'utf8');
const dataset = datasetSchema.parse(JSON.parse(readFileSync('data/generated/regions.json', 'utf8')));
describe('Phase 5A.1 実京都MapConfig読込の再現', () => {
  it('EditorとOnline request schemaでregions・障害物・隣接設定を同じ値のまま保持',()=>{
    const editor=parseMapConfig(json), counts=mapConfigCounts(editor);
    expect(counts).toEqual({regionRecords:227,enabledRegions:190,totalSC:72,totalStartingUnits:59});
    const payload=requestSchema.parse({action:'scenario',json,counts});
    if(payload.action!=='scenario')throw new Error('unexpected request');
    expect(payload.counts).toEqual(counts);
    expect(parseMapConfig(payload.json)).toEqual(editor);
    expect(editor.adjacencyRemove.length).toBeGreaterThan(0);
    expect(editor.obstacles.length).toBeGreaterThan(0);
  });
  it('実ファイルを共有schemaで読みサーバーDatasetにcompileすると190/72/59', () => {
    const config = configSchema.parse(JSON.parse(json));
    expect(Object.keys(config.regions)).toHaveLength(227);
    const scenario = compileScenario(dataset, json);
    expect(validateScenarioForOnlinePlay(scenario.map, scenario.config, 3)).toMatchObject({enabledRegions:190,totalSC:72,totalStartingUnits:59});
  });
  it.each(['kyoto-kml', 'sample'] as const)('作成時Dataset=%sでも京都JSONを読込後は190/72/59', kind => {
    const manager = new RoomManager({'kyoto-kml':dataset,sample:sampleDataset});
    const created = manager.request('host', {action:'create',nickname:'Host',preferredWardId:null,datasetKind:kind,config:kind==='sample'?sampleConfig:createConfig(dataset)});
    if (!created.ok) throw new Error(created.errors.join(';'));
    const response = manager.request('host', {action:'scenario',json,fileName:'kyoto-urban-config(3).json'});
    expect(response).toEqual({ok:true});
    const room = manager.roomForSocket('host')!;
    expect(serializePublicState(manager, room).scenario).toMatchObject({enabledRegions:190,totalSC:72,totalStartingUnits:59});
    expect(room.scenario.config.regions).toEqual(configSchema.parse(JSON.parse(json)).regions);
    expect(room.scenario.config).toEqual(parseMapConfig(json));
    expect(room.datasetKind).toBe('kyoto-kml');
  });
  it('件数不一致・JSON/形式/参照不正で既存scenario/map/Datasetを原子保持、段階と件数だけ診断',()=>{
    const manager=new RoomManager({'kyoto-kml':dataset,sample:sampleDataset});
    manager.request('host',{action:'create',nickname:'Host',preferredWardId:null,datasetKind:'sample',config:sampleConfig});
    const room=manager.roomForSocket('host')!, previous=room.scenario, map=room.map;
    const diagnostics:ScenarioDiagnostic[]=[];
    for(const upload of [
      {json,counts:{regionRecords:227,enabledRegions:0,totalSC:0,totalStartingUnits:0}},
      {json:'{'}, {json:'{"version":999}'},
      {json:JSON.stringify({...parseMapConfig(json),regions:{missing:parseMapConfig(json).regions['kyoto-26101-01']}})},
    ]) {
      const result=manager.request('host',{action:'scenario',...upload},v=>diagnostics.push(v));
      expect(result.ok).toBe(false);
      expect(room.scenario).toBe(previous);expect(room.map).toBe(map);expect(room.datasetKind).toBe('sample');
    }
    expect(diagnostics.map(v=>v.stage)).toEqual(expect.arrayContaining(['preflight-failed','json-failed','schema-failed','dataset-failed']));
    expect(diagnostics.find(v=>v.stage==='preflight')).toMatchObject({counts:{enabledRegions:190,totalSC:72,totalStartingUnits:59},compiledCounts:{enabledRegions:190,totalSC:72,totalStartingUnits:59}});
    expect(JSON.stringify(diagnostics)).not.toContain('kyoto-26101-01');
  });
  it('adjacencyAddとRemoveをアップロード設定のままcompileに反映',()=>{
    const uploaded=parseMapConfig(json);
    const ids=Object.keys(uploaded.regions).filter(id=>uploaded.regions[id].enabled);
    uploaded.adjacencyAdd.push([ids[0],ids.at(-1)!]);
    uploaded.adjacencyRemove=uploaded.adjacencyRemove.filter(([a,b])=>![a,b].includes(ids[0])||![a,b].includes(ids.at(-1)!));
    const scenario=compileScenario(dataset,uploaded);
    expect(scenario.config.adjacencyAdd).toEqual(uploaded.adjacencyAdd);
    expect(scenario.config.adjacencyRemove).toEqual(uploaded.adjacencyRemove);
    expect(scenario.config.adjacency).toEqual(uploaded.adjacency);
    expect(scenario.config.obstacles).toEqual(uploaded.obstacles);
    expect(scenario.map.adjacency[ids[0]]).toContain(ids.at(-1)!);
    for(const [a,b] of uploaded.adjacencyRemove)expect(scenario.map.adjacency[a]??[]).not.toContain(b);
  });
});
