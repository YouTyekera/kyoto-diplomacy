import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function saveJson(page: Page, button: string) {
  const downloading = page.waitForEvent('download');
  await page.getByRole('button',{name:button,exact:true}).click();
  const download = await downloading;
  return JSON.parse(await readFile((await download.path())!,'utf8'));
}
async function sample(page: Page) {
  await page.route('**/regions.json',route=>route.fulfill({status:404,body:''}));
  await page.goto('/?tool=editor'); await expect(page.getByText('採用 4 / 4',{exact:true})).toBeVisible();
  await expect(page.locator('.calculating')).toHaveCount(0);
  await page.locator('.region-list button').first().click();
}
async function svgPoint(page: Page, x: number, y: number) {
  return page.locator('svg.map').evaluate((svg, p)=>{
    const point = new DOMPoint(p.x,p.y).matrixTransform((svg as SVGSVGElement).getScreenCTM()!);
    return {x:point.x,y:point.y};
  },{x,y});
}
test('Previewの独立した支配・SC所有・ユニット、保存読込、ズーム・パン',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await sample(page);
  await page.getByLabel('補給拠点',{exact:true}).check();
  await expect(page.locator('.calculating')).toHaveCount(0);
  const staticBefore = await saveJson(page,'設定JSONを保存');
  await page.getByRole('button',{name:'ゲームプレビュー',exact:true}).click();
  await page.getByLabel('現在の支配勢力',{exact:true}).selectOption('26104');
  await page.getByLabel('補給拠点の現在所有勢力',{exact:true}).selectOption('26102');
  await page.getByLabel('プレビューユニットを配置',{exact:true}).check();
  await page.getByLabel('プレビューユニットの勢力',{exact:true}).selectOption('26103');
  const region = page.locator('[data-region-id="sample-a"]');
  const marker = page.locator('[data-marker-region="sample-a"]');
  const scMarker = page.locator('[data-supply-region="sample-a"]');
  await expect(region).toHaveAttribute('data-controller-ward-id','26104');
  await expect(region).toHaveAttribute('fill','#b79b44');
  await expect(marker.locator('.unit-marker')).toHaveAttribute('data-unit-owner','26103');
  await expect(scMarker.locator('.supply-marker')).toHaveAttribute('data-supply-owner','26102');
  // Measure both SVG shapes in one browser evaluation, in their shared token coordinates.
  // Separate boundingBox calls can straddle the browser's marker scale/ResizeObserver update.
  const {unitBox,scBox}=await marker.evaluate(group=>{
    const bounds=(selector:string)=>{
      const b=(group.querySelector(selector) as SVGGraphicsElement).getBBox();
      return {x:b.x,y:b.y,width:b.width,height:b.height};
    };
    const sc=document.querySelector('[data-supply-region="sample-a"] .supply-marker') as SVGGraphicsElement;
    const b=sc.getBBox();
    return {unitBox:bounds('.unit-marker'),scBox:{x:b.x,y:b.y,width:b.width,height:b.height}};
  });
  await expect(scMarker.locator('.supply-circle')).toHaveCount(1);
  // Phase 5A.1: SC is a small independent circle, no longer an Army halo.
  expect(scBox.width).toBeLessThan(unitBox.width);
  expect(scBox.height).toBeLessThan(unitBox.height);
  expect(Math.abs((scBox.x+scBox.width/2)-(unitBox.x+unitBox.width/2))).toBeLessThan(1);
  await marker.locator('.unit-frame').hover(); await expect(region).toHaveClass(/hovered/);
  const anchor = await marker.getAttribute('data-anchor');
  const circleBefore = (await marker.locator('.marker-anchor').boundingBox())!;
  const viewBefore = await page.locator('svg.map').getAttribute('viewBox');
  await page.getByRole('button',{name:'拡大',exact:true}).click();
  await expect(page.locator('svg.map')).not.toHaveAttribute('viewBox',viewBefore!);
  await expect(marker).toHaveAttribute('data-anchor',anchor!);
  const circleZoom = (await marker.locator('.marker-anchor').boundingBox())!;
  expect(Math.abs(circleZoom.width-circleBefore.width)).toBeLessThan(1);
  const bounds=(await page.locator('svg.map').boundingBox())!;
  await page.mouse.move(bounds.x+20,bounds.y+20);await page.mouse.down();
  await page.mouse.move(bounds.x+60,bounds.y+45,{steps:5});await page.mouse.up();
  await expect(marker).toHaveAttribute('data-anchor',anchor!);
  const circlePan=(await marker.locator('.marker-anchor').boundingBox())!;
  expect(circlePan.x-circleZoom.x).toBeCloseTo(40,0);expect(circlePan.y-circleZoom.y).toBeCloseTo(25,0);
  const state = await saveJson(page,'Preview JSONを保存');
  expect(state.regionControl['sample-a']).toMatchObject({controllerWardId:'26104',supplyCenterOwnerWardId:'26102'});
  expect(state.units[0]).toMatchObject({ownerWardId:'26103',regionId:'sample-a'});
  expect(await saveJson(page,'設定JSONを保存')).toEqual(staticBefore);
  await page.getByRole('button',{name:'マップ設定からPreviewを再生成',exact:true}).click();
  await expect(page.getByLabel('プレビューユニットを配置')).not.toBeChecked();
  await page.getByLabel('Preview JSONを読込').setInputFiles({name:'preview.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(state))});
  await expect(marker.locator('.unit-marker')).toHaveCount(1);
  await page.screenshot({path:'test-results/phase1-5-preview.png',fullPage:true});
  await page.reload(); await expect(page.locator('.calculating')).toHaveCount(0);
  await page.getByRole('button',{name:'ゲームプレビュー',exact:true}).click();
  await page.locator('.region-list button').first().click();
  await expect(page.getByLabel('現在の支配勢力')).toHaveValue('26104');
  await expect(page.getByLabel('補給拠点の現在所有勢力')).toHaveValue('26102');
  expect(errors).toEqual([]);
});
test('表示位置の手動修正と範囲外拒否、設定JSONの往復',async({page})=>{
  await sample(page);await page.getByLabel('補給拠点',{exact:true}).check();
  await expect(page.locator('.calculating')).toHaveCount(0);
  const marker=page.locator('[data-marker-region="sample-a"]');
  const original=await marker.getAttribute('data-anchor');
  const position=await marker.locator('.marker-anchor').evaluate(c=>({x:Number(c.getAttribute('cx'))+20,y:Number(c.getAttribute('cy'))+20}));
  await page.getByRole('button',{name:'表示位置をこの地点に設定',exact:true}).click();
  const target=await svgPoint(page,position.x,position.y);await page.mouse.click(target.x,target.y);
  await expect(page.locator('.calculating')).toHaveCount(0);
  await expect(marker).not.toHaveAttribute('data-anchor',original!);
  const saved=await saveJson(page,'設定JSONを保存');
  expect(saved.regions['sample-a'].displayAnchorOverride).toHaveLength(2);
  await page.getByRole('button',{name:'表示位置をこの地点に設定',exact:true}).click();
  const outside=await svgPoint(page,15,15);await page.mouse.click(outside.x,outside.y);
  await expect(page.getByRole('status').filter({hasText:/内部へ設定/})).toBeVisible();
  expect(await saveJson(page,'設定JSONを保存')).toEqual(saved);
  await page.getByRole('button',{name:'表示位置を自動に戻す',exact:true}).click();
  await expect(page.locator('.calculating')).toHaveCount(0);
  await expect(marker).toHaveAttribute('data-anchor',original!);
  await page.getByLabel('設定JSONを読込').setInputFiles({name:'anchor.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});
  await expect(page.locator('.calculating')).toHaveCount(0);
  await expect(marker).toHaveAttribute('data-anchor',saved.regions['sample-a'].displayAnchorOverride.join(','));
});
test('侵入不能境界を画面で作成・修正・保存できる',async({page})=>{
  await sample(page);
  const original=await page.locator('[data-region-id="sample-a"]').getAttribute('d');
  await page.getByRole('button',{name:'地図上で侵入不能境界を作成',exact:true}).click();
  await page.getByLabel('障害物名',{exact:true}).fill('操作テスト境界');
  await page.getByLabel('境界の出典・編集意図').fill('架空サンプルの表示確認');
  for(const [x,y] of [[220,540],[280,540],[280,620],[220,620]]) {const p=await svgPoint(page,x,y);await page.mouse.click(p.x,p.y);}
  await expect(page.locator('.obstacle-draft circle')).toHaveCount(4);
  await page.getByRole('button',{name:'侵入不能境界を確定',exact:true}).click();
  await expect(page.locator('.calculating')).toHaveCount(0);await expect(page.locator('.obstacle')).toHaveCount(1);
  await expect(page.locator('[data-region-id="sample-a"]')).not.toHaveAttribute('d',original!);
  const saved=await saveJson(page,'設定JSONを保存');
  expect(saved.obstacles[0].geometry.coordinates[0]).toHaveLength(5);
  await page.getByRole('button',{name:'境界を編集',exact:true}).click();
  await page.getByRole('button',{name:'頂点4を移動',exact:true}).click();
  const p=await svgPoint(page,210,620);await page.mouse.click(p.x,p.y);
  await page.getByRole('button',{name:'侵入不能境界を確定',exact:true}).click();
  await expect(page.locator('.calculating')).toHaveCount(0);
  const edited=await saveJson(page,'障害物GeoJSONを保存');
  expect(edited.features[0].id).toBe(saved.obstacles[0].id);
  expect(edited.features[0].geometry).not.toEqual(saved.obstacles[0].geometry);
  await page.getByLabel('設定JSONを読込').setInputFiles({name:'obstacle.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});
  await expect(page.locator('.calculating')).toHaveCount(0);
  expect((await saveJson(page,'設定JSONを保存')).obstacles).toEqual(saved.obstacles);
});
test('御苑の境界案を読み込み、滋野・京極を補正して保存・画面編集する',async({page})=>{
  await page.goto('/?tool=editor');await expect(page.locator('.calculating')).toHaveCount(0);
  await page.getByLabel('行政区フィルター').selectOption('26102');
  await page.getByRole('button',{name:'区を全採用',exact:true}).click();
  await page.getByRole('button',{name:/選択(?:区|地域)を拡大/}).click();
  await page.getByLabel('地域を検索').fill('滋野');await page.locator('.region-list button').first().click();
  await page.getByRole('button',{name:'御苑のゲーム用境界案を読み込む',exact:true}).click();
  await expect(page.locator('.calculating')).toHaveCount(0);
  await expect(page.locator('.obstacle')).toHaveCount(1);
  const saved=await saveJson(page,'設定JSONを保存');
  expect(saved.obstacles[0].id).toBe('kyoto-gyoen-game-obstacle');
  expect(saved.obstacles[0].properties.source).toContain('滋野source geometryの南端');
  expect(saved.obstacles[0].geometry.coordinates[0][0][1]).toBe(35.0173548653);
  await page.getByRole('button',{name:'境界を編集',exact:true}).click();
  await expect(page.locator('.obstacle-draft circle')).toHaveCount(4);
  await page.getByLabel('障害物名',{exact:true}).fill('京都御苑（修正テスト）');
  await page.getByRole('button',{name:'侵入不能境界を確定',exact:true}).click();
  await expect(page.locator('.calculating')).toHaveCount(0);
  expect((await saveJson(page,'設定JSONを保存')).obstacles[0].properties.name).toBe('京都御苑（修正テスト）');
  await page.screenshot({path:'test-results/phase1-5-gyoen.png',fullPage:true});
});
