import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { sampleConfig } from '../../packages/map-core/sample';

async function downloadJson(page:Page, name:string) {
  const promise=page.waitForEvent('download');await page.getByRole('button',{name,exact:true}).click();
  const download=await promise;return JSON.parse(await readFile((await download.path())!,'utf8'));
}
async function sampleWithUnits(page:Page) {
  await page.route('**/regions.json',r=>r.fulfill({status:404,body:''}));await page.goto('/?tool=editor');
  await expect(page.getByText('採用 4 / 4',{exact:true})).toBeVisible();
  const config=structuredClone(sampleConfig);
  config.regions['sample-a'].startingUnit={ownerWardId:'26101',type:'army'};
  config.regions['sample-b'].startingUnit={ownerWardId:'26102',type:'army'};
  config.regions['sample-c'].startingUnit={ownerWardId:'26101',type:'army'};
  config.regions['sample-b'].isSupplyCenter=true;
  config.adjacencyAdd=[['sample-b','sample-c']];
  await page.getByLabel('設定JSONを読込').setInputFiles({name:'sandbox.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(config))});
  await expect(page.locator('.calculating')).toHaveCount(0);
  await page.getByRole('button',{name:'ゲームプレビュー',exact:true}).click();
  // Explicit display-only initializer loads the edited static starting placements.
  await page.getByRole('button',{name:'マップ設定からPreviewを再生成',exact:true}).click();
}
test('京都全体でもアンカーから押し出さず、円形SCと小型Army、semantic zoom',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?tool=editor');await expect(page.locator('.calculating')).toHaveCount(0);
  const config=await downloadJson(page,'設定JSONを保存');
  const ids=Object.keys(config.regions).filter(id=>id.startsWith('kyoto-26102-'));
  for(const id of ids) {config.regions[id].enabled=true;config.regions[id].isSupplyCenter=true;config.regions[id].startingUnit={ownerWardId:'26102',type:'army'};}
  await page.getByLabel('設定JSONを読込').setInputFiles({name:'markers.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(config))});
  await expect(page.locator('.calculating')).toHaveCount(0);
  await page.getByRole('button',{name:'ゲームプレビュー',exact:true}).click();
  await page.getByRole('button',{name:'マップ設定からPreviewを再生成',exact:true}).click();
  await expect(page.locator('.unit-marker')).toHaveCount(ids.length);
  await expect(page.locator('.supply-circle')).toHaveCount(ids.length);
  await expect(page.locator('.marker-leader')).toHaveCount(0);
  await expect(page.locator('.unit-marker text')).toHaveCount(0);
  await expect(page.locator('.region-marker-label')).toHaveCount(0);
  const anchorsCorrect=await page.locator('.region-marker').evaluateAll(groups=>groups.every(g=>{
    const c=g.querySelector('.marker-anchor')!,position=g.querySelector('.token-position')!.getAttribute('transform')!;
    return position.startsWith(`translate(${c.getAttribute('cx')} ${c.getAttribute('cy')})`);
  }));expect(anchorsCorrect).toBe(true);
  await page.screenshot({path:'test-results/phase2a-map-overview.png',fullPage:true});
  await page.getByLabel('行政区フィルター').selectOption('26102');
  await page.getByRole('button',{name:/選択(?:区|地域)を拡大/}).click();
  const marker=page.locator('[data-marker-region="kyoto-26102-13"]');
  await marker.hover();await expect(page.locator('.map-footer')).toContainText('滋野');
  await expect(page.locator('[data-region-id="kyoto-26102-13"]')).toHaveClass(/hovered/);
  const before=(await marker.locator('.unit-frame').boundingBox())!.width;
  for(let i=0;i<3;i++) await page.getByRole('button',{name:'縮小',exact:true}).click();
  const after=(await marker.locator('.unit-frame').boundingBox())!.width;
  expect(after).toBeLessThan(before);expect(after).toBeGreaterThanOrEqual(9);
  expect(await page.locator('.marker-leader').count()).toBe(0);
  expect(errors).toEqual([]);
});
test('SandboxでMoveとSupportを裁定し、秘密撤退の同時解決とreset、所有状態を保持',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await sampleWithUnits(page);
  const previewBefore=await downloadJson(page,'Preview JSONを保存');
  await page.getByRole('button',{name:'ルールサンドボックス',exact:true}).click();
  await page.getByRole('button',{name:'裁定',exact:true}).click();
  await expect(page.getByRole('alert').first()).toContainText('missing-order');
  await page.getByLabel('サンドボックスユニット').selectOption('preview-sample-a');
  await page.getByLabel('命令種別').selectOption('move');await page.getByLabel('命令の移動先').selectOption('sample-b');
  await expect(page.locator('.move-line')).toHaveCount(1);
  await page.getByLabel('サンドボックスユニット').selectOption('preview-sample-c');
  await page.getByLabel('命令種別').selectOption('support-move');
  await page.getByLabel('支援対象ユニット').selectOption('preview-sample-a');
  await page.getByLabel('命令の移動先').selectOption('sample-b');
  await expect(page.locator('.support-line')).toHaveCount(1);
  await page.getByRole('button',{name:'未入力をHoldにする',exact:true}).click();
  await page.getByRole('button',{name:'裁定',exact:true}).click();
  await expect(page.getByText('撤退フェイズ中は交渉禁止',{exact:true})).toBeVisible();
  await expect(page.locator('[data-marker-region="sample-b"] .unit-marker')).toHaveAttribute('data-unit-owner','26101');
  await expect(page.locator('.adjudication-results')).toContainText('移動に成功');
  await expect(page.locator('.adjudication-results')).toContainText('攻撃 2');
  await expect(page.locator('.order-line')).toHaveCount(0);
  const options=await page.getByLabel('秘密入力の撤退先').locator('option').evaluateAll(elements=>elements.map(e=>(e as HTMLOptionElement).value));
  expect(options).toContain('sample-d');expect(options).not.toContain('sample-a');expect(options).not.toContain('sample-c');
  await page.getByLabel('秘密入力の撤退先').selectOption('sample-d');
  await expect(page.locator('[data-marker-region="sample-d"] .unit-marker')).toHaveCount(0);
  await page.screenshot({path:'test-results/phase2a-retreat-input.png',fullPage:true});
  await page.getByRole('button',{name:'撤退を同時解決',exact:true}).click();
  await expect(page.locator('[data-marker-region="sample-d"] .unit-marker')).toHaveAttribute('data-unit-owner','26102');
  await expect(page.locator('.retreat-results')).toContainText('撤退に成功');
  await expect(page.locator('[data-region-id="sample-b"]')).toHaveAttribute('data-controller-ward-id','26101');
  await expect(page.locator('[data-supply-region="sample-b"] .supply-marker')).toHaveAttribute('data-supply-owner','neutral');
  await page.screenshot({path:'test-results/phase2a-rules-result.png',fullPage:true});
  await page.getByRole('button',{name:'初期Previewへリセット',exact:true}).click();
  await expect(page.locator('[data-marker-region="sample-a"] .unit-marker')).toHaveCount(1);
  await expect(page.locator('[data-marker-region="sample-b"] .unit-marker')).toHaveAttribute('data-unit-owner','26102');
  await expect(page.locator('[data-marker-region="sample-d"] .unit-marker')).toHaveCount(0);
  await page.getByRole('button',{name:'ゲームプレビュー',exact:true}).click();
  expect(await downloadJson(page,'Preview JSONを保存')).toEqual(previewBefore);
  expect(errors).toEqual([]);
});
