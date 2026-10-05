import {test,expect} from '@playwright/test';
import {identityRecovery,hostExpiry,currentId,kick,closeIdentityContexts,historyCount} from '../identity-browser-helper';
import {instrument,breakTransport,resume,lobby} from '../session-browser-helper';
test('7E 3人・Host reload/20秒瞬断/別tab復帰・重複拒否・スマホpresence一致・接続中kick',async({browser,baseURL})=>{test.setTimeout(110000);await identityRecovery(browser,baseURL!,'docs/screenshots/phase7e');});
test('7E 実60秒超過でHost移譲・切断者は開始不可・切断中kick後の古い復帰を拒否',async({browser,baseURL})=>{test.setTimeout(110000);await hostExpiry(browser,baseURL!);});
test('7E 同一ブラウザの3tab/複数identity・browser再起動相当・切断中の別identity kick',async({browser,baseURL})=>{
 test.setTimeout(90000);const context=await browser.newContext(),pages=await Promise.all([0,1,2].map(()=>context.newPage()));let restarted:Awaited<ReturnType<typeof browser.newContext>>|undefined;
 try{let code='';const ids:string[]=[];for(let i=0;i<3;i++){const page=pages[i];await instrument(page);await page.goto(i?`${baseURL}/?room=${code}`:baseURL!);if(!i)await page.getByRole('button',{name:'オンライン対戦',exact:true}).click();else{await expect(page.getByRole('button',{name:'別の参加者として入る',exact:true})).toBeVisible();await page.getByRole('button',{name:'別の参加者として入る',exact:true}).click();}await page.getByLabel('オンラインニックネーム').fill(`同一端末${i}`);await expect(page.getByText('サーバー接続中',{exact:true})).toBeVisible();await page.getByRole('button',{name:i?'ルームへ参加':'ルームを作成',exact:true}).click();await expect(page.getByTestId('room-code')).toBeVisible();code=await page.getByTestId('room-code').innerText();await expect.poll(()=>currentId(page)).toBeTruthy();ids.push(await currentId(page));}
  expect(new Set(ids).size).toBe(3);for(let i=0;i<3;i++)expect(await currentId(pages[i])).toBe(ids[i]);expect(await historyCount(pages[0])).toBe(3);
  const state=await context.storageState();restarted=await browser.newContext({storageState:state});const revisit=await restarted.newPage();await instrument(revisit);await revisit.goto(`${baseURL}/?room=${code}`);await expect(revisit.getByRole('heading',{name:'どの参加者として復帰しますか？'})).toBeVisible();for(let i=0;i<3;i++)await expect(revisit.getByRole('button',{name:`同一端末${i}として復帰`,exact:true})).toBeVisible();
  await revisit.getByRole('button',{name:'同一端末1として復帰',exact:true}).click();await expect(revisit.getByTestId('room-code')).toBeVisible();await expect.poll(()=>currentId(revisit)).toBe(ids[1]);await expect(pages[1].getByText('別のタブで復帰したため、このタブの参加を終了しました。',{exact:true})).toBeVisible();
  await breakTransport(pages[2]);await kick(pages[0],ids[2],'同一端末2');await expect(pages[0].locator(`[data-player-id="${ids[2]}"]`)).toHaveCount(0);await resume(pages[2]);await expect(pages[2].getByRole('alert')).toContainText('ルームに復帰できません');await pages[2].getByRole('button',{name:'保存した参加情報を消す',exact:true}).click();await expect(pages[2].getByTestId('room-code')).toHaveCount(0);expect(await currentId(pages[0])).toBe(ids[0]);expect(await historyCount(pages[0])).toBe(2);
 }finally{await closeIdentityContexts(restarted?[context,restarted]:[context]);}
});

test('7E join応答の到着前にkickされても保存identityとstale Roomを残さない',async({browser,baseURL})=>{
 const {contexts,pages}=await lobby(browser,baseURL!),extra=await browser.newContext(),guest=await extra.newPage();
 try{
  await instrument(guest);await guest.goto(`${baseURL}/?room=${await pages[0].getByTestId('room-code').innerText()}`);await guest.getByLabel('オンラインニックネーム').fill('応答待ち参加者');await expect(guest.getByText('サーバー接続中',{exact:true})).toBeVisible();await expect.poll(()=>guest.evaluate(()=>window.recoveryTest.upgraded?.readyState)).toBe(1);
  await guest.evaluate(()=>{window.recoveryTest.holdAcks=true;});await guest.getByRole('button',{name:'ルームへ参加',exact:true}).click();await expect.poll(()=>guest.evaluate(()=>window.recoveryTest.ackFrames.length)).toBeGreaterThan(0);
  const row=pages[0].locator('.ready-panel li').filter({hasText:'応答待ち参加者'}),id=await row.getAttribute('data-player-id');expect(id).toBeTruthy();await kick(pages[0],id!,'応答待ち参加者');await expect(row).toHaveCount(0);
  await guest.evaluate(()=>{const c=window.recoveryTest;c.holdAcks=false;for(const frame of c.ackFrames.splice(0))(frame.socket??c.upgraded!).dispatchEvent(new MessageEvent('message',{data:frame.data}));});
  await expect(guest.getByText('ホストによりルームから退出しました。',{exact:true})).toBeVisible();await expect(guest.getByTestId('room-code')).toHaveCount(0);expect(await historyCount(guest)).toBe(0);
 }finally{await closeIdentityContexts([...contexts,extra]);}
});
