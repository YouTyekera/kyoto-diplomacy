import {it,expect,vi,afterEach} from 'vitest';
import {RoomManager,serializePublicState} from './room-manager';
import * as scenario from './scenario';
import {defaultGameSettings} from './initial';
import {sampleDataset,sampleConfig} from '../map-core/sample';
import {completeSyntheticScenario} from '../../tests/scenario-fixture';
import {readFile} from 'node:fs/promises';
import {datasetSchema} from '../shared/model';
import * as validation from '../map-core/validation';
function fixture(){const f=completeSyntheticScenario(sampleDataset,sampleConfig),settings=structuredClone(defaultGameSettings),manager=new RoomManager({sample:f.dataset,'kyoto-kml':f.dataset},settings);const created=manager.request('host',{action:'create',nickname:'host',preferredWardId:null,datasetKind:'sample',config:f.config});if(!created.ok)throw Error('fixture');return {...f,settings,manager,room:manager.roomForSocket('host')!};}
afterEach(()=>vi.restoreAllMocks());
it('同じ公開stateでpreflightを重複せず、presence/reconnectでは不変Mapを検証し直さない',()=>{
 const {manager,room}=fixture(),prepare=vi.spyOn(scenario,'prepareScenarioForOnlinePlay'),calls=vi.spyOn(manager,'preflight');
 try{serializePublicState(manager,room,false);expect(calls).toHaveBeenCalledTimes(1);expect(prepare).toHaveBeenCalledTimes(1);const first=manager.preflight(room);manager.disconnect('host');serializePublicState(manager,room,false);expect(serializePublicState(manager,room,false).startErrors).toContain('全参加者の接続を待っています');expect(prepare).toHaveBeenCalledTimes(1);expect(manager.preflight(room)).toBe(first);}finally{manager.dispose();}
});
it('player数・関連settingsは軽い判定だけを更新し、開始条件と目標エラーを維持',()=>{
 const {manager,room,settings}=fixture(),prepare=vi.spyOn(scenario,'prepareScenarioForOnlinePlay');
 try{const first=manager.preflight(room);for(let i=1;i<=2;i++)expect(manager.request(`guest${i}`,{action:'join',roomCode:room.code,nickname:`guest${i}`,preferredWardId:null}).ok).toBe(true);const three=manager.preflight(room);expect(three).not.toBe(first);expect(prepare).toHaveBeenCalledTimes(1);expect(manager.startErrors(room)).toEqual([]);
  settings.baseVictoryTargetSC=1000;const changed=manager.preflight(room);expect(changed).not.toBe(three);expect(changed.errors.join()).toContain('勝利目標');expect(manager.request('host',{action:'start',yearLimit:null}).ok).toBe(false);expect(prepare).toHaveBeenCalledTimes(1);
  settings.baseVictoryTargetSC=defaultGameSettings.baseVictoryTargetSC;expect(manager.startErrors(room)).toEqual([]);manager.disconnect('guest1');expect(manager.startErrors(room)).toContain('全参加者の接続を待っています');
 }finally{manager.dispose();}
});
it('scenario差替え・hash/参照の変更は不変Map cacheも再検証し、拒否された変更は保持',()=>{
 const {manager,room,config}=fixture(),prepare=vi.spyOn(scenario,'prepareScenarioForOnlinePlay');
 try{manager.preflight(room);expect(prepare).toHaveBeenCalledTimes(1);expect(manager.request('host',{action:'scenario',json:'broken',fileName:'broken.json'}).ok).toBe(false);manager.preflight(room);expect(prepare).toHaveBeenCalledTimes(1);
  expect(manager.request('host',{action:'scenario',json:JSON.stringify(config),fileName:'same.json'}).ok).toBe(true);const before=prepare.mock.calls.length;manager.preflight(room);expect(prepare).toHaveBeenCalledTimes(before+1);room.scenario.hash+='-new';manager.preflight(room);expect(prepare).toHaveBeenCalledTimes(before+2);
  room.map=structuredClone(room.map);manager.preflight(room);expect(prepare).toHaveBeenCalledTimes(before+3);
 }finally{manager.dispose();}
});
it('cacheの結果は従来と同じ検証結果で、返した配列を書き換えて開始制約を消せない',()=>{
 const {manager,room,settings}=fixture();try{for(const count of [1,3,11]){while(room.players.size<count){const i=room.players.size;manager.request(`s${i}`,{action:'join',nickname:`p${i}`,roomCode:room.code,preferredWardId:null});}expect(manager.preflight(room)).toEqual(scenario.validateScenarioForOnlinePlay(room.map,room.scenario.config,count,settings,room.scenario.report));}
  expect(()=>manager.preflight(room).errors.push('tamper')).toThrow();expect(()=>manager.preflight(room).warnings.pop()).toThrow();
 }finally{manager.dispose();}
});
it('正式京都190地域で1〜11人のjoin・presence・reconnect・kick・leaveを通してMap検証は1回',async()=>{
 const dataset=datasetSchema.parse(JSON.parse(await readFile(new URL('../../data/generated/regions.json',import.meta.url),'utf8'))),standardScenarioJson=await readFile(new URL('../../data/default-scenarios/kyoto-standard.json',import.meta.url),'utf8');
 const manager=new RoomManager({sample:sampleDataset,'kyoto-kml':dataset},undefined,{standardScenarioJson}),created=manager.request('host',{action:'create',nickname:'京都cache',preferredWardId:null,datasetKind:'kyoto-kml',config:sampleConfig,scenario:'standard'});if(!created.ok)throw Error('fixture');
 const room=manager.roomForSocket('host')!,mapCheck=vi.spyOn(validation,'validateMap'),prepare=vi.spyOn(scenario,'prepareScenarioForOnlinePlay');
 try{expect(serializePublicState(manager,room,false).scenario).toMatchObject({enabledRegions:190,totalSC:72,totalStartingUnits:59});const joined=[];
  for(let i=1;i<=10;i++){const result=manager.request(`s${i}`,{action:'join',nickname:`京都cache${i}`,roomCode:room.code,preferredWardId:null});if(!result.ok)throw Error('join');joined.push(result.credentials!);serializePublicState(manager,room,false);}
  manager.disconnect('s1');expect(serializePublicState(manager,room,false).startErrors).toContain('全参加者の接続を待っています');expect(manager.request('restored',{action:'reconnect',...joined[0]}).ok).toBe(true);expect(serializePublicState(manager,room,false).startErrors).toEqual([]);
  expect(manager.request('host',{action:'kick',playerId:joined[0].playerId}).ok).toBe(true);serializePublicState(manager,room,false);expect(manager.request('s2',{action:'leave'}).ok).toBe(true);serializePublicState(manager,room,false);
  expect(prepare).toHaveBeenCalledTimes(1);expect(mapCheck).toHaveBeenCalledTimes(1);expect(room.players.size).toBe(9);
 }finally{manager.dispose();}
},15000);
