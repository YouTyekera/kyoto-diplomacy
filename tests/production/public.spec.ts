import { startPlayback } from '../playback-browser-helper';
import {test,expect,type Page} from '@playwright/test';
import type {PrivatePlayerView,PublicRoomView} from '../../packages/shared/online';
import {sfxManifest} from '../../apps/web/src/audio/sfx-manifest';
const wards=['26102','26104','26111'];
function watch(page:Page){const state:{room?:PublicRoomView;self?:PrivatePlayerView;urls:string[]}={urls:[]};page.on('websocket',s=>{state.urls.push(s.url());s.on('framereceived',f=>{const p=String(f.payload);if(!p.startsWith('42['))return;const [event,v]=JSON.parse(p.slice(2));if(event==='publicState')state.room={...v,map:v.map??state.room?.map};if(event==='privateState')state.self=v;});});return state;}
async function anchor(page:Page,id:string){return page.locator(`[data-region-id="${id}"]`).evaluate(el=>{const [x,y]=el.getAttribute('data-display-center')!.split(',').map(Number);const p=new DOMPoint(x,y).matrixTransform((el as SVGGraphicsElement).getScreenCTM()!);return{x:p.x,y:p.y};});}
test('production HTTPS/WSS・3クライアント招待/割当/実右クリックMove/Support/確定/裁定/再読込',async({browser,baseURL})=>{
 test.setTimeout(120000);const contexts=await Promise.all(wards.map(()=>browser.newContext({ignoreHTTPSErrors:true,permissions:['clipboard-read','clipboard-write'],viewport:{width:1920,height:1080}}))),pages=await Promise.all(contexts.map(c=>c.newPage())),page=pages[0],states=pages.map(watch),errors:string[]=[];pages.forEach(p=>p.on('pageerror',e=>errors.push(e.message)));
 await pages[1].addInitScript(()=>{
  const Native=window.WebSocket,sockets:WebSocket[]=[];(window as unknown as {testSockets:WebSocket[]}).testSockets=sockets;
  window.WebSocket=class extends Native {constructor(url:string|URL,protocols?:string|string[]){super(url,protocols);sockets.push(this);}};
 });
 try{
  await page.goto(baseURL!);await page.getByRole('button',{name:'オンライン対戦',exact:true}).click();await expect(page.getByTestId('connection-scope')).toHaveText('公開サーバー');await expect(page.getByText('サーバー接続中',{exact:true})).toBeVisible();await page.getByLabel('オンラインニックネーム').fill('公開ホスト');await page.getByLabel('オンライン希望区').selectOption(wards[0]);await page.getByRole('button',{name:'ルームを作成',exact:true}).click();
  const code=await page.getByTestId('room-code').innerText();await page.getByRole('button',{name:'招待リンクをコピー',exact:true}).click();await expect(page.getByText('招待リンクをコピーしました。友達へこのURLを共有してください。',{exact:true})).toBeVisible();const invite=await page.evaluate(()=>navigator.clipboard.readText());expect(invite).toBe(`${baseURL}/?room=${code}`);
  await expect(page.getByRole('button',{name:'標準シナリオ',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.getByLabel('シナリオ検証')).toContainText('ファイルの読み込みは不要');
  for(let i=1;i<3;i++){await pages[i].goto(invite);await expect(pages[i].getByLabel('参加ルームコード')).toHaveValue(code);await pages[i].getByLabel('オンラインニックネーム').fill(`公開ゲスト${i}`);await pages[i].getByLabel('オンライン希望区').selectOption(wards[i]);await expect(pages[i].getByText('サーバー接続中',{exact:true})).toBeVisible();await pages[i].getByRole('button',{name:'ルームへ参加',exact:true}).click();}
  for(const s of states)await expect.poll(()=>s.room?.scenario.source).toBe('standard');
  await page.getByRole('button',{name:'オンラインゲーム開始',exact:true}).click();await expect(page.getByTestId('own-ward')).toContainText('上京区');for(const s of states)expect(s.urls.some(u=>u.startsWith('wss://kyoto-server.test:5444/'))).toBe(true);
  const state=states[0],units=state.room!.game!.board.units,own=units.filter(u=>u.ownerWardId===wards[0]);
  const support=own.flatMap(u=>state.self!.legalOrders[u.unitId]).find(o=>o.type==='support-move'&&own.some(u=>u.unitId===o.targetUnitId))!;if(support.type!=='support-move')throw Error('support fixture');
  const target=units.find(u=>u.unitId===support.targetUnitId)!,supporter=units.find(u=>u.unitId===support.unitId)!;
  await page.getByLabel('オンライン行政区').selectOption(wards[0]);await page.getByRole('button',{name:'選択地域を拡大',exact:true}).click();await page.locator(`[data-marker-region="${target.regionId}"] .unit-pin`).click();const point=await anchor(page,support.destination);await page.mouse.click(point.x,point.y,{button:'right'});await expect(page.locator('.move-line')).toHaveCount(1);await expect(page.locator('.command-summary')).toContainText('移動');await expect.poll(()=>state.self?.orders.some(o=>o.type==='move'&&o.unitId===target.unitId)).toBe(true);
  await page.locator(`[data-marker-region="${supporter.regionId}"] .unit-pin`).click();await page.getByRole('button',{name:'支援',exact:true}).click();await page.locator(`[data-marker-region="${target.regionId}"] .unit-pin`).click();await page.getByRole('button',{name:/現在の移動命令:/}).click();await expect(page.locator('.support-line')).toHaveCount(1);expect(states[1].self!.orders).toEqual([]);
  await page.screenshot({path:'docs/screenshots/phase7a/public-move-support-1920.png'});await page.setViewportSize({width:1280,height:720});await page.screenshot({path:'docs/screenshots/phase7a/public-move-support-1280.png'});
  console.info('Public integration: Move / Support saved.');
  for(const p of pages)await p.getByRole('button',{name:'命令書を確定',exact:true}).click();await startPlayback(pages);await expect(page.getByLabel('裁定演出')).toBeVisible();await expect.poll(()=>state.room?.game?.playback?.snapshot?.movement.orderResults.some(o=>o.order.type==='support-move')).toBe(true);await page.getByRole('button',{name:'演出をスキップ',exact:true}).click();await page.getByRole('button',{name:'前回の行軍結果',exact:true}).click();await page.getByRole('button',{name:'結果を閉じる',exact:true}).click();
  const year=state.room!.game!.year,phase=state.room!.game!.phaseKey,id=states[1].self!.playerId;await pages[1].reload();await expect(pages[1].getByTestId('online-phase')).toContainText(`第${year}年`);await expect.poll(()=>states[1].self?.playerId).toBe(id);await expect.poll(()=>states[1].self?.phaseKey).toBe(phase);await expect(pages[1].getByLabel('裁定演出')).toHaveCount(0);
  console.info('Public integration: adjudication / reload restored.');
  // Force transport loss without reload: the browser must re-authenticate with its saved credential.
  const connections=states[1].urls.length;
  await pages[1].evaluate(()=>(window as unknown as {testSockets:WebSocket[]}).testSockets.forEach(s=>s.close()));await expect.poll(()=>states[1].urls.length,{timeout:20000}).toBeGreaterThan(connections);await expect(pages[1].locator('[data-connection-state]')).toHaveCount(0,{timeout:20000});await expect.poll(()=>states[1].self?.playerId).toBe(id);
  console.info('Public integration: transport reconnected.');
  for(const asset of Object.values(sfxManifest)){const response=await page.evaluate(async src=>{const r=await fetch(src);return{status:r.status,header:new TextDecoder().decode((await r.arrayBuffer()).slice(0,4))};},asset.src);expect(response.status).toBe(200);expect(response.header).toBe('RIFF');}
  // User-owned, possibly untracked music is valid too. Never delete it to force a missing-asset fixture.
  for(const src of ['/audio/bgm/domestic.mp3','/audio/bgm/adjudication.mp3']){
   const asset=await page.evaluate(async path=>{const response=await fetch(path);return{status:response.status,type:response.headers.get('content-type'),bytes:(await response.arrayBuffer()).byteLength};},src);
   expect([200,404]).toContain(asset.status);if(asset.status===200){expect(asset.type).toMatch(/^audio\/|application\/octet-stream/);expect(asset.bytes).toBeGreaterThan(0);}
  }
  expect(errors).toEqual([]);await page.screenshot({path:'docs/screenshots/phase7a/public-reconnected-1280.png'});
  console.info('Public integration: production audio assets checked.');
 }catch(error){console.error('Public integration failed:',error);throw error;}
 finally{await Promise.race([Promise.all(contexts.map(c=>c.close())),new Promise<void>(resolve=>setTimeout(resolve,5000))]);}
});
test('static画面はBackend待ちで止まらず、起動待ち→90秒後再試行→復帰',async({page})=>{
 await page.clock.install();await page.route('https://kyoto-server.test:5444/health',r=>r.fulfill({status:503,body:'starting'}));await page.goto('/');await page.getByRole('button',{name:'オンライン対戦',exact:true}).click();await expect(page.getByText('サーバーを起動しています。初回はしばらくかかることがあります。',{exact:true})).toBeVisible();await expect(page.getByLabel('オンラインニックネーム')).toBeEnabled();await page.screenshot({path:'docs/screenshots/phase7a/public-waking.png'});
 await page.clock.fastForward(91000);await expect(page.locator('[data-connection-state]')).toHaveAttribute('data-connection-state','unavailable');await expect(page.getByRole('button',{name:'接続を再試行',exact:true})).toBeVisible();await page.screenshot({path:'docs/screenshots/phase7a/public-unavailable.png'});await page.unroute('https://kyoto-server.test:5444/health');await page.getByRole('button',{name:'接続を再試行',exact:true}).click();await expect(page.getByText('サーバー接続中',{exact:true})).toBeVisible();expect(await page.locator('.online-shell').innerText()).not.toMatch(/xhr poll error|websocket error|ECONNREFUSED/);
});
