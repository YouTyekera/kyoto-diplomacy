import { createHash } from 'node:crypto';
import { configSchema, parseMapConfig, mapConfigCounts, mapDefinitionSchema, WARDS, type MapConfig, type MapDefinition, type RegionDataset, type ScenarioCounts } from '../shared/model';
import { compileMap } from '../map-core/compile';
import { validateMap, type ValidationReport, type Issue } from '../map-core/validation';
import { victoryTarget, defaultGameSettings } from './initial';

export interface Scenario {id:string;name:string;hash:string;config:MapConfig;map:MapDefinition;report:ValidationReport;loaded:boolean;fileName?:string;source?:'standard'|'custom'|'editor'}
function canonical(value:unknown):string {
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value!==null&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';
  return JSON.stringify(value);
}
export function compileScenario(dataset:RegionDataset,input:unknown,loaded=true):Scenario {
  const config=parseMapConfig(input);
  const compiled=compileMap(dataset,config);mapDefinitionSchema.parse(compiled.map);
  const errors=compiled.report.issues.filter(i=>i.severity==='error');if(errors.length)throw new Error(errors.map(i=>i.message).join('\n'));
  const hash=createHash('sha256').update(canonical({dataset,config})).digest('hex');
  return {id:config.mapId,name:config.mapId,hash,config,map:compiled.map,report:compiled.report,loaded};
}
export interface ScenarioDiagnostic { stage: string; counts?: ScenarioCounts; compiledCounts?: ScenarioCounts; datasetKind?: RegionDataset['kind'] }
export function compileUploadedScenario(datasets:Record<RegionDataset['kind'],RegionDataset>, currentKind:RegionDataset['kind'], json:string,
  expectedCounts?:ScenarioCounts, diagnostic:(value:ScenarioDiagnostic)=>void=()=>{}) {
  let stage='json', counts:ScenarioCounts|undefined;
  const emit=(value:ScenarioDiagnostic)=>diagnostic(value);
  try {
    emit({stage});
    const raw:unknown=JSON.parse(json);
    stage='schema'; emit({stage});
    const config=parseMapConfig(raw); counts=mapConfigCounts(config); emit({stage,counts});
    stage='dataset';
    // Match region identities against server-owned datasets. mapId and the room's
    // creation mode do not identify the geometry in an uploaded configuration.
    const ids=Object.keys(config.regions), matches=(dataset:RegionDataset)=>{
      const sourceIds=new Set(dataset.regions.map(r=>r.regionId));
      return ids.length===sourceIds.size && ids.every(id=>sourceIds.has(id));
    };
    const datasetKind=matches(datasets[currentKind])?currentKind:(Object.keys(datasets) as RegionDataset['kind'][]).find(kind=>matches(datasets[kind]));
    emit({stage,counts,datasetKind});
    if(!datasetKind)throw new Error('設定の地域一覧がサーバーのDatasetと一致しません。正しい京都MapConfigを確認してください。');
    stage='compile'; emit({stage,counts,datasetKind});
    const scenario=compileScenario(datasets[datasetKind],config);
    stage='preflight';
    const preflight=validateScenarioForOnlinePlay(scenario.map,scenario.config,0,undefined,scenario.report);
    const compiledCounts={regionRecords:scenario.map.regions.length,enabledRegions:preflight.enabledRegions,totalSC:preflight.totalSC,totalStartingUnits:preflight.totalStartingUnits};
    emit({stage,counts,compiledCounts,datasetKind});
    const same=(a:ScenarioCounts,b:ScenarioCounts)=>Object.keys(a).every(key=>a[key as keyof ScenarioCounts]===b[key as keyof ScenarioCounts]);
    if(!same(counts,compiledCounts)||(expectedCounts&&!same(expectedCounts,counts)))
      throw new Error('アップロード設定とサーバーコンパイル結果が一致しません。');
    return {scenario,datasetKind,counts,compiledCounts};
  } catch(error) {
    emit({stage:`${stage}-failed`,counts});
    const labels:Record<string,string>={json:'JSON解析',schema:'MapConfig形式検証',dataset:'Dataset照合',compile:'地図コンパイル',preflight:'コンパイル結果照合'};
    throw new Error(`${labels[stage]}: ${error instanceof Error?error.message:'シナリオを読み込めません'}`);
  }
}
export function validateScenarioForOnlinePlay(map:MapDefinition,config:MapConfig,playerCount:number,settings=defaultGameSettings,report?:ValidationReport) {
  const issues:Issue[]=validateMap(map,config,report?.issues??[]).issues.filter((v,i,all)=>all.findIndex(p=>p.code===v.code&&p.message===v.message)===i);
  const add=(severity:Issue['severity'],code:string,message:string,regionIds:string[]=[])=>issues.push({severity,code,message,regionIds});
  if(!configSchema.safeParse(config).success||!mapDefinitionSchema.safeParse(map).success)add('error','invalid-schema','MapConfig / MapDefinitionの形式が不正です');
  const playable=map.regions.filter(r=>r.enabled&&r.playableGeometry),sc=playable.filter(r=>r.isSupplyCenter),armies=map.regions.filter(r=>r.startingUnit);
  const allowed=new Set(playable.map(r=>r.regionId));
  for(const [id,neighbors] of Object.entries(map.adjacency))if(!allowed.has(id)||neighbors.some(n=>!allowed.has(n)))add('error','unplayable-adjacency',`侵入不能・除外地域への隣接があります: ${id}`,[id]);
  for(const r of playable)if((map.adjacency[r.regionId]??[]).length===1)add('warning','low-degree',`${r.name}: 隣接数1です`,[r.regionId]);
  if(!playable.length)add('error','no-regions','採用された侵入可能地域がありません');
  if(!sc.length)add('error','no-sc','補給拠点がありません');
  if(!armies.length)add('error','no-armies','初期軍がありません');
  for(const r of armies) {
    if(!r.enabled||!r.playableGeometry)add('error','unplayable-army',`${r.name}: 初期軍が除外・侵入不能地域にあります`,[r.regionId]);
    if(!r.isSupplyCenter)add('error','non-sc-army',`${r.name}: 初期軍の地域をSCにしてください`,[r.regionId]);
  }
  if(new Set(armies.map(r=>r.regionId)).size!==armies.length)add('error','duplicate-army','同じ地域の初期軍が重複しています');
  const counts=WARDS.map(w=>({wardId:w.id,name:w.name,regions:playable.filter(r=>r.wardId===w.id).length,supplyCenters:sc.filter(r=>r.wardId===w.id&&r.homeWardId===w.id).length,armies:playable.filter(r=>r.startingUnit?.ownerWardId===w.id).length}));
  for(const w of counts)for(const [key,label] of [['regions','採用地域'],['supplyCenters','初期所有SC'],['armies','初期軍']] as const)if(w[key]===0)add('error',`missing-ward-${key}`,`${w.name}: ${label}が0です（全11区の設定が必要）`);
  for(const [key,label] of [['regions','採用地域数'],['supplyCenters','初期SC数'],['armies','初期軍数']] as const)if(new Set(counts.map(w=>w[key])).size>1)add('warning',`unequal-${key}`,`区ごとの${label}に差があります: ${counts.map(w=>`${w.name} ${w[key]}`).join('、')}`);
  if(playerCount>=3&&playerCount<=11&&victoryTarget(playerCount,settings)>sc.length)add('error','target-exceeds-sc',`勝利目標${victoryTarget(playerCount,settings)}SCがシナリオSC総数${sc.length}を超えています`);
  const borders=playable.filter(r=>(map.adjacency[r.regionId]??[]).some(id=>map.regions.find(p=>p.regionId===id)?.wardId!==r.wardId));
  add('warning','border-counts',`行政区境界に接する地域: SC ${borders.filter(r=>r.isSupplyCenter).length}/${sc.length}、初期軍 ${borders.filter(r=>r.startingUnit).length}/${armies.length}`);
  return {errors:issues.filter(i=>i.severity==='error').map(i=>i.message),warnings:issues.filter(i=>i.severity==='warning').map(i=>i.message),enabledRegions:playable.length,totalSC:sc.length,totalStartingUnits:armies.length,wardCounts:counts};
}
