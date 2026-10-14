import { test,expect } from '@playwright/test';
import { sampleDataset } from '../../packages/map-core/sample';
import { createConfig,type RegionDataset } from '../../packages/shared/model';
import { createPreview } from '../../packages/shared/preview';
import { compileMap } from '../../packages/map-core/compile';

test('two retreat selections share map highlights, owned candidates and explicit camera location',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.emulateMedia({reducedMotion:'reduce'});
 const ids=['a','b','c','d','e','f','g','h'],dataset:RegionDataset={version:1,kind:'sample',regions:ids.map((id,i)=>{
  const r=structuredClone(sampleDataset.regions[0]),x=135.74+(i%4)*.012,y=35.04+Math.floor(i/4)*.012;
  return {...r,regionId:id,name:`架空${id.toUpperCase()}`,wardId:['a','d','g'].includes(id)?'26101':'26102',geometry:{type:'Polygon',coordinates:[[[x,y],[x+.008,y],[x+.008,y+.008],[x,y+.008],[x,y]]]}};
 })};
 const config=createConfig(dataset);for(const r of dataset.regions)config.regions[r.regionId]={enabled:true,isSupplyCenter:true,homeWardId:r.wardId,startingUnit:['a','b','c','f','g','h'].includes(r.regionId)?{ownerWardId:r.wardId,type:'army'}:null};
 config.adjacencyAdd=[['a','b'],['a','c'],['a','d'],['a','e'],['g','h'],['g','f'],['g','d'],['g','e']];
 const map=compileMap(dataset,config).map,preview=createPreview(map);preview.regionControl.e.controllerWardId=null;
 await page.route('**/regions.json',r=>r.fulfill({json:dataset}));await page.goto('/?tool=editor');
 await page.getByLabel('設定JSONを読込').setInputFiles({name:'retreat-ui.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(config))});await expect(page.locator('.calculating')).toHaveCount(0);
 await page.getByRole('button',{name:'ゲームプレビュー',exact:true}).click();await page.getByLabel('Preview JSONを読込').setInputFiles({name:'retreat-board.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(preview))});
 await expect(page.locator('[data-region-id="e"]')).toHaveAttribute('data-controller-ward-id','');
 await page.getByRole('button',{name:'トップへ戻る',exact:true}).click();await page.getByRole('button',{name:'ローカルで試す',exact:true}).click();await page.getByRole('button',{name:'現在のPreviewから開始',exact:true}).click();
 for(const [attacker,helper,target] of [['b','c','a'],['h','f','g']]){
  await page.locator(`[data-marker-region="${attacker}"]`).press('Enter');await page.getByRole('button',{name:'移動',exact:true}).click();await page.locator(`[data-region-id="${target}"]`).press('Enter');
  await page.locator(`[data-marker-region="${helper}"]`).press('Enter');await page.getByRole('button',{name:'支援',exact:true}).click();await page.locator(`[data-region-id="${target}"]`).press('Enter');await page.getByRole('button',{name:`架空${attacker.toUpperCase()} → 架空${target.toUpperCase()}への移動を支援`,exact:true}).click();
 }
 await page.getByRole('button',{name:'年間の未入力をHoldにする',exact:true}).click();await page.getByRole('button',{name:'移動を裁定',exact:true}).click();
 await expect(page.getByLabel('年間撤退ユニット')).toBeEnabled();await expect(page.getByLabel('年間撤退ユニット').locator('option')).toHaveCount(2);
 for(const viewport of [{width:1280,height:720},{width:1920,height:1080}]){
  await page.setViewportSize(viewport);
  for(const id of ['a','g']){
   await page.getByLabel('年間撤退ユニット').selectOption(`preview-${id}`);await expect(page.locator('[data-command-role="origin"]')).toHaveAttribute('data-command-region',id);
   await expect(page.locator('.legal-target')).toHaveCount(1);await expect(page.locator('.legal-target')).toHaveAttribute('data-region-id','d');
   expect(await page.getByLabel('年間秘密撤退先').locator('option').evaluateAll(es=>es.map(e=>(e as HTMLOptionElement).value))).toEqual(['disband','d']);
   await page.getByRole('button',{name:'撤退軍の位置を見る',exact:true}).click();await expect(page.locator('[data-command-role="origin"]')).toBeVisible();
  }
  expect(await page.locator('.command-origin circle').evaluate(e=>getComputedStyle(e).animationName)).toBe('none');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);await page.screenshot({path:`test-results/gameplay-retreat-${viewport.width}.png`,fullPage:true});
 }
 const svg=page.locator('svg.map');await svg.scrollIntoViewIfNeeded();const before=await svg.getAttribute('viewBox'),box=(await svg.boundingBox())!;
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+35,box.y+box.height/2+20,{steps:5});await page.mouse.up();expect(await svg.getAttribute('viewBox')).not.toBe(before);
 const dragged=await svg.getAttribute('viewBox');await page.mouse.wheel(0,-120);await expect.poll(()=>svg.getAttribute('viewBox')).not.toBe(dragged);
 expect(errors).toEqual([]);
});
