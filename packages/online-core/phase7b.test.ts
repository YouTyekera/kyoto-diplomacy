import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {beforeAll,expect,it} from 'vitest';
import {RoomManager,serializePublicState} from './room-manager';
import {datasetSchema,parseMapConfig,createConfig,mapConfigCounts,type RegionDataset} from '../shared/model';
import {sampleConfig,sampleDataset} from '../map-core/sample';
const json=readFileSync('data/default-scenarios/kyoto-standard.json','utf8');
let dataset:RegionDataset;
beforeAll(()=>{dataset=datasetSchema.parse(JSON.parse(readFileSync('data/generated/regions.json','utf8')));});
function manager(standardScenarioJson=json){return new RoomManager({'kyoto-kml':dataset,sample:sampleDataset},undefined,{standardScenarioJson});}
function create(m:RoomManager){expect(m.request('host',{action:'create',nickname:'ホスト',preferredWardId:'26102',datasetKind:'sample',config:sampleConfig,scenario:'standard'})).toMatchObject({ok:true});return m.roomForSocket('host')!;}
it('標準JSONのファイルbytesとユーザー提供hashを保持する',()=>{
 expect(createHash('sha256').update(readFileSync('data/default-scenarios/kyoto-standard.json')).digest('hex')).toBe('0890799a41e08e9049a1c6709b74437acdaf22b38022811561d5766665359652');
});
it('標準はサーバーのJSONを既存のschema・Dataset照合・compile・preflightへ通し、3人でuploadなし開始',()=>{
 const m=manager(),stages:string[]=[],result=m.request('host',{action:'create',nickname:'ホスト',preferredWardId:'26102',datasetKind:'kyoto-kml',config:createConfig(dataset),scenario:'standard'},d=>stages.push(d.stage));
 expect(result.ok).toBe(true);expect(stages).toEqual(['json','schema','schema','dataset','compile','preflight']);
 const room=m.roomForSocket('host')!,config=parseMapConfig(json);expect(room.scenario.config).toEqual(config);expect(room.datasetKind).toBe('kyoto-kml');
 const counts=mapConfigCounts(config);expect(serializePublicState(m,room).scenario).toMatchObject({source:'standard',loaded:true,scenarioName:'標準シナリオ',fileName:'kyoto-standard.json',errors:[],enabledRegions:counts.enabledRegions,totalSC:counts.totalSC,totalStartingUnits:counts.totalStartingUnits});
 for(const [socket,ward] of [['guest1','26104'],['guest2','26111']])expect(m.request(socket,{action:'join',nickname:socket,preferredWardId:ward,roomCode:room.code}).ok).toBe(true);
 expect(m.startErrors(room)).toEqual([]);expect(m.request('host',{action:'start',yearLimit:null}).ok).toBe(true);expect(room.game!.activePlayerCount).toBe(3);
 expect(m.request('host',{action:'standard-scenario'}).ok).toBe(false);
},15000); // Real Kyoto compilation plus preflight/start can exceed 5s under parallel CI load.
it('カスタムJSONへ切替・失敗時保持・標準へ復帰を同じcompile経路で行う',()=>{
 const m=manager(),room=create(m),hash=room.scenario.hash;
 expect(m.request('guest',{action:'join',nickname:'ゲスト',preferredWardId:null,roomCode:room.code}).ok).toBe(true);
 expect(m.request('guest',{action:'standard-scenario'}).ok).toBe(false);
 expect(m.request('host',{action:'scenario',json:JSON.stringify(sampleConfig),fileName:'custom.json'}).ok).toBe(true);
 expect(room.scenario.source).toBe('custom');expect(room.datasetKind).toBe('sample');const custom=room.scenario;
 expect(m.request('host',{action:'scenario',json:'broken'}).ok).toBe(false);expect(room.scenario).toBe(custom);
 expect(m.request('host',{action:'standard-scenario'}).ok).toBe(true);expect(room.datasetKind).toBe('kyoto-kml');expect(room.scenario.hash).toBe(hash);expect(room.scenario.config).toEqual(parseMapConfig(json));
},15000);
it('標準でも不正なJSONや地域参照を拒否し、部屋を作らない',()=>{
 for(const bad of ['broken',JSON.stringify({...JSON.parse(json),regions:{}})]){
  const m=manager(bad);expect(m.request('host',{action:'create',nickname:'ホスト',preferredWardId:null,datasetKind:'sample',config:sampleConfig,scenario:'standard'}).ok).toBe(false);expect(m.rooms.size).toBe(0);
 }
});
