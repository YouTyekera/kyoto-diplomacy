import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { sampleConfig } from '../../packages/map-core/sample';
import type { MapConfig } from '../../packages/shared/model';
import type { GameStatePreview } from '../../packages/shared/preview';

async function save(page:Page,button:string) {
  const promise=page.waitForEvent('download');await page.getByRole('button',{name:button,exact:true}).click();
  const result=await promise;return JSON.parse(await readFile((await result.path())!,'utf8'));
}
async function importConfig(page:Page,config:MapConfig) {
  await page.getByLabel('設定JSONを読込').setInputFiles({name:'phase2b.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(config))});
  await expect(page.locator('.calculating')).toHaveCount(0);
}
async function sample(page:Page,config:MapConfig) {
  await page.route('**/regions.json',r=>r.fulfill({status:404,body:''}));await page.goto('/?tool=editor');
  await expect(page.getByText('採用 4 / 4',{exact:true})).toBeVisible();await importConfig(page,config);
  await page.getByRole('button',{name:'ゲームプレビュー',exact:true}).click();
  await page.getByRole('button',{name:'マップ設定からPreviewを再生成',exact:true}).click();
}
async function start(page:Page) {
  await page.getByRole('button',{name:'年間進行（ローカル）',exact:true}).click();
  await page.getByLabel('公開イベントを有効にする（検証用）').uncheck();
  await page.getByRole('button',{name:'現在のPreviewから開始',exact:true}).click();
  await expect(page.getByTestId('game-phase')).toHaveText('第1年 · 春 · 移動命令');
}
async function next(page:Page) {await page.getByRole('button',{name:'次へ進む',exact:true}).click();}
async function season(page:Page,seasonName:'春'|'秋') {
  await page.getByRole('button',{name:'年間の未入力をHoldにする',exact:true}).click();
  await page.getByRole('button',{name:'移動を裁定',exact:true}).click();
  await expect(page.getByTestId('game-phase')).toContainText(`${seasonName} · 撤退`);
  await next(page);await expect(page.getByTestId('game-phase')).toContainText(`${seasonName} · 補給拠点の所有権更新`);
  await next(page);
}
test('年間進行で初期地点SCへBuildし、次年へ進み、元Previewと静的設定を保持',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const config=structuredClone(sampleConfig);config.regions['sample-a'].isSupplyCenter=true;config.regions['sample-b'].isSupplyCenter=true;
  config.regions['sample-a'].startingUnit={ownerWardId:'26101',type:'army'};
  await sample(page,config);const before=await save(page,'Preview JSONを保存');await start(page);
  await page.getByRole('button',{name:'移動を裁定',exact:true}).click();await expect(page.getByRole('alert')).toContainText('missing-order');
  await page.getByLabel('年間命令種別').selectOption('move');await page.getByLabel('年間移動先').selectOption('sample-c');
  await expect(page.locator('.move-line')).toHaveCount(1);
  await page.getByRole('button',{name:'移動を裁定',exact:true}).click();
  await expect(page.locator('[data-region-id="sample-c"]')).toHaveAttribute('data-controller-ward-id','26101');
  await expect(page.locator('[data-supply-region="sample-a"] .supply-marker')).toHaveAttribute('data-supply-owner','neutral');
  await next(page);await expect(page.getByTestId('game-phase')).toContainText('春 · 補給拠点の所有権更新');await next(page);
  await expect(page.getByTestId('game-phase')).toHaveText('第1年 · 秋 · 移動命令');
  await expect(page.locator('.sc-changes')).toContainText('中立 → 北区');
  await expect(page.locator('[data-supply-region="sample-a"] .supply-marker')).toHaveAttribute('data-supply-owner','26101');
  // Switching modes retains the session and its order form without changing the Preview.
  await page.getByRole('button',{name:'ゲームプレビュー',exact:true}).click();expect(await save(page,'Preview JSONを保存')).toEqual(before);
  await page.getByRole('button',{name:'年間進行（ローカル）',exact:true}).click();
  await season(page,'秋');await expect(page.getByTestId('game-phase')).toHaveText('第1年 · 冬 · 冬の増減員');
  await expect(page.locator('.game-session')).toContainText('増員可能 1体 · 必要解散 0体');
  await page.getByLabel('Build 架空地域A',{exact:true}).check();await page.getByRole('button',{name:'冬の増減員を確定',exact:true}).click();
  await expect(page.getByTestId('game-phase')).toContainText('冬後の脱落・年末判定');
  await expect(page.locator('.unit-pin')).toHaveCount(2);await expect(page.locator('.unit-marker rect')).toHaveCount(0);
  await expect(page.locator('[data-supply-region="sample-a"] .supply-circle')).toHaveCount(1);
  await expect(page.locator('.marker-leader')).toHaveCount(0);
  await page.screenshot({path:'test-results/phase2b-winter-build.png',fullPage:true});
  await next(page);await expect(page.getByTestId('game-phase')).toHaveText('第2年 · 春 · 移動命令');
  await page.getByRole('button',{name:'年間進行を初期状態へリセット',exact:true}).click();
  await expect(page.getByTestId('game-phase')).toHaveText('第1年 · 春 · 移動命令');await expect(page.locator('.unit-pin')).toHaveCount(1);
  await page.getByRole('button',{name:'ゲームプレビュー',exact:true}).click();expect(await save(page,'Preview JSONを保存')).toEqual(before);
  expect(await save(page,'設定JSONを保存')).toEqual(config);expect(errors).toEqual([]);
});
test('冬は不足するDisbandを自動選択せず、指定軍を解散して元支配を維持',async({page})=>{
  const config=structuredClone(sampleConfig);config.regions['sample-a'].isSupplyCenter=true;
  for(const id of ['sample-a','sample-c']) config.regions[id].startingUnit={ownerWardId:'26101',type:'army'};
  await sample(page,config);await start(page);
  await page.getByLabel('年間進行ユニット').selectOption('preview-sample-c');
  await page.getByLabel('年間命令種別').selectOption('move');await page.getByLabel('年間移動先').selectOption('sample-d');
  await season(page,'春');await season(page,'秋');
  await page.getByRole('button',{name:'冬の増減員を確定',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('必要解散数1体に対して0体');
  await expect(page.getByTestId('game-phase')).toContainText('冬の増減員');await expect(page.locator('.unit-marker')).toHaveCount(2);
  await page.getByLabel('Disband 架空地域D · 北区',{exact:true}).check();
  await page.getByRole('button',{name:'冬の増減員を確定',exact:true}).click();
  await expect(page.locator('.unit-marker')).toHaveCount(1);
  await expect(page.locator('[data-marker-region="sample-d"] .unit-marker')).toHaveCount(0);
  await expect(page.locator('[data-region-id="sample-d"]')).toHaveAttribute('data-controller-ward-id','26101');
  await page.screenshot({path:'test-results/phase2b-winter-disband.png',fullPage:true});
  await next(page);await expect(page.getByTestId('game-phase')).toHaveText('第2年 · 春 · 移動命令');
});
test('年間の秘密撤退はcontrollerを更新せず、退却後の春SC更新までSC所有を保持',async({page})=>{
  const config=structuredClone(sampleConfig);config.regions['sample-b'].isSupplyCenter=true;config.adjacencyAdd=[['sample-b','sample-c']];
  for(const [id,owner] of [['sample-a','26101'],['sample-b','26102'],['sample-c','26101']] as const) config.regions[id].startingUnit={ownerWardId:owner,type:'army'};
  await sample(page,config);const preview=await save(page,'Preview JSONを保存');
  preview.regionControl['sample-b'].controllerWardId='26102';preview.regionControl['sample-b'].supplyCenterOwnerWardId='26102';preview.regionControl['sample-d'].controllerWardId='26101';
  await page.getByLabel('Preview JSONを読込').setInputFiles({name:'control.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(preview))});
  await start(page);await page.getByLabel('年間進行ユニット').selectOption('preview-sample-a');
  await page.getByLabel('年間命令種別').selectOption('move');await page.getByLabel('年間移動先').selectOption('sample-b');
  await page.locator('[data-marker-region="sample-a"] .unit-pin').hover();await expect(page.locator('.map-footer')).toContainText('命令: move');
  await page.getByLabel('年間進行ユニット').selectOption('preview-sample-c');
  await page.getByLabel('年間命令種別').selectOption('support-move');await page.getByLabel('年間支援対象').selectOption('preview-sample-a');
  await page.getByLabel('年間移動先').selectOption('sample-b');await page.getByRole('button',{name:'年間の未入力をHoldにする',exact:true}).click();
  await page.getByRole('button',{name:'移動を裁定',exact:true}).click();
  await expect(page.locator('[data-region-id="sample-b"]')).toHaveAttribute('data-controller-ward-id','26101');
  await expect(page.locator('[data-supply-region="sample-b"] .supply-marker')).toHaveAttribute('data-supply-owner','26102');
  await expect(page.getByRole('button',{name:'次へ進む',exact:true})).toBeDisabled();
  await page.getByLabel('年間秘密撤退先').selectOption('sample-d');
  await expect(page.locator('[data-marker-region="sample-d"] .unit-marker')).toHaveCount(0);await expect(page.locator('.order-line')).toHaveCount(0);
  await page.getByRole('button',{name:'年間撤退を同時解決',exact:true}).click();
  await expect(page.locator('[data-marker-region="sample-d"] .unit-marker')).toHaveAttribute('data-unit-owner','26102');
  await expect(page.locator('[data-region-id="sample-d"]')).toHaveAttribute('data-controller-ward-id','26101');
  await next(page);await expect(page.getByTestId('game-phase')).toContainText('春 · 補給拠点の所有権更新');await next(page);
  await expect(page.locator('[data-supply-region="sample-b"] .supply-marker')).toHaveAttribute('data-supply-owner','26101');
});
test('京都のピンとSC同居・御苑全体の塗り、春17SCで即勝利',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?tool=editor');await expect(page.locator('.calculating')).toHaveCount(0);const config=await save(page,'設定JSONを保存') as MapConfig;
  const ids=Object.keys(config.regions).filter(id=>id.startsWith('kyoto-26102-'));
  for(const id of ids) {config.regions[id].enabled=true;config.regions[id].isSupplyCenter=true;}
  config.regions['kyoto-26102-13'].startingUnit={ownerWardId:'26102',type:'army'};await importConfig(page,config);
  await page.getByLabel('行政区フィルター').selectOption('26102');await page.getByRole('button',{name:/選択(?:区|地域)を拡大/}).click();
  const pin=page.locator('[data-marker-region="kyoto-26102-13"] .unit-pin');await expect(pin).toHaveAttribute('d',/C/);
  await expect(page.locator('.unit-marker rect')).toHaveCount(0);await expect(page.locator('.unit-marker text')).toHaveCount(0);
  const obstacle=page.locator('[data-obstacle-id="kyoto-gyoen-game-obstacle"] .obstacle-fill');
  await expect(obstacle).toHaveAttribute('fill','#354640');await expect(obstacle).toHaveAttribute('fill-opacity','0.6');
  expect(await obstacle.getAttribute('d')).toBe(await page.locator('.obstacle-hatching').getAttribute('d'));
  const box=(await obstacle.boundingBox())!;expect(box.width).toBeGreaterThan(50);expect(box.height).toBeGreaterThan(50);
  await page.screenshot({path:'test-results/phase2b-gyoen-pin.png',fullPage:true});
  await page.getByRole('button',{name:'ゲームプレビュー',exact:true}).click();await page.getByRole('button',{name:'マップ設定からPreviewを再生成',exact:true}).click();
  const preview=await save(page,'Preview JSONを保存') as GameStatePreview;
  for(const id of ids.slice(0,2))preview.regionControl[id].supplyCenterOwnerWardId='26101';
  await page.getByLabel('Preview JSONを読込').setInputFiles({name:'rival-sc.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(preview))});
  await page.getByRole('button',{name:'年間進行（ローカル）',exact:true}).click();await page.getByLabel('参加勢力 北区').check();await page.getByRole('button',{name:'現在のPreviewから開始',exact:true}).click();
  await season(page,'春');await expect(page.getByTestId('game-phase')).toHaveText('第1年 · 春 · 終了');
  await expect(page.locator('.game-result')).toContainText('上京区の勝利');await expect(page.locator('.game-result')).toContainText('勝利条件達成');
  await expect(page.locator('.supply-circle')).toHaveCount(17);await expect(page.locator('.marker-leader')).toHaveCount(0);
  await page.screenshot({path:'test-results/phase2b-victory.png',fullPage:true});expect(errors).toEqual([]);
});
test('古い御苑境界の注意を表示し、明示読込まで保存設定を置換しない',async({page})=>{
  await page.goto('/?tool=editor');await expect(page.locator('.calculating')).toHaveCount(0);const config=await save(page,'設定JSONを保存') as MapConfig;
  const gyoen=config.obstacles[0];if(gyoen.geometry.type!=='Polygon') throw new Error('fixture');
  const ring=gyoen.geometry.coordinates[0];ring[0][1]=35.025;ring[1][1]=35.025;ring[ring.length-1][1]=35.025;
  await importConfig(page,config);await expect(page.locator('.gyoen-notice')).toContainText('標準案と異なります');
  expect((await save(page,'設定JSONを保存')).obstacles).toEqual(config.obstacles);
  await page.getByRole('button',{name:'御苑のゲーム用境界案を読み込む',exact:true}).click();
  await expect(page.locator('.calculating')).toHaveCount(0);await expect(page.locator('.gyoen-notice')).toHaveCount(0);
  expect((await save(page,'設定JSONを保存')).obstacles[0].geometry.coordinates[0][0][1]).toBe(35.0173548653);
});
test('冬清算後の脱落年で終了対象を表示し、次年へ進めない',async({page})=>{
  const config=structuredClone(sampleConfig);config.regions['sample-a'].isSupplyCenter=true;
  config.regions['sample-a'].startingUnit={ownerWardId:'26101',type:'army'};
  await sample(page,config);const preview=await save(page,'Preview JSONを保存');preview.regionControl['sample-a'].controllerWardId=null;
  await page.getByLabel('Preview JSONを読込').setInputFiles({name:'neutral.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(preview))});
  await start(page);await season(page,'春');await season(page,'秋');
  await page.getByLabel('Disband 架空地域A · 北区',{exact:true}).check();
  await page.getByRole('button',{name:'冬の増減員を確定',exact:true}).click();await next(page);
  await expect(page.getByTestId('game-phase')).toHaveText('第1年 · 冬 · 終了');
  await expect(page.locator('.game-result')).toContainText('脱落発生により終了');await expect(page.locator('.game-result')).toContainText('北区が脱落: 所有する補給拠点が0か所');
  await expect(page.getByRole('button',{name:'次へ進む',exact:true})).toHaveCount(0);
  await page.screenshot({path:'test-results/phase2b-final-year.png',fullPage:true});
});
