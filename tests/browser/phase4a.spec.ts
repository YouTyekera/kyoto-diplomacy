import { test,expect,type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { sampleConfig,sampleDataset } from '../../packages/map-core/sample';
import { compileMap } from '../../packages/map-core/compile';
import { createPreview } from '../../packages/shared/preview';
import { createConfig,datasetSchema,type MapConfig,type WardId } from '../../packages/shared/model';
import { createGameSession,adjudicateGameOrders,adjudicateGameRetreats,advanceGame,type GameResponse } from '../../packages/game-core';
import type { EventType } from '../../packages/shared/events';
import { completeKyotoTestScenario } from '../scenario-fixture';

const ok=<T>(r:GameResponse<T>)=>{if(!r.ok)throw new Error(r.errors.join(';'));return r.result;};
function localConfig(){const c=structuredClone(sampleConfig);c.regions['sample-a'].isSupplyCenter=true;c.regions['sample-a'].startingUnit={ownerWardId:'26101',type:'army'};return c;}
function seedFor(type:EventType,withAutumnBarrier=false){
  const map=compileMap(sampleDataset,localConfig()).map,board=createPreview(map);
  for(let i=0;i<2000;i++){
    const seed=`e2e-local-${i}`,state=ok(createGameSession(map,board,['26101'],null,15,{seed})),event=state.events.current[0];if(event?.type!==type)continue;
    if(type==='roadwork'&&event.edge?.a!=='sample-a')continue;if(type==='bus'&&event.edge?.a!=='sample-a')continue;
    if(withAutumnBarrier){if(event.regionId!=='sample-b')continue;let next=ok(adjudicateGameOrders(map,state,[{type:'move',unitId:'preview-sample-a',destination:'sample-b'}]));next=ok(adjudicateGameRetreats(map,next,[]));next=ok(advanceGame(map,next));next=ok(advanceGame(map,next));if(next.events.current[0]?.type!=='barricade'||next.events.current[0].regionId!=='sample-c')continue;}
    return {seed,event};
  }throw new Error('fixture seed missing');
}
async function local(page:Page,seed:string){
  await page.route('**/regions.json',r=>r.fulfill({status:404,body:''}));await page.goto('/?tool=editor');await page.getByLabel('設定JSONを読込').setInputFiles({name:'event-local.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(localConfig()))});await expect(page.locator('.calculating')).toHaveCount(0);
  await page.getByRole('button',{name:'ゲームプレビュー',exact:true}).click();await page.getByRole('button',{name:'マップ設定からPreviewを再生成',exact:true}).click();await page.getByRole('button',{name:'年間進行（ローカル）',exact:true}).click();
  await expect(page.getByLabel('公開イベントを有効にする（検証用）')).toBeChecked();await page.getByLabel('イベントseed').fill(seed);await page.getByRole('button',{name:'現在のPreviewから開始',exact:true}).click();await expect(page.getByTestId('game-phase')).toHaveText('第1年 · 春 · 移動命令');
}
async function next(page:Page){await page.getByRole('button',{name:'次へ進む',exact:true}).click();}
async function localSeasonEnd(page:Page){await page.getByRole('button',{name:'移動を裁定',exact:true}).click();await next(page);await next(page);}

test('ローカルで春の取得→秋の自転車→次春設置→次秋封鎖を同じcoreで実行',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await local(page,seedFor('bicycle',true).seed);
  await expect(page.getByTestId('current-events').locator('[data-event-type="bicycle"]')).toHaveCount(1);await expect(page.locator('[data-ground-region="sample-b"]')).toBeVisible();
  await page.locator('[data-ground-region="sample-b"]').hover();await expect(page.getByRole('tooltip')).toContainText('架空地域B');await page.getByRole('button',{name:'全体に戻す',exact:true}).hover();
  await page.getByLabel('年間命令種別').selectOption('move');await page.getByLabel('年間移動先').selectOption('sample-b');await localSeasonEnd(page);
  await expect(page.locator('[data-inventory-ward="26101"] [data-equipment-type="bicycle"]')).toHaveText('1');await expect(page.locator('[data-ground-region="sample-b"]')).toHaveCount(0);
  await page.getByLabel('年間命令種別').selectOption('bicycle-move');await page.getByLabel('年間自転車経由').selectOption('sample-a');await page.getByLabel('年間自転車移動先').selectOption('sample-c');await expect(page.locator('.bicycle-line')).toHaveCount(1);await localSeasonEnd(page);
  await expect(page.getByTestId('game-phase')).toHaveText('第1年 · 冬 · 冬の増減員');await expect(page.locator('[data-inventory-ward="26101"] [data-equipment-type="barricade"]')).toHaveText('1');
  await page.getByRole('button',{name:'冬の増減員を確定',exact:true}).click();await next(page);await expect(page.getByTestId('game-phase')).toHaveText('第2年 · 春 · 移動命令');
  await page.getByLabel('年間命令種別').selectOption('deploy-barricade');await page.getByLabel('年間バリケード対象').selectOption('sample-d');await localSeasonEnd(page);
  await expect(page.getByTestId('game-phase')).toHaveText('第2年 · 秋 · 移動命令');await expect(page.locator('[data-event-edge="barricade"]')).toHaveCount(1);await expect(page.getByLabel('有効バリケード')).toContainText('残り4季');
  await page.getByLabel('年間命令種別').selectOption('move');await expect(page.getByLabel('年間移動先').locator('option[value="sample-d"]')).toHaveCount(0);
  await page.screenshot({path:'test-results/phase4a-local-equipment.png',fullPage:true});expect(errors).toEqual([]);
});

test('道路工事は合法Moveから除外され、撤退終了後に表示・隣接を復元',async({page})=>{
  const {seed,event}=seedFor('roadwork');await local(page,seed);await expect(page.locator('[data-event-edge="roadwork"]')).toHaveCount(1);
  await page.getByLabel('年間命令種別').selectOption('move');await expect(page.getByLabel('年間移動先').locator(`option[value="${event.edge!.b}"]`)).toHaveCount(0);
  await page.getByLabel('年間命令種別').selectOption('hold');await page.getByRole('button',{name:'この年間命令を確定',exact:true}).click();await page.getByRole('button',{name:'移動を裁定',exact:true}).click();await expect(page.locator('[data-event-edge="roadwork"]')).toHaveCount(1);await next(page);await expect(page.locator('[data-event-edge="roadwork"]')).toHaveCount(0);
  await page.screenshot({path:'test-results/phase4a-roadwork.png',fullPage:true});
});

test('臨時バスが非隣接へのMoveを可能にし、撤退終了で消える',async({page})=>{
  const {seed,event}=seedFor('bus');await local(page,seed);await expect(page.locator('[data-event-edge="bus"]')).toHaveCount(1);
  await page.getByLabel('年間命令種別').selectOption('move');await page.getByLabel('年間移動先').selectOption(event.edge!.b);await page.getByRole('button',{name:'移動を裁定',exact:true}).click();await expect(page.locator(`[data-marker-region="${event.edge!.b}"] .unit-pin`)).toBeVisible();await expect(page.locator('[data-event-edge="bus"]')).toHaveCount(1);await next(page);await expect(page.locator('[data-event-edge="bus"]')).toHaveCount(0);
  await page.screenshot({path:'test-results/phase4a-bus.png',fullPage:true});
});

async function entry(page:Page,nickname:string,ward:WardId){await page.getByRole('button',{name:'オンライン対戦',exact:true}).click();await page.getByLabel('オンラインニックネーム').fill(nickname);await page.getByLabel('オンライン希望区').selectOption(ward);await expect(page.getByText('サーバー接続中',{exact:true})).toBeVisible();}
async function finalize(pages:Page[]){for(const p of pages)await p.getByRole('button',{name:'命令書を確定',exact:true}).click();}
test('オンライン3人へイベント公開、装備取得、自転車予約・復帰・秘密裁定、次季節の封鎖',async({browser})=>{
  test.setTimeout(120000);
  const dataset=datasetSchema.parse(JSON.parse(await readFile('data/generated/regions.json','utf8'))),config:MapConfig=createConfig(dataset),wards:WardId[]=['26101','26102','26103'];
  const groups=wards.map(w=>dataset.regions.filter(r=>r.wardId===w).slice(0,4)),scs=groups.map(g=>g[0].regionId),nonSC=groups.flatMap(g=>g.slice(1).map(r=>r.regionId));
  for(const [i,group] of groups.entries())for(const [j,r] of group.entries())config.regions[r.regionId]={enabled:true,isSupplyCenter:j===0,homeWardId:j===0?wards[i]:null,startingUnit:j===0?{ownerWardId:wards[i],type:'army'}:null};
  config.adjacencyAdd=scs.flatMap(a=>nonSC.map(b=>[a,b] as [string,string]));const desired=new Set(config.adjacencyAdd.map(([a,b])=>[a,b].sort().join('|')));
  const compiled=compileMap(dataset,config).map;config.adjacencyRemove=Object.entries(compiled.adjacency).flatMap(([a,neighbors])=>neighbors.filter(b=>a<b&&!desired.has([a,b].sort().join('|'))).map(b=>[a,b] as [string,string]));
  completeKyotoTestScenario(dataset,config);
  const contexts=await Promise.all([browser.newContext(),browser.newContext(),browser.newContext()]),pages=await Promise.all(contexts.map(c=>c.newPage())),errors:string[]=[];
  const otherPackets:string[]=[];
  for(const p of pages)p.on('pageerror',e=>errors.push(e.message));pages[1].on('websocket',ws=>ws.on('framereceived',f=>{const payload=String(f.payload);if(payload.startsWith('42["publicState"'))otherPackets.push(payload);}));
  try{
    for(const p of pages)await p.goto('/?tool=editor');await pages[0].getByLabel('設定JSONを読込').setInputFiles({name:'events-online-only.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(config))});await expect(pages[0].locator('.calculating')).toHaveCount(0);
    for(let i=0;i<3;i++)await entry(pages[i],['event-host','event-blue','event-green'][i],wards[i]);await pages[0].getByRole('button',{name:'ルームを作成',exact:true}).click();const code=await pages[0].getByTestId('room-code').innerText();
    for(let i=1;i<3;i++){await pages[i].getByLabel('参加ルームコード').fill(code);await pages[i].getByRole('button',{name:'ルームへ参加',exact:true}).click();await expect(pages[i].getByTestId('room-code')).toHaveText(code);}
    await pages[0].getByRole('button',{name:'オンラインゲーム開始',exact:true}).click();for(const p of pages){await expect(p.getByTestId('online-phase')).toHaveText('第1年 · 春 · 移動命令');await expect(p.getByTestId('current-events')).toContainText('自転車');}
    const target=(await pages[0].locator('[data-ground-equipment="bicycle"]').getAttribute('data-ground-region'))!;
    for(const p of pages)await expect(p.locator(`[data-ground-region="${target}"]`)).toBeVisible();
    await pages[0].getByLabel('オンライン命令種別').selectOption('move');await pages[0].getByLabel('オンライン移動先').selectOption(target);await finalize(pages);
    for(const p of pages){await expect(p.getByTestId('online-phase')).toHaveText('第1年 · 秋 · 移動命令');await expect(p.locator('[data-inventory-ward="26101"] [data-equipment-type="bicycle"]')).toHaveText('1');}
    const wallRegion=(await pages[0].locator('[data-ground-equipment="barricade"]').getAttribute('data-ground-region'))!;
    await pages[0].getByLabel('オンライン命令種別').selectOption('bicycle-move');await pages[0].getByLabel('オンライン自転車経由').selectOption(scs[0]);await pages[0].getByLabel('オンライン自転車移動先').selectOption(wallRegion);
    await expect(pages[0].locator('.bicycle-line')).toHaveCount(1);await expect(pages[1].locator('.bicycle-line')).toHaveCount(0);await expect(pages[1].getByLabel('自分の命令一覧')).not.toContainText('Bicycle');
    await pages[0].getByLabel('自分の装備と予約').locator('summary').click();await expect(pages[0].getByLabel('自分の装備と予約')).toContainText('今季予約');await expect(pages[1].getByLabel('自分の装備と予約')).not.toContainText('今季予約');
    await pages[0].getByRole('button',{name:'命令書を確定',exact:true}).click();await expect(pages[0].getByRole('button',{name:'確定解除',exact:true})).toBeVisible();await pages[0].reload();await expect(pages[0].getByRole('button',{name:'確定解除',exact:true})).toBeVisible();await expect(pages[0].locator('.bicycle-line')).toHaveCount(1);
    expect(otherPackets.length).toBeGreaterThan(0);expect(otherPackets.every(p=>!p.includes('"reservations"')&&!p.includes('"bicycle-move"')&&!p.includes('"viaRegionId"'))).toBe(true);
    await finalize(pages.slice(1));for(const p of pages)await expect(p.getByTestId('online-phase')).toHaveText('第2年 · 春 · 移動命令');
    await expect(pages[0].getByLabel('直前の公開裁定結果').locator('[data-equipment-result="bicycle"]')).toContainText('両区間成功');await expect(pages[0].locator(`[data-marker-region="${wallRegion}"] .unit-pin`)).toBeVisible();
    await pages[0].getByLabel('オンライン命令種別').selectOption('deploy-barricade');await pages[0].getByLabel('オンラインバリケード対象').selectOption(scs[0]);await expect(pages[1].getByLabel('自分の命令一覧')).not.toContainText('Deploy');await finalize(pages);
    for(const p of pages){await expect(p.getByTestId('online-phase')).toHaveText('第2年 · 秋 · 移動命令');await expect(p.getByLabel('有効バリケード')).toContainText('残り4季');}
    await pages[0].getByLabel('オンライン命令種別').selectOption('move');await expect(pages[0].getByLabel('オンライン移動先').locator(`option[value="${scs[0]}"]`)).toHaveCount(0);await expect(pages[0].locator('[data-event-edge="barricade"]')).toHaveCount(1);
    await pages[0].screenshot({path:'test-results/phase4a-online-equipment.png',fullPage:true});expect(errors).toEqual([]);
  }finally{for(const c of contexts)await c.close();}
});
