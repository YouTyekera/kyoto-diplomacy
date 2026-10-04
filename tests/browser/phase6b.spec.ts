import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import type {PublicRoomView,PrivatePlayerView} from '../../packages/shared/online';
import {sfxManifest} from '../../apps/web/src/audio/sfx-manifest';

function watch(page:Page){const state:{room?:PublicRoomView;self?:PrivatePlayerView}={};page.on('websocket',s=>s.on('framereceived',f=>{const p=String(f.payload);if(!p.startsWith('42['))return;const [event,v]=JSON.parse(p.slice(2));if(event==='publicState')state.room={...v,map:v.map??state.room?.map};if(event==='privateState')state.self=v;}));return state;}
async function start(pages:Page[]){
 for(let i=0;i<3;i++){await pages[i].goto('/');await pages[i].getByRole('button',{name:'オンライン対戦',exact:true}).click();await pages[i].getByLabel('オンラインニックネーム').fill(`6B-${i}`);await pages[i].getByLabel('オンライン希望区').selectOption(['26102','26104','26111'][i]);await expect(pages[i].getByText('サーバー接続中',{exact:true})).toBeVisible();}
 const page=pages[0];await page.getByRole('button',{name:'ルームを作成',exact:true}).click();const code=await page.getByTestId('room-code').innerText();await page.getByLabel('カスタムJSONを読み込む').setInputFiles({name:'6b-test-only.json',mimeType:'application/json',buffer:await readFile('tests/fixtures/phase5a1-kyoto-map-config.json')});
 for(const p of pages.slice(1)){await p.getByLabel('参加ルームコード').fill(code);await p.getByRole('button',{name:'ルームへ参加',exact:true}).click();}await page.getByRole('button',{name:'オンラインゲーム開始',exact:true}).click();await expect(page.getByTestId('online-phase')).toContainText('第1年');
}
async function anchor(page:Page,id:string){return page.locator(`[data-region-id="${id}"]`).evaluate(el=>{const [x,y]=el.getAttribute('data-display-center')!.split(',').map(Number);const p=new DOMPoint(x,y).matrixTransform((el as SVGGraphicsElement).getScreenCTM()!);return {x:p.x,y:p.y};});}
type AudioWindow=Window&{realSfx:HTMLAudioElement[]};
test('6B 実京都・両解像度のSCマウス/キーボード選択・自然背景・fit・dock・右クリック回帰・実WAV7種',async({browser})=>{
 test.setTimeout(90000);const contexts=await Promise.all([0,1,2].map(()=>browser.newContext({viewport:{width:1920,height:1080}}))),pages=await Promise.all(contexts.map(c=>c.newPage()));const page=pages[0],state=watch(page),errors:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 // Observe actual HTMLAudioElements without replacing playback or decoding.
 await page.addInitScript(()=>{const records:HTMLAudioElement[]=[]; (window as unknown as AudioWindow).realSfx=records;const NativeAudio=window.Audio;window.Audio=class extends NativeAudio {constructor(src?:string){super(src);records.push(this);}};});
 try{
  await start(pages);await expect(page.locator('.playable-region')).toHaveCount(190);await expect(page.locator('.supply-circle')).toHaveCount(72);
  for(const size of [{width:1920,height:1080},{width:1280,height:720}]){
   await page.setViewportSize(size);await page.getByLabel('オンライン行政区').selectOption('all');await page.getByRole('button',{name:'全体に戻す',exact:true}).click();await page.mouse.move(50,75);
   const view=await page.locator('svg.map').getAttribute('viewBox');const svg=(await page.locator('svg.map').boundingBox())!;const values=view!.split(' ').map(Number);expect(values[2]/values[3]).toBeCloseTo(svg.width/svg.height,2);expect(values[3]).toBeLessThan(300);
   await expect(page.locator('[data-nature-layer]')).toHaveCSS('pointer-events','none');await expect(page.locator('.terrain-backdrop mask path')).toHaveCount(190+state.room!.map!.obstacles.length);
   const allVisible=await page.locator('.supply-circle').evaluateAll(els=>{const box=document.querySelector('svg.map')!.getBoundingClientRect();return els.every(el=>{const b=el.getBoundingClientRect();return b.left>=box.left&&b.right<=box.right&&b.top>=box.top&&b.bottom<=box.bottom;});});expect(allVisible).toBe(true);
   await page.screenshot({path:`test-results/phase6b-normal-${size.width}.png`,animations:'disabled'});
   await page.getByRole('button',{name:'全域を表示',exact:true}).click();expect(Number((await page.locator('svg.map').getAttribute('viewBox'))!.split(' ')[3])).toBeGreaterThan(values[3]);await page.screenshot({path:`test-results/phase6b-nature-${size.width}.png`,animations:'disabled'});
   await page.getByLabel('オンライン行政区').selectOption('26106');await page.getByRole('button',{name:/選択(?:区|地域)を拡大/}).click();const sc=state.room!.map!.regions.find(r=>r.wardId==='26106'&&r.isSupplyCenter&&!state.room!.game!.board.units.some(u=>u.regionId===r.regionId))!;
   const marker=page.locator(`[data-supply-region="${sc.regionId}"]`);await marker.locator('.supply-circle').click();await expect(marker).toBeFocused();await expect(marker).toHaveCSS('outline-style','none');await expect(marker.locator('.supply-selection-ring')).toHaveCSS('fill','none');await expect(marker.locator('.supply-selection-ring')).toHaveCSS('opacity','1');await expect(marker.locator('.supply-circle')).toHaveAttribute('r','6');await page.mouse.move(50,75);
   await page.screenshot({path:`test-results/phase6b-sc-selected-${size.width}.png`,animations:'disabled'});await marker.press('Tab');await marker.focus();await marker.press('Enter');await expect(marker).toHaveCSS('outline-style','none');
   await page.getByLabel('オンライン行政区').selectOption('26102');await page.getByRole('button',{name:/選択(?:区|地域)を拡大/}).click();const selected=state.room!.game!.board.units.find(u=>u.ownerWardId==='26102'&&state.self!.legalOrders[u.unitId].some(o=>o.type==='move'))!,move=state.self!.legalOrders[selected.unitId].find(o=>o.type==='move')!;if(move.type!=='move')throw Error('Move fixture');
   await page.locator(`[data-marker-region="${selected.regionId}"] .unit-pin`).click();await expect(page.getByLabel('選択軍の操作')).toBeVisible();await expect(page.locator('.army-layer .region-marker-label')).toHaveCount(1);await page.screenshot({path:`test-results/phase6b-army-dock-${size.width}.png`,animations:'disabled'});
   const point=await anchor(page,move.destination),before=await page.locator('svg.map').getAttribute('viewBox');await page.mouse.move(point.x,point.y);await page.mouse.down({button:'right'});await page.mouse.move(point.x+1,point.y+1);await page.mouse.up({button:'right'});expect(await page.locator('svg.map').getAttribute('viewBox')).toBe(before);
   await expect.poll(()=>state.self?.orders.some(o=>o.unitId===selected.unitId&&o.type==='move'&&o.destination===move.destination)).toBe(true);await expect(page.locator('.move-line')).toHaveCount(1);await expect(page.locator('.command-summary')).toContainText('移動');await page.screenshot({path:`test-results/phase6b-move-${size.width}.png`,animations:'disabled'});await page.getByRole('button',{name:'命令を変更',exact:true}).click();
   await page.getByRole('button',{name:'イベント・結果',exact:true}).click();await page.getByTestId('current-events').getByRole('button',{name:'地図で見る',exact:true}).first().click();await page.screenshot({path:`test-results/phase6b-event-${size.width}.png`,animations:'disabled'});await page.getByRole('button',{name:'イベントトレイを閉じる',exact:true}).click();
   await page.getByRole('button',{name:'全体に戻す',exact:true}).click();await page.locator('.audio-settings > summary').click();await page.locator('.sfx-preview > summary').click();await page.getByRole('button',{name:'効果音を試す: 勝利',exact:true}).click();await page.screenshot({path:`test-results/phase6b-sfx-${size.width}.png`,animations:'disabled'});
   for(const [cue,asset] of Object.entries(sfxManifest)){
    await page.getByRole('button',{name:`効果音を試す: ${asset.label}`,exact:true}).click();await expect.poll(()=>page.evaluate(src=>{const a=(window as unknown as AudioWindow).realSfx.filter(a=>a.src.endsWith(src)).at(-1);return a?{loaded:a.readyState>=2,duration:a.duration>0,time:a.currentTime>0}:null;},asset.src)).toEqual({loaded:true,duration:true,time:true});
    const response=await page.request.get(asset.src);expect(response.status(),cue).toBe(200);expect(response.headers()['content-type']).toContain('audio');
   }
   await page.getByRole('button',{name:'効果音 ON/OFF',exact:true}).click();await expect(page.getByRole('button',{name:'効果音を試す: 選択',exact:true})).toBeDisabled();expect(await page.evaluate(()=>(window as unknown as AudioWindow).realSfx.filter(a=>a.src.includes('/sfx/')).every(a=>a.paused))).toBe(true);await page.getByRole('button',{name:'効果音 ON/OFF',exact:true}).click();
   await page.getByLabel('効果音音量').fill('25');await page.getByRole('button',{name:'効果音を試す: 選択',exact:true}).click();expect(await page.evaluate(()=>(window as unknown as AudioWindow).realSfx.filter(a=>a.src.endsWith('/select.wav')).at(-1)!.volume)).toBeCloseTo(.25*.45);await page.getByLabel('効果音音量').fill('70');await page.locator('.sfx-preview > summary').click();await page.locator('.audio-settings > summary').click();
  }
  expect(errors).toEqual([]);
 }finally{await Promise.all(contexts.map(c=>c.close()));}
});
test('6B WAVが404でも選択・右クリックMove・矢印・dockは使える',async({browser})=>{
 const contexts=await Promise.all([0,1,2].map(()=>browser.newContext())),pages=await Promise.all(contexts.map(c=>c.newPage()));const page=pages[0],state=watch(page),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/audio/sfx/*.wav',r=>r.fulfill({status:404,body:''}));
 try{await start(pages);await page.getByLabel('オンライン行政区').selectOption('26102');await page.getByRole('button',{name:/選択(?:区|地域)を拡大/}).click();const unit=state.room!.game!.board.units.find(u=>u.ownerWardId==='26102'&&state.self!.legalOrders[u.unitId].some(o=>o.type==='move'))!,move=state.self!.legalOrders[unit.unitId].find(o=>o.type==='move')!;if(move.type!=='move')throw Error('Move fixture');await page.locator(`[data-marker-region="${unit.regionId}"] .unit-pin`).click();const at=await anchor(page,move.destination);await page.mouse.click(at.x,at.y,{button:'right'});await expect(page.locator('.command-summary')).toContainText('移動');await expect(page.locator('.move-line')).toHaveCount(1);expect(errors).toEqual([]);}finally{await Promise.all(contexts.map(c=>c.close()));}
});


