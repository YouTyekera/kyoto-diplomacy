import { test,expect,type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { configSchema,datasetSchema } from '../../packages/shared/model';
import { compileMap } from '../../packages/map-core/compile';
import { createPreview } from '../../packages/shared/preview';
import { createGameSession } from '../../packages/game-core';
import { legalOrders } from '../../packages/rules-core';
import type { PrivatePlayerView,PublicRoomView } from '../../packages/shared/online';
import { sampleConfig } from '../../packages/map-core/sample';
const wards=['26102','26104','26111'];
async function setup(pages:Page[]){
  const config=configSchema.parse(JSON.parse(await readFile('tests/fixtures/phase5a1-kyoto-map-config.json','utf8')));
  for(let i=0;i<pages.length;i++){await pages[i].goto('/');await pages[i].getByRole('button',{name:'オンライン対戦',exact:true}).click();await pages[i].getByLabel('オンラインニックネーム').fill(`5B-${i}`);await pages[i].getByLabel('オンライン希望区').selectOption(wards[i]);await expect(pages[i].getByText('サーバー接続中',{exact:true})).toBeVisible();}
  await pages[0].getByRole('button',{name:'ルームを作成',exact:true}).click();
  const code=await pages[0].getByTestId('room-code').innerText();
  await pages[0].getByLabel('カスタムJSONを読み込む').setInputFiles({name:'phase5a1-real-kyoto.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(config))});
  for(const page of pages.slice(1)){await page.getByLabel('参加ルームコード').fill(code);await page.getByRole('button',{name:'ルームへ参加',exact:true}).click();}
  await pages[0].getByRole('button',{name:'オンラインゲーム開始',exact:true}).click();
  for(const page of pages){await expect(page.getByTestId('online-phase')).toContainText('第1年 · 春');await page.getByRole('button',{name:'イベント・結果',exact:true}).click();}
}
async function rightClick(page:Page,id:string){return page.locator(`[data-region-id="${id}"]`).evaluate(e=>!e.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2})));}
async function close(page:Page){if(await page.getByRole('button',{name:'スキップ',exact:true}).isVisible())await page.getByRole('button',{name:'スキップ',exact:true}).click();await page.getByRole('button',{name:'結果を閉じる',exact:true}).click();}

test('実京都190/72/59・3人密度で自軍、右クリック、2手先、支援の本人推薦と他軍秘密、裁定Audio・skip・復帰',async({browser})=>{
  test.setTimeout(120000);
  const contexts=await Promise.all(wards.map(()=>browser.newContext({viewport:{width:1280,height:720}}))),pages=await Promise.all(contexts.map(c=>c.newPage()));
  const privateViews:(PrivatePlayerView|undefined)[]=[],publicViews:(PublicRoomView|undefined)[]=[],errors:string[]=[];
  for(const [i,page] of pages.entries()){page.on('pageerror',e=>errors.push(e.message));page.on('websocket',socket=>socket.on('framereceived',f=>{const text=String(f.payload);if(!text.startsWith('42['))return;const [event,view]=JSON.parse(text.slice(2));if(event==='privateState')privateViews[i]=view;if(event==='publicState')publicViews[i]={...view,map:view.map??publicViews[i]?.map};}));}
  await pages[0].addInitScript(()=>{
    const records:{src:string;plays:number;pauses:number}[]=[];(window as unknown as {audioRecords:typeof records}).audioRecords=records;
    const NativeAudio=window.Audio;window.Audio=class extends NativeAudio{record:typeof records[number];constructor(src?:string){super();this.record={src:src??'',plays:0,pauses:0};records.push(this.record);}play(){this.record.plays++;return Promise.resolve();}pause(){this.record.pauses++;}};
  });
  try{
    await setup(pages);await expect(pages[0].locator('.supply-circle')).toHaveCount(72);await expect(pages[0].locator('.own-unit')).toHaveCount(6);await expect(pages[1].locator('.own-unit')).toHaveCount(6);await expect(pages[2].locator('.own-unit')).toHaveCount(5);
    await expect(pages[0].getByTestId('own-ward')).toContainText('あなた: 上京区');await expect(pages[0].getByTestId('rival-sc-progress')).toContainText('敵の初期補給拠点 0 / 2');
    const map=publicViews[0]!.map!,units=publicViews[0]!.game!.board.units;
    const own=units.filter(u=>u.ownerWardId===wards[0]);
    const support=own.flatMap(u=>legalOrders(map,units,u.unitId)).find(o=>o.type==='support-move'&&own.some(u=>u.unitId===o.targetUnitId))!;
    expect(support?.type).toBe('support-move');if(support.type!=='support-move')throw Error('support fixture');
    const target=units.find(u=>u.unitId===support.targetUnitId)!,supporter=units.find(u=>u.unitId===support.unitId)!;
    await pages[0].getByLabel('オンライン行政区').selectOption(wards[0]);await pages[0].getByRole('button',{name:/選択(?:区|地域)を拡大/}).click();
    await pages[0].locator(`[data-marker-region="${target.regionId}"]`).press('Enter');
    await expect(pages[0].locator(`[data-region-id="${support.destination}"]`)).toHaveClass(/legal-target/);
    await pages[0].locator(`[data-region-id="${support.destination}"]`).dispatchEvent('mouseover');await expect(pages[0].getByText('次の一歩の参考（現在の通行条件基準）',{exact:true})).toBeVisible();await expect(pages[0].locator('.secondary-target')).not.toHaveCount(0);
    expect(await rightClick(pages[0],support.destination)).toBe(true);await expect(pages[0].locator('.move-line')).toHaveCount(1);await expect(pages[1].locator('.move-line')).toHaveCount(0);
    await expect.poll(()=>privateViews[0]?.orders.length).toBe(1);const before=JSON.stringify(privateViews[0]!.orders);await rightClick(pages[0],target.regionId);expect(JSON.stringify(privateViews[0]!.orders)).toBe(before);await expect(pages[0].getByText('移動できる地域を右クリックしてください。',{exact:true})).toBeVisible();
    await pages[0].locator(`[data-marker-region="${supporter.regionId}"]`).press('Enter');await pages[0].getByRole('button',{name:'支援',exact:true}).click();await expect(pages[0].getByText('どの軍を支援しますか？',{exact:true})).toBeVisible();
    await rightClick(pages[0],support.destination);expect(JSON.stringify(privateViews[0]!.orders)).toBe(before);
    await pages[0].locator(`[data-marker-region="${target.regionId}"]`).press('Enter');await expect(pages[0].getByRole('button',{name:'この軍の現在地を守る',exact:true})).toBeVisible();await pages[0].getByRole('button',{name:/現在の移動命令:/}).click();await expect(pages[0].locator('.support-line')).toHaveCount(1);
    await pages[0].getByRole('button',{name:'支援',exact:true}).click();await pages[0].keyboard.press('Escape');await expect(pages[0].getByText('どの軍を支援しますか？',{exact:true})).toHaveCount(0);
    const foreign=own.flatMap(u=>legalOrders(map,units,u.unitId)).find(o=>o.type==='support-move'&&units.find(u=>u.unitId===o.targetUnitId)?.ownerWardId!==wards[0]);
    expect(foreign).toBeTruthy();if(!foreign||foreign.type!=='support-move')throw Error('foreign fixture');
    await pages[0].locator(`[data-marker-region="${units.find(u=>u.unitId===foreign.unitId)!.regionId}"]`).press('Enter');await pages[0].getByRole('button',{name:'支援',exact:true}).click();await pages[0].locator(`[data-marker-region="${units.find(u=>u.unitId===foreign.targetUnitId)!.regionId}"]`).press('Enter');await expect(pages[0].getByRole('button',{name:/現在の移動命令:/})).toHaveCount(0);await pages[0].getByRole('button',{name:'この軍の移動を支援する',exact:true}).click();await pages[0].locator(`[data-region-id="${foreign.destination}"]`).press('Enter');await expect.poll(()=>privateViews[0]?.orders.some(o=>o.type==='support-move'&&o.targetUnitId===foreign.targetUnitId)).toBe(true);
    await pages[0].screenshot({path:'test-results/phase5b-kyoto-commands-1280.png',fullPage:true});
    for(const page of pages)await page.getByRole('button',{name:'命令書を確定',exact:true}).click();
    await expect(pages[0].getByLabel('裁定演出')).toBeVisible();await expect(pages[0].locator('html')).toHaveAttribute('data-bgm-context','adjudication');await expect(pages[0].getByLabel('裁定演出')).toHaveAttribute('data-presentation-stage','slide');
    const sounds=await pages[0].evaluate(()=>(window as unknown as {audioRecords:{src:string;plays:number}[]}).audioRecords.filter(a=>a.src.endsWith('/march.wav')));expect(sounds).toHaveLength(1);expect(sounds[0].plays).toBe(1);
    await pages[0].screenshot({path:'test-results/phase5b-kyoto-presentation.png',fullPage:true});await close(pages[0]);await expect(pages[0].locator('html')).toHaveAttribute('data-bgm-context','domestic');
    expect(await pages[0].evaluate(()=>(window as unknown as {audioRecords:{src:string;pauses:number}[]}).audioRecords.find(a=>a.src.endsWith('/march.wav'))!.pauses)).toBeGreaterThan(0);
    await pages[1].reload();await expect(pages[1].getByTestId('online-phase')).toContainText('秋');await expect(pages[1].getByLabel('裁定演出')).toHaveCount(0);await close(pages[2]);
    const download=pages[0].waitForEvent('download');await pages[0].getByRole('button',{name:'試遊ログをダウンロード',exact:true}).click();const log=JSON.parse(await readFile((await (await download).path())!,'utf8'));expect(log.timeline.filter((r:{type:string})=>r.type==='presentation-skipped').length).toBeGreaterThan(0);expect(log.timeline.find((r:{type:string})=>r.type==='adjudication').resolvedOrders.some((o:{type:string})=>o.type==='support-move')).toBe(true);
    expect(errors).toEqual([]);
  }finally{await Promise.all(contexts.map(c=>c.close()));}
});

for(const reduced of [false,true])test(`失敗Moveの往復・同時表示・確定位置・音源未配置・reduced motion=${reduced}`,async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'});
  await page.route('**/regions.json',route=>route.fulfill({status:404,body:''}));await page.goto('/?tool=editor');
  const config=structuredClone(sampleConfig);config.regions['sample-a'].startingUnit={ownerWardId:'26101',type:'army'};config.regions['sample-c'].startingUnit={ownerWardId:'26102',type:'army'};config.adjacencyAdd.push(['sample-b','sample-c']);
  await page.getByLabel('設定JSONを読込').setInputFiles({name:'bounce.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(config))});await expect(page.locator('.calculating')).toHaveCount(0);await page.getByRole('button',{name:'トップへ戻る',exact:true}).click();await page.getByRole('button',{name:'ローカルで試す',exact:true}).click();await page.getByLabel('公開イベントを有効にする（検証用）').uncheck();await page.getByRole('button',{name:'現在のPreviewから開始',exact:true}).click();
  for(const id of ['sample-a','sample-c']){await page.locator(`[data-marker-region="${id}"]`).press('Enter');await page.getByRole('button',{name:'移動',exact:true}).click();await page.locator('[data-region-id="sample-b"]').press('Enter');}
  await page.getByRole('button',{name:'移動を裁定',exact:true}).click();await expect(page.getByLabel('裁定演出')).toHaveAttribute('data-presentation-stage','slide');await expect(page.locator('[data-move-status="fail"]')).toHaveCount(2);
  const origin=(await page.locator('[data-region-id="sample-a"]').getAttribute('data-display-center'))!.split(',').map(Number),at=(await page.locator('[data-presentation-unit="preview-sample-a"]').getAttribute('transform'))!.match(/translate\(([-\d.]+) ([-\d.]+)\)/)!;
  if(reduced)expect(Number(at[1])).toBeCloseTo(origin[0]);else expect(Number(at[1])).toBeGreaterThan(origin[0]);
  await page.screenshot({path:`test-results/phase5b-bounce-${reduced}.png`,fullPage:true});await page.getByRole('button',{name:'スキップ',exact:true}).click();await expect(page.locator('.presentation-layer')).toHaveCount(0);await expect(page.locator('[data-marker-region="sample-a"] .token-position')).toHaveAttribute('transform',new RegExp(`translate\\(${origin[0]} ${origin[1]}\\)`));await page.getByRole('button',{name:'結果を閉じる',exact:true}).click();await expect(page.locator('[data-marker-region="sample-a"] .unit-pin')).toBeVisible();expect(errors).toEqual([]);
});

test('実京都の道路工事カードhover・focus・両端点表示と支配色内の中立SC',async({page})=>{
  test.setTimeout(90000);
  const dataset=datasetSchema.parse(JSON.parse(await readFile('data/generated/regions.json','utf8'))),config=configSchema.parse(JSON.parse(await readFile('tests/fixtures/phase5a1-kyoto-map-config.json','utf8')));
  const map=compileMap(dataset,config).map,preview=createPreview(map);let seed='';
  for(let i=0;i<50;i++){const candidate=`phase5b-roadwork-${i}`,state=createGameSession(map,preview,[...new Set(preview.units.map(u=>u.ownerWardId))],null,15,{seed:candidate});if(state.ok&&state.result.events.roadworkEdges.length){seed=candidate;break;}}
  expect(seed).not.toBe('');
  const neutral=map.regions.find(r=>r.isSupplyCenter&&r.homeWardId==='26102')!;preview.regionControl[neutral.regionId].supplyCenterOwnerWardId=null;
  await page.goto('/?tool=editor');await page.getByLabel('設定JSONを読込').setInputFiles({name:'real-kyoto.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(config))});await expect(page.locator('.calculating')).toHaveCount(0);
  await page.getByRole('button',{name:'ゲームプレビュー',exact:true}).click();await page.getByLabel('Preview JSONを読込').setInputFiles({name:'neutral-preview.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(preview))});await page.getByRole('button',{name:'トップへ戻る',exact:true}).click();await page.getByRole('button',{name:'ローカルで試す',exact:true}).click();await page.getByLabel('イベントseed').fill(seed);await page.getByRole('button',{name:'現在のPreviewから開始',exact:true}).click();
  const card=page.locator('[data-event-type="roadwork"]');await expect(card).toContainText('区）');expect(await card.innerText()).not.toContain('kyoto-261');await card.hover();await expect(page.locator('.event-highlight')).toHaveCount(2);await expect(page.locator('[data-event-edge="roadwork"]')).toHaveClass(/event-edge-focused/);
  const edge=page.locator('[data-event-edge="roadwork"]'),ids=[(await edge.getAttribute('data-edge-a'))!,(await edge.getAttribute('data-edge-b'))!];await card.getByRole('button',{name:'地図で見る',exact:true}).click();await expect(page.locator('.event-pulse')).toHaveCount(2);
  const view=(await page.locator('svg.map').getAttribute('viewBox'))!.split(' ').map(Number);for(const id of ids){const point=(await page.locator(`[data-region-id="${id}"]`).getAttribute('data-display-center'))!.split(',').map(Number);expect(point[0]).toBeGreaterThan(view[0]);expect(point[0]).toBeLessThan(view[0]+view[2]);expect(point[1]).toBeGreaterThan(view[1]);expect(point[1]).toBeLessThan(view[1]+view[3]);}
  const sc=page.locator(`[data-supply-region="${neutral.regionId}"]`);await expect(sc.locator('.supply-marker')).toHaveAttribute('data-supply-owner','neutral');await expect(sc.locator('.supply-owner-ring')).toHaveAttribute('stroke','none');await expect(page.locator(`[data-region-id="${neutral.regionId}"]`)).toHaveAttribute('data-controller-ward-id','26102');
  await page.screenshot({path:'test-results/phase5b-roadwork-focus.png',fullPage:true});await page.getByRole('button',{name:'全体に戻す',exact:true}).click();await sc.dispatchEvent('mouseover');await expect(page.getByRole('tooltip')).toContainText('補給拠点: 中立（未所有）');
});

