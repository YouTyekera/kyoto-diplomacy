import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import type {PublicRoomView,PrivatePlayerView} from '../../packages/shared/online';
function watch(page:Page){const state:{room?:PublicRoomView;self?:PrivatePlayerView}={};page.on('websocket',s=>s.on('framereceived',f=>{const p=String(f.payload);if(!p.startsWith('42['))return;const [event,v]=JSON.parse(p.slice(2));if(event==='publicState')state.room={...v,map:v.map??state.room?.map};if(event==='privateState')state.self=v;}));return state;}
async function start(pages:Page[]){
 for(let i=0;i<3;i++){await pages[i].goto('/');await pages[i].getByRole('button',{name:'オンライン対戦',exact:true}).click();await pages[i].getByLabel('オンラインニックネーム').fill(`6C-${i}`);await pages[i].getByLabel('オンライン希望区').selectOption(['26102','26104','26111'][i]);await expect(pages[i].getByText('サーバー接続中',{exact:true})).toBeVisible();}
 const page=pages[0];await page.getByRole('button',{name:'ルームを作成',exact:true}).click();await expect(page.locator('.room-facts')).toContainText('ホスト:');await expect(page.locator('.room-facts')).toContainText('3人参加後に計算');await expect(page.locator('.room-facts')).not.toContainText('計算か所');const code=await page.getByTestId('room-code').innerText();await page.getByLabel('カスタムJSONを読み込む').setInputFiles({name:'6c-test-only.json',mimeType:'application/json',buffer:await readFile('tests/fixtures/phase5a1-kyoto-map-config.json')});await page.getByLabel('オンライン規定年数').fill('2');
 for(const p of pages.slice(1)){await p.getByLabel('参加ルームコード').fill(code);await p.getByRole('button',{name:'ルームへ参加',exact:true}).click();}await page.getByRole('button',{name:'オンラインゲーム開始',exact:true}).click();await expect(page.getByTestId('online-phase')).toContainText('第1年');
}
test('6C 両解像度で中立拠点の視覚/クリック・ズーム上限・動的勝利条件・開いたまま右クリックMove',async({browser})=>{
 test.setTimeout(90000);const contexts=await Promise.all([0,1,2].map(()=>browser.newContext({viewport:{width:1920,height:1080}}))),pages=await Promise.all(contexts.map(c=>c.newPage())),page=pages[0],state=watch(page);
 try{
  await start(pages);await expect(page.getByTestId('victory-target')).toContainText('補給拠点');
  await page.getByRole('button',{name:'参加者・装備',exact:true}).click();await page.getByRole('button',{name:'イベント・結果',exact:true}).click();
  expect(await page.locator('.game-layout').innerText()).not.toMatch(/(?<![A-Za-z])SC(?![A-Za-z])/);await page.getByRole('button',{name:'イベントトレイを閉じる',exact:true}).click();await page.getByRole('button',{name:'参加者・装備',exact:true}).click();
  for(const size of [{width:1920,height:1080},{width:1280,height:720}]){
   await page.setViewportSize(size);await page.getByRole('button',{name:'全域を表示',exact:true}).click();
   const all=(await page.locator('svg.map').getAttribute('viewBox'))!.split(' ').map(Number);
   const scId=await page.locator('[data-supply-owner="neutral"] .supply-circle').first().evaluate(el=>el.closest('[data-supply-region]')!.getAttribute('data-supply-region'));
   const sc=page.locator(`[data-supply-region="${scId}"] .supply-circle`);await expect(sc).toHaveAttribute('r',String(6*.7));
   const group=sc.locator('xpath=../..'),hit=group.locator('.supply-hit-target');expect(Number(await hit.getAttribute('r'))).toBeGreaterThanOrEqual(8.5);
   // Click outside the smaller visible circle, inside the unchanged transparent target.
   const point=await hit.evaluate(el=>{const p=new DOMPoint(7,0).matrixTransform((el as SVGGraphicsElement).getScreenCTM()!);return{x:p.x,y:p.y};});await page.mouse.click(point.x,point.y);await expect(group.locator('.supply-selection-ring')).toHaveCSS('opacity','1');
   await page.screenshot({path:`test-results/phase6c-wide-${size.width}.png`,animations:'disabled'});
   for(let i=0;i<8;i++)await page.getByRole('button',{name:'縮小',exact:true}).click();
   expect(Number((await page.locator('svg.map').getAttribute('viewBox'))!.split(' ')[2])).toBeLessThanOrEqual(all[2]*1.04001);
   const box=(await page.locator('svg.map').boundingBox())!;await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.wheel(0,8000);
   await expect.poll(async()=>Number((await page.locator('svg.map').getAttribute('viewBox'))!.split(' ')[2])).toBeLessThanOrEqual(all[2]*1.04001);
   await page.getByRole('button',{name:'全体に戻す',exact:true}).click();expect(Number(await sc.getAttribute('r'))).toBeCloseTo(6);
   await page.getByLabel('オンライン行政区').selectOption('26102');await page.getByRole('button',{name:'選択地域を拡大',exact:true}).click();
   await page.getByRole('button',{name:'勝利条件',exact:true}).click();const panel=page.getByLabel('この対局の勝利条件');await expect(panel).toContainText(`補給拠点を${state.room!.game!.victoryTargetSC}か所`);await expect(panel).toContainText('補給拠点を2か所');await expect(panel).toContainText('2年目の冬');await expect(panel).toContainText('共同勝利');expect(await page.locator('[aria-modal="true"]').count()).toBe(0);
   const unit=state.room!.game!.board.units.find(u=>u.ownerWardId==='26102'&&state.self!.legalOrders[u.unitId].some(o=>o.type==='move'))!,move=state.self!.legalOrders[unit.unitId].find(o=>o.type==='move')!;if(move.type!=='move')throw Error('fixture');
   await page.locator(`[data-marker-region="${unit.regionId}"] .unit-pin`).click();const dest=await page.locator(`[data-region-id="${move.destination}"]`).evaluate(el=>{const [x,y]=el.getAttribute('data-display-center')!.split(',').map(Number);const p=new DOMPoint(x,y).matrixTransform((el as SVGGraphicsElement).getScreenCTM()!);return{x:p.x,y:p.y};});await page.mouse.click(dest.x,dest.y,{button:'right'});
   await expect(page.locator('.move-line')).toHaveCount(1);await expect(page.locator('.command-summary')).toContainText('移動');await expect(panel).toBeVisible();await page.screenshot({path:`test-results/phase6c-victory-move-${size.width}.png`,animations:'disabled'});
   await page.getByRole('button',{name:'勝利条件を閉じる',exact:true}).click();await page.getByRole('button',{name:'命令を変更',exact:true}).click();await expect(page.locator('.move-line')).toHaveCount(0);await page.getByLabel('オンライン行政区').selectOption('all');
  }
 }finally{await Promise.all(contexts.map(c=>c.close()));}
});
