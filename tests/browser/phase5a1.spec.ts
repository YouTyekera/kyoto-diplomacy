import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { sampleConfig } from '../../packages/map-core/sample';

test('同じzoomのSC円は軍の有無によらず同寸法・pinの足はSC内', async ({ page }) => {
  await page.setViewportSize({width:1280,height:720});
  await page.route('**/regions.json', route=>route.fulfill({status:404,body:''}));
  await page.goto('/?tool=editor');
  const config=structuredClone(sampleConfig);
  config.regions['sample-a'].isSupplyCenter=true;
  config.regions['sample-a'].startingUnit={type:'army',ownerWardId:'26101'};
  config.regions['sample-b'].isSupplyCenter=true;
  config.regions['sample-b'].startingUnit=null;
  await page.getByLabel('設定JSONを読込').setInputFiles({name:'markers.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(config))});
  await expect(page.locator('.calculating')).toHaveCount(0);
  for(let zoom=0;zoom<3;zoom++) {
    const circles=await page.locator('.supply-circle').evaluateAll(elements=>elements.map(e=>({r:e.getAttribute('r'),stroke:e.getAttribute('stroke-width'),width:e.getBoundingClientRect().width})));
    expect(new Set(circles.map(c=>c.r)).size).toBe(1);
    expect(new Set(circles.map(c=>c.stroke)).size).toBe(1);
    expect(Math.max(...circles.map(c=>c.width))-Math.min(...circles.map(c=>c.width))).toBeLessThan(0.01);
    const placement=await page.evaluate(()=>{
      const circle=document.querySelector('[data-supply-region="sample-a"] .supply-circle') as SVGCircleElement;
      const pin=document.querySelector('[data-marker-region="sample-a"] .unit-marker') as SVGGElement;
      const tip=new DOMPoint(0,9).matrixTransform(pin.getScreenCTM()!);
      const center=new DOMPoint(0,0).matrixTransform(circle.getScreenCTM()!);
      const radius=new DOMPoint(6,0).matrixTransform(circle.getScreenCTM()!);
      return {distance:Math.hypot(tip.x-center.x,tip.y-center.y),radius:Math.hypot(radius.x-center.x,radius.y-center.y),above:!!(document.querySelector('.supply-layer')!.compareDocumentPosition(document.querySelector('.army-layer')!)&Node.DOCUMENT_POSITION_FOLLOWING)};
    });
    expect(placement.distance).toBeLessThanOrEqual(placement.radius);expect(placement.above).toBe(true);
    await page.locator('svg.map').screenshot({path:`test-results/phase5a1-marker-zoom-${zoom}.png`});
    await page.getByRole('button',{name:'拡大',exact:true}).click();
  }
});

test('実京都JSONをサンプル作成ルームへuploadし190/72/59を公開する', async ({page}) => {
  test.setTimeout(90000);
  const json=await readFile('tests/fixtures/phase5a1-kyoto-map-config.json','utf8');
  await page.route('**/regions.json', route=>route.fulfill({status:404,body:''}));
  await page.goto('/');
  await page.getByRole('button',{name:'オンライン対戦',exact:true}).click();
  await page.getByLabel('オンラインニックネーム').fill('実設定確認');
  await expect(page.getByText('サーバー接続中',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'ルームを作成',exact:true}).click();
  await page.getByLabel('カスタムJSONを読み込む').setInputFiles({name:'kyoto-urban-config(3).json',mimeType:'application/json',buffer:Buffer.from(json)});
  await expect(page.getByTestId('scenario-summary')).toContainText('採用 190地域 / 補給拠点 72 / 初期軍 59');
  await expect(page.getByLabel('シナリオ検証')).toContainText('カスタムJSON読込済み');
  await expect(page.getByLabel('シナリオ検証')).toContainText('Error 0');
  const before=await page.getByTestId('scenario-summary').innerText();
  await page.getByLabel('カスタムJSONを読み込む').setInputFiles({name:'unknown.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...JSON.parse(json),regions:{}}))});
  await expect(page.getByRole('alert').filter({hasText:'Dataset照合'})).toBeVisible();
  expect(await page.getByTestId('scenario-summary').innerText()).toBe(before);
});

test('同じ実ファイルをEditorと京都ルームで読み190/72/59・地図・SC寸法を確認',async({browser})=>{
  test.setTimeout(90000);
  const json=await readFile('tests/fixtures/phase5a1-kyoto-map-config.json','utf8');
  const contexts=await Promise.all([browser.newContext(),browser.newContext(),browser.newContext()]);
  const pages=await Promise.all(contexts.map(c=>c.newPage()));
  try {
    await pages[0].goto('/?tool=editor');
    await pages[0].getByLabel('設定JSONを読込').setInputFiles({name:'kyoto-urban-config(3).json',mimeType:'application/json',buffer:Buffer.from(json)});
    await expect(pages[0].getByText('採用 190 / 227',{exact:true})).toBeVisible();await expect(pages[0].locator('.calculating')).toHaveCount(0);
    const saved=pages[0].waitForEvent('download');await pages[0].getByRole('button',{name:'設定JSONを保存',exact:true}).click();
    expect(JSON.parse(await readFile((await (await saved).path())!,'utf8'))).toEqual(JSON.parse(json));
    for(let i=0;i<3;i++) {
      if(i>0)await pages[i].goto('/');
      await pages[i].getByRole('button',{name:'オンライン対戦',exact:true}).click();
      await pages[i].getByLabel('オンラインニックネーム').fill(`京都確認${i}`);
      await pages[i].getByLabel('オンライン希望区').selectOption(['26101','26102','26103'][i]);
      await expect(pages[i].getByText('サーバー接続中',{exact:true})).toBeVisible();
    }
    await pages[0].getByRole('button',{name:'ルームを作成',exact:true}).click();
    await pages[0].getByLabel('カスタムJSONを読み込む').setInputFiles({name:'kyoto-urban-config(3).json',mimeType:'application/json',buffer:Buffer.from(json)});
    const code=await pages[0].getByTestId('room-code').innerText();
    for(let i=1;i<3;i++){await pages[i].getByLabel('参加ルームコード').fill(code);await pages[i].getByRole('button',{name:'ルームへ参加',exact:true}).click();}
    for(const page of pages)await expect(page.getByTestId('scenario-summary')).toContainText('採用 190地域 / 補給拠点 72 / 初期軍 59');
    await pages[0].getByRole('button',{name:'オンラインゲーム開始',exact:true}).click();
    await pages[0].setViewportSize({width:1280,height:720});
    await expect(pages[0].getByTestId('online-phase')).toContainText('第1年');
    await expect(pages[0].locator('.supply-circle')).toHaveCount(72);
    await expect(pages[0].locator('[data-region-id]')).toHaveCount(227);
    const radii=await pages[0].locator('.supply-circle').evaluateAll(elements=>elements.map(e=>e.getAttribute('r')));
    expect(new Set(radii).size).toBe(1);await expect(pages[0].getByRole('alert')).toHaveCount(0);
    await pages[0].screenshot({path:'test-results/phase5a1-kyoto-online-1280.png',fullPage:true});
  } finally {await Promise.all(contexts.map(c=>c.close()));}
});
