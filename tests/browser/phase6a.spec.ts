import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import type {PublicRoomView,PrivatePlayerView} from '../../packages/shared/online';
import {sampleConfig,sampleDataset} from '../../packages/map-core/sample';
import {compileMap} from '../../packages/map-core/compile';
import {createPreview} from '../../packages/shared/preview';
import {createGameSession} from '../../packages/game-core';
test('左ドラッグ終了は表示アンカー設定クリックに化けず、次の左クリックは維持',async({page})=>{
 await page.route('**/regions.json',r=>r.fulfill({status:404,body:''}));await page.goto('/?tool=editor');await expect(page.locator('.calculating')).toHaveCount(0);await page.locator('.region-list button').first().click();
 async function savedConfig(){const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'設定JSONを保存',exact:true}).click();return JSON.parse(await readFile((await (await downloading).path())!,'utf8'));}
 const before=await savedConfig();await page.getByRole('button',{name:'表示位置をこの地点に設定',exact:true}).click();const point=await anchor(page,'sample-a'),view=await page.locator('svg.map').getAttribute('viewBox');
 await page.mouse.move(point.x,point.y);await page.mouse.down({button:'left'});await page.mouse.move(point.x+40,point.y+10);await page.mouse.up({button:'left'});
 expect(await page.locator('svg.map').getAttribute('viewBox')).not.toBe(view);await expect(page.getByRole('button',{name:'表示位置をこの地点に設定',exact:true})).toHaveAttribute('aria-pressed','true');expect(await savedConfig()).toEqual(before);
 const next=await anchor(page,'sample-a');await page.mouse.click(next.x,next.y);await expect(page.getByRole('button',{name:'表示位置をこの地点に設定',exact:true})).toHaveAttribute('aria-pressed','false');expect((await savedConfig()).regions['sample-a'].displayAnchorOverride).not.toBeNull();
});
function watch(page:Page){const state:{room?:PublicRoomView;self?:PrivatePlayerView}={};page.on('websocket',s=>s.on('framereceived',f=>{const p=String(f.payload);if(!p.startsWith('42['))return;const [event,v]=JSON.parse(p.slice(2));if(event==='publicState')state.room={...v,map:v.map??state.room?.map};if(event==='privateState')state.self=v;}));return state;}
async function start(pages:Page[]){
 for(let i=0;i<3;i++){await pages[i].goto('/');await pages[i].getByRole('button',{name:'オンライン対戦',exact:true}).click();await pages[i].getByLabel('オンラインニックネーム').fill(`6A-${i}`);await pages[i].getByLabel('オンライン希望区').selectOption(['26102','26104','26111'][i]);await expect(pages[i].getByText('サーバー接続中',{exact:true})).toBeVisible();}
 const page=pages[0];await page.getByRole('button',{name:'ルームを作成',exact:true}).click();const code=await page.getByTestId('room-code').innerText();await page.getByLabel('京都シナリオJSONを読み込む').setInputFiles({name:'6a-test-only.json',mimeType:'application/json',buffer:await readFile('tests/fixtures/phase5a1-kyoto-map-config.json')});
 for(const p of pages.slice(1)){await p.getByLabel('参加ルームコード').fill(code);await p.getByRole('button',{name:'ルームへ参加',exact:true}).click();}await page.getByRole('button',{name:'オンラインゲーム開始',exact:true}).click();await expect(page.getByTestId('online-phase')).toContainText('第1年');
}
async function anchor(page:Page,id:string){return page.locator(`[data-region-id="${id}"]`).evaluate(el=>{const [x,y]=el.getAttribute('data-display-center')!.split(',').map(Number);const p=new DOMPoint(x,y).matrixTransform((el as SVGGraphicsElement).getScreenCTM()!);return {x:p.x,y:p.y};});}
test('実マウス: 自軍左クリック→合法地域右クリック・手ぶれ・トレイ開閉・Move/矢印/dock・両解像度',async({browser})=>{
 test.setTimeout(90000);const contexts=await Promise.all([0,1,2].map(()=>browser.newContext({viewport:{width:1920,height:1080}}))),pages=await Promise.all(contexts.map(c=>c.newPage()));const page=pages[0],state=watch(page),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await start(pages);await expect(page.locator('.left-hud,.right-hud')).toHaveCount(0);
  for(const size of [{width:1920,height:1080},{width:1366,height:768},{width:1280,height:720}]){await page.setViewportSize(size);const box=(await page.locator('svg.map').boundingBox())!;expect(box.width).toBeGreaterThan(size.width*.7);expect(box.height).toBeGreaterThan(size.height*.7);const confirm=(await page.getByRole('button',{name:'命令書を確定',exact:true}).boundingBox())!;expect(confirm.y+confirm.height).toBeLessThanOrEqual(size.height);await page.screenshot({path:`test-results/phase6a-main-${size.width}.png`,animations:'disabled'});}
  await page.getByLabel('オンライン行政区').selectOption('26102');await page.getByRole('button',{name:/選択(?:区|地域)を拡大/}).click();const own=state.room!.game!.board.units.filter(u=>u.ownerWardId==='26102'),selected=own.find(u=>state.self!.legalOrders[u.unitId].some(o=>o.type==='move'))!,move=state.self!.legalOrders[selected.unitId].find(o=>o.type==='move')!;if(move.type!=='move')throw Error('Move fixture');
  for(const open of [false,true]){
   if(open){await page.getByRole('button',{name:'イベント・結果',exact:true}).click();await page.getByRole('button',{name:'参加者・装備',exact:true}).click();}
   await page.locator(`[data-marker-region="${selected.regionId}"] .unit-pin`).click();await expect(page.getByLabel('選択軍の操作')).toBeVisible();await page.screenshot({path:`test-results/phase6a-selected-${open?'open':'closed'}.png`,animations:'disabled'});
   const point=await anchor(page,move.destination),before=await page.locator('svg.map').getAttribute('viewBox');await page.mouse.move(point.x,point.y);await page.mouse.down({button:'right'});await page.mouse.move(point.x+1,point.y+1);await page.mouse.up({button:'right'});expect(await page.locator('svg.map').getAttribute('viewBox')).toBe(before);
   await expect.poll(()=>state.self?.orders.some(o=>o.unitId===selected.unitId&&o.type==='move'&&o.destination===move.destination)).toBe(true);await expect(page.locator('.move-line')).toHaveCount(1);await expect(page.locator('.command-summary')).toContainText('移動');await expect(page.getByLabel('地域インスペクタ')).toContainText(state.room!.map!.regions.find(r=>r.regionId===move.destination)!.name);await page.screenshot({path:`test-results/phase6a-move-${open?'open':'closed'}.png`,animations:'disabled'});
   await page.getByRole('button',{name:'命令を変更',exact:true}).click();await expect(page.locator('.move-line')).toHaveCount(0);await expect(page.locator('.command-toast')).toHaveCount(0);
  }
  await page.getByRole('button',{name:'全体に戻す',exact:true}).click();await page.getByRole('button',{name:'情報トレイを閉じる',exact:true}).click();await page.screenshot({path:'test-results/phase6a-right-tray-closed.png',animations:'disabled'});await page.getByRole('button',{name:'イベントトレイを閉じる',exact:true}).click();await page.screenshot({path:'test-results/phase6a-trays-closed.png',animations:'disabled'});await page.getByRole('button',{name:'イベント・結果',exact:true}).click();await page.getByTestId('current-events').getByRole('button',{name:'地図で見る',exact:true}).first().click();await page.screenshot({path:'test-results/phase6a-event.png',animations:'disabled'});expect(errors).toEqual([]);
 }finally{await Promise.all(contexts.map(c=>c.close()));}
});
test('地面の装備マーカーも合法な右クリックMove対象、左クリックの移動も維持',async({page})=>{
 const config=structuredClone(sampleConfig);config.regions['sample-a'].isSupplyCenter=true;config.regions['sample-a'].startingUnit={ownerWardId:'26101',type:'army'};const map=compileMap(sampleDataset,config).map;let seed='';
 for(let i=0;i<2000;i++){const candidate=`e2e-local-${i}`,s=createGameSession(map,createPreview(map),['26101'],null,15,{seed:candidate});if(s.ok&&s.result.events.current[0]?.type==='bicycle'&&s.result.events.current[0]?.regionId==='sample-b'){seed=candidate;break;}}expect(seed).not.toBe('');
 await page.route('**/regions.json',r=>r.fulfill({status:404,body:''}));await page.goto('/?tool=editor');await page.getByLabel('設定JSONを読込').setInputFiles({name:'6a-equipment-test-only.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(config))});await expect(page.locator('.calculating')).toHaveCount(0);await page.getByRole('button',{name:'トップへ戻る',exact:true}).click();await page.getByRole('button',{name:'ローカルで試す',exact:true}).click();await page.getByLabel('イベントseed').fill(seed);await page.getByRole('button',{name:'現在のPreviewから開始',exact:true}).click();
 await page.locator('[data-marker-region="sample-a"] .unit-pin').click();await page.locator('[data-ground-region="sample-b"] rect').click({button:'right'});await expect(page.locator('.command-summary')).toContainText('移動');await expect(page.locator('.move-line')).toHaveCount(1);await page.screenshot({path:'test-results/phase6a-equipment-move.png',animations:'disabled'});
 await page.getByRole('button',{name:'命令を変更',exact:true}).click();await expect(page.locator('.move-line')).toHaveCount(0);await page.getByRole('button',{name:'移動',exact:true}).click();await page.locator('[data-ground-region="sample-b"] rect').click();await expect(page.locator('.move-line')).toHaveCount(1);
});
