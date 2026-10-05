import { finishPlayback } from '../playback-browser-helper';
import { test,expect,type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { datasetSchema,createConfig,type WardId } from '../../packages/shared/model';
import { sampleConfig } from '../../packages/map-core/sample';
import { completeKyotoTestScenario } from '../scenario-fixture';

async function online(page:Page,nickname:string,ward:WardId) {
  await page.goto('/?tool=editor');await page.getByRole('button',{name:'オンライン対戦',exact:true}).click();
  await page.getByLabel('オンラインニックネーム').fill(nickname);await page.getByLabel('オンライン希望区').selectOption(ward);
  await expect(page.getByText('サーバー接続中',{exact:true})).toBeVisible();
}
async function join(page:Page,code:string) {await page.getByLabel('参加ルームコード').fill(code);await page.getByRole('button',{name:'ルームへ参加',exact:true}).click();await expect(page.getByTestId('room-code')).toHaveText(code);}
async function submitOrders(pages:Page[]) {for(const page of pages)await page.getByRole('button',{name:'命令書を確定',exact:true}).click();await finishPlayback(pages);}

test('公式京都設定で3人ロビー・秘密命令・自動年間進行・冬・再読込復帰・hover/選択',async({browser})=>{
  test.setTimeout(90000);
  const dataset=datasetSchema.parse(JSON.parse(await readFile('data/generated/regions.json','utf8'))),config=createConfig(dataset);
  const wards:WardId[]=['26101','26102','26103'];
  const regions=wards.map(ward=>dataset.regions.filter(r=>r.wardId===ward).slice(0,3));
  for(let i=0;i<wards.length;i++)for(let j=0;j<(i<2?3:2);j++) {
    const r=regions[i][j];config.regions[r.regionId]={enabled:true,isSupplyCenter:j!==1,homeWardId:j!==1?wards[i]:null,startingUnit:j===0?{ownerWardId:wards[i],type:'army'}:null};
  }
  for(let i=0;i<3;i++)config.adjacencyAdd.push([regions[i][0].regionId,regions[i][1].regionId]);
  completeKyotoTestScenario(dataset,config);
  const contexts=await Promise.all([browser.newContext(),browser.newContext(),browser.newContext()]),pages=await Promise.all(contexts.map(c=>c.newPage()));
  const errors:string[]=[];for(const p of pages)p.on('pageerror',e=>errors.push(e.message));
  try {
    await pages[0].goto('/?tool=editor');await expect(pages[0].getByText('京都市公式KML · 227国勢統計区',{exact:true})).toBeVisible();
    await pages[0].getByLabel('設定JSONを読込').setInputFiles({name:'online-test-only.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(config))});
    await expect(pages[0].locator('.calculating')).toHaveCount(0);
    await online(pages[0],'Alice',wards[0]);await pages[0].getByRole('button',{name:'ルームを作成',exact:true}).click();
    const code=await pages[0].getByTestId('room-code').innerText();expect(code).toMatch(/^[A-Z2-9]{6}$/);
    await online(pages[1],'Bob',wards[1]);await join(pages[1],code);
    await expect(pages[0].getByRole('button',{name:'オンラインゲーム開始',exact:true})).toBeDisabled();await expect(pages[0].getByText('3人以上必要です',{exact:true})).toBeVisible();
    await online(pages[2],'Carol',wards[2]);await join(pages[2],code);await expect(pages[2].getByRole('button',{name:'オンラインゲーム開始',exact:true})).toHaveCount(0);
    await pages[0].getByRole('button',{name:'オンラインゲーム開始',exact:true}).click();
    for(let i=0;i<3;i++){await expect(pages[i].getByTestId('online-phase')).toHaveText('第1年 · 春 · 移動命令');await expect(pages[i].getByTestId('own-ward')).toHaveText(`あなた: ${['北区','上京区','左京区'][i]}`);await expect(pages[i].getByTestId('victory-target')).toContainText('23か所');await expect(pages[i].getByLabel('オンライン自軍').locator('option')).toHaveCount(1);}
    // Phase 3B: actual online board uses identical fill/opacity for SC and non-SC of each controller.
    for(const group of regions) {
      const styles=await pages[0].locator(`[data-region-id="${group[0].regionId}"], [data-region-id="${group[1].regionId}"]`).evaluateAll(elements=>elements.map(e=>{
        const s=getComputedStyle(e);return {fill:s.fill,opacity:s.opacity,fillOpacity:s.fillOpacity};
      }));
      expect(styles[0]).toEqual(styles[1]);
    }
    // Marker hover uses the underlying playable region and its original ward.
    const marker=pages[0].locator(`[data-marker-region="${regions[0][0].regionId}"] .unit-pin`);await marker.hover();
    await expect(pages[0].getByRole('tooltip')).toContainText(regions[0][0].name);await expect(pages[0].getByRole('tooltip')).toContainText('北区');
    const tooltip=await pages[0].getByRole('tooltip').boundingBox();expect(tooltip!.x).toBeGreaterThanOrEqual(0);expect(tooltip!.x+tooltip!.width).toBeLessThanOrEqual(1500);
    await marker.click();const path=pages[0].locator(`[data-region-id="${regions[0][0].regionId}"]`);
    expect(await path.evaluate(e=>getComputedStyle(e).strokeWidth)).toBe('1.8px');expect(await path.evaluate(e=>getComputedStyle(e).outlineStyle)).toBe('none');
    await pages[0].screenshot({path:'test-results/phase3a-kyoto-selection.png',fullPage:true});
    await pages[0].getByRole('button',{name:'全体に戻す',exact:true}).hover();await expect(pages[0].getByRole('tooltip')).toHaveCount(0);
    await pages[0].getByLabel('オンライン命令種別').selectOption('move');await expect(pages[0].getByLabel('オンライン移動先')).toHaveValue(regions[0][1].regionId);
    await expect(pages[0].locator('.move-line')).toHaveCount(1);await expect(pages[1].locator('.move-line')).toHaveCount(0);await expect(pages[1].getByLabel('自分の命令一覧')).not.toContainText(regions[0][1].name);
    await pages[0].getByRole('button',{name:'命令書を確定',exact:true}).click();
    await expect(pages[1].getByLabel('提出状況')).toContainText('確定済み');await expect(pages[1].getByLabel('直前の公開裁定結果')).toContainText('まだ裁定していません');
    await pages[0].getByRole('button',{name:'確定解除',exact:true}).click();await expect(pages[1].getByLabel('提出状況').locator('[data-status="finalized"]')).toHaveCount(0);
    await pages[0].getByRole('button',{name:'命令書を確定',exact:true}).click();
    // Reload restores finalized own submission; other players still cannot see it.
    await pages[0].reload();await expect(pages[0].getByTestId('room-code')).toHaveText(code);await expect(pages[0].getByRole('button',{name:'確定解除',exact:true})).toBeVisible();await expect(pages[0].getByLabel('自分の命令一覧')).toContainText('Move');
    await expect(pages[1].getByLabel('自分の命令一覧')).not.toContainText('Move');await expect(pages[1].locator('.move-line')).toHaveCount(0);
    await pages[2].getByRole('button',{name:'命令書を確定',exact:true}).click();await expect(pages[2].getByLabel('自分の命令一覧')).toContainText('Hold');
    await pages[1].getByLabel('オンライン命令種別').selectOption('move');await pages[1].getByLabel('オンライン移動先').selectOption(regions[1][1].regionId);
    await pages[1].getByRole('button',{name:'命令書を確定',exact:true}).click();await finishPlayback(pages);
    for(const p of pages){await expect(p.getByTestId('online-phase')).toHaveText('第1年 · 秋 · 移動命令');await expect(p.getByLabel('直前の公開裁定結果')).toContainText('移動');await expect(p.locator('.move-line')).toHaveCount(0);}
    await expect(pages[0].locator(`[data-marker-region="${regions[0][1].regionId}"] .unit-pin`)).toBeVisible();
    // New autumn secret draft remains private while public spring result stays available.
    await pages[0].getByLabel('オンライン命令種別').selectOption('move');await pages[0].getByLabel('オンライン移動先').selectOption(regions[0][0].regionId);
    await expect(pages[0].locator('.move-line')).toHaveCount(1);await expect(pages[1].locator('.move-line')).toHaveCount(0);
    // Keep the home SC empty for a winter Build.
    await pages[0].getByLabel('オンライン命令種別').selectOption('hold');await submitOrders(pages);
    for(const p of pages)await expect(p.getByTestId('online-phase')).toHaveText('第1年 · 冬 · 冬の増減員');
    await expect(pages[2].getByText('このフェイズの提出は不要です。',{exact:true})).toBeVisible();
    await pages[0].getByLabel(`オンラインBuild ${regions[0][0].name}`,{exact:true}).check();
    await pages[0].getByRole('button',{name:'冬調整を確定',exact:true}).click();
    await expect(pages[1].getByLabel('提出状況')).toContainText('確定済み');await expect(pages[1].locator(`[data-marker-region="${regions[0][0].regionId}"] .unit-pin`)).toHaveCount(0);
    // Bob has an empty home SC and chooses 0 Build, still requiring explicit finalization.
    await pages[1].getByRole('button',{name:'冬調整を確定',exact:true}).click();
    for(const p of pages){await expect(p.getByTestId('online-phase')).toHaveText('第2年 · 春 · 移動命令');await expect(p.getByTestId('victory-target')).toContainText('23か所');}
    await expect(pages[0].getByLabel('オンライン自軍').locator('option')).toHaveCount(2);
    await pages[0].screenshot({path:'test-results/phase3a-online-result.png',fullPage:true});expect(errors).toEqual([]);
  }finally {for(const c of contexts)await c.close();}
});

test('架空サンプルでもロビー退出と全モード共通hover・細い選択を確認',async({page})=>{
  await page.route('**/regions.json',r=>r.fulfill({status:404,body:''}));await page.goto('/?tool=editor');
  const config=structuredClone(sampleConfig);config.regions['sample-a'].isSupplyCenter=true;config.regions['sample-a'].startingUnit={ownerWardId:'26101',type:'army'};
  await page.getByLabel('設定JSONを読込').setInputFiles({name:'hover-sample.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(config))});await expect(page.locator('.calculating')).toHaveCount(0);
  for(const mode of ['編集モード','ゲームプレビュー','ルールサンドボックス','年間進行（ローカル）']) {
    await page.getByRole('button',{name:mode,exact:true}).click();const marker=page.locator('[data-marker-region="sample-a"] .unit-pin');await marker.hover();await expect(page.getByRole('tooltip')).toContainText('架空地域A');await marker.click();
    expect(await page.locator('[data-region-id="sample-a"]').evaluate(e=>getComputedStyle(e).strokeWidth)).toBe('1.8px');await page.getByRole('button',{name:'全体に戻す',exact:true}).hover();await expect(page.getByRole('tooltip')).toHaveCount(0);
  }
  await page.getByRole('button',{name:'オンライン対戦',exact:true}).click();await page.getByLabel('オンラインニックネーム').fill('samplehost');await page.getByRole('button',{name:'ルームを作成',exact:true}).click();await expect(page.getByTestId('room-code')).toBeVisible();
  await page.getByRole('button',{name:'開始前に退出',exact:true}).click();await expect(page.getByRole('button',{name:'ルームを作成',exact:true})).toBeVisible();
});

test('オンライン秘密撤退・支援・必要Disband・最終年停止',async({browser})=>{
  test.setTimeout(90000);
  const dataset=datasetSchema.parse(JSON.parse(await readFile('data/generated/regions.json','utf8'))),config=createConfig(dataset);
  const wards:WardId[]=['26101','26102','26103'],regions=wards.map(ward=>dataset.regions.filter(r=>r.wardId===ward).slice(0,2));
  for(let i=0;i<3;i++)for(let j=0;j<2;j++)config.regions[regions[i][j].regionId]={enabled:true,isSupplyCenter:j===0,homeWardId:j===0?wards[i]:null,startingUnit:j===0?{ownerWardId:wards[i],type:'army'}:null};
  config.regions[regions[0][1].regionId].startingUnit={ownerWardId:'26101',type:'army'};
  config.adjacencyAdd=[[regions[0][0].regionId,regions[1][0].regionId],[regions[0][1].regionId,regions[1][0].regionId],[regions[1][0].regionId,regions[1][1].regionId]];
  completeKyotoTestScenario(dataset,config);
  const contexts=await Promise.all([browser.newContext(),browser.newContext(),browser.newContext()]),pages=await Promise.all(contexts.map(c=>c.newPage()));
  try {
    await pages[0].goto('/?tool=editor');await pages[0].getByLabel('設定JSONを読込').setInputFiles({name:'retreat-test-only.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(config))});await expect(pages[0].locator('.calculating')).toHaveCount(0);
    await online(pages[0],'Attack','26101');await pages[0].getByRole('button',{name:'ルームを作成',exact:true}).click();const code=await pages[0].getByTestId('room-code').innerText();
    for(let i=1;i<3;i++){await online(pages[i],`Defend${i}`,wards[i]);await join(pages[i],code);}
    await pages[0].getByRole('button',{name:'オンラインゲーム開始',exact:true}).click();await expect(pages[0].getByTestId('online-phase')).toContainText('春 · 移動命令');
    await pages[0].getByLabel('オンライン自軍').selectOption(`initial-${regions[0][0].regionId}`);await pages[0].getByLabel('オンライン命令種別').selectOption('move');await pages[0].getByLabel('オンライン移動先').selectOption(regions[1][0].regionId);
    await pages[0].getByLabel('オンライン自軍').selectOption(`initial-${regions[0][1].regionId}`);await pages[0].getByLabel('オンライン命令種別').selectOption('support-move');await pages[0].getByLabel('オンライン支援対象').selectOption(`initial-${regions[0][0].regionId}`);await pages[0].getByLabel('オンライン移動先').selectOption(regions[1][0].regionId);
    await expect(pages[0].locator('.support-line')).toHaveCount(1);await expect(pages[1].locator('.support-line')).toHaveCount(0);await submitOrders(pages);
    for(const p of pages){await expect(p.getByTestId('online-phase')).toHaveText('第1年 · 春 · 撤退');await expect(p.getByText('撤退フェイズ中は交渉禁止',{exact:true})).toBeVisible();}
    await expect(pages[0].getByText('このフェイズの提出は不要です。',{exact:true})).toBeVisible();await pages[1].getByLabel('オンライン秘密撤退先').selectOption(regions[1][1].regionId);
    await expect(pages[0].getByLabel('オンライン秘密撤退先')).toHaveCount(0);await expect(pages[0].locator(`[data-marker-region="${regions[1][1].regionId}"] .unit-pin`)).toHaveCount(0);
    await pages[1].reload();await expect(pages[1].getByLabel('オンライン秘密撤退先')).toHaveValue(regions[1][1].regionId);
    await pages[1].getByRole('button',{name:'撤退命令書を確定',exact:true}).click();for(const p of pages)await expect(p.getByTestId('online-phase')).toHaveText('第1年 · 秋 · 移動命令');
    await expect(pages[0].getByLabel('直前の公開裁定結果')).toContainText('撤退結果');await expect(pages[1].locator(`[data-region-id="${regions[1][1].regionId}"]`)).toHaveAttribute('data-controller-ward-id','26102');
    await pages[1].screenshot({path:'test-results/phase3a-retreat-result.png',fullPage:true});await submitOrders(pages);
    for(const p of pages)await expect(p.getByTestId('online-phase')).toHaveText('第1年 · 冬 · 冬の増減員');
    // The Phase 4B fixture places every starting army on SC; the attacker's emptied SC now permits a build.
    await pages[0].getByRole('button',{name:'冬調整を確定',exact:true}).click();
    await pages[1].getByRole('button',{name:'冬調整を確定',exact:true}).click();await expect(pages[1].getByRole('alert')).toContainText('必要解散数1体');
    await pages[1].getByLabel(`オンラインDisband ${regions[1][1].name}`,{exact:true}).check();await pages[1].getByRole('button',{name:'冬調整を確定',exact:true}).click();
    for(const p of pages){await expect(p.getByTestId('online-phase')).toHaveText('第1年 · 冬 · 終了');await expect(p.getByLabel('ゲーム終了結果')).toContainText('脱落発生により終了');await expect(p.getByLabel('提出状況')).toContainText('脱落');}
  }finally {await Promise.all(contexts.map(c=>c.close()));}
});
