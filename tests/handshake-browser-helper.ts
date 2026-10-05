import {expect,type Browser,type Page} from '@playwright/test';
import {instrument} from './session-browser-helper';
import {currentId,historyCount,closeIdentityContexts} from './identity-browser-helper';
import {identityPrefix} from '../apps/web/src/online-identities';
export async function savedId(page:Page){return page.evaluate(prefix=>{const key=Object.keys(localStorage).find(k=>k.startsWith(prefix));if(!key)return null;const entry=JSON.parse(localStorage.getItem(key)!);return {playerId:entry.playerId as string,updatedAt:entry.updatedAt as number};},identityPrefix);}
export async function enter(page:Page,baseURL:string,nickname:string,code?:string){await instrument(page);await page.goto(code?`${baseURL}/?room=${code}`:baseURL);if(!code)await page.getByRole('button',{name:'オンライン対戦',exact:true}).click();await page.getByLabel('オンラインニックネーム').fill(nickname);await expect(page.getByText('サーバー接続中',{exact:true})).toBeVisible();}
export async function identityHandshake(browser:Browser,baseURL:string,folder:string){
 const contexts=await Promise.all([0,1,2].map(()=>browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1280,height:720}}))),pages=await Promise.all(contexts.map(c=>c.newPage()));
 try{
  await enter(pages[0],baseURL,'保存確認ホスト');await pages[0].getByRole('button',{name:'ルームを作成',exact:true}).click();await expect.poll(()=>historyCount(pages[0])).toBe(1);await expect(pages[0].getByTestId('room-code')).toBeVisible();const code=await pages[0].getByTestId('room-code').innerText();
  await enter(pages[1],baseURL,'保存確認ゲスト',code);await pages[1].getByRole('button',{name:'ルームへ参加',exact:true}).click();await expect.poll(()=>historyCount(pages[1])).toBe(1);const id=(await savedId(pages[1]))!.playerId;await expect(pages[1].getByTestId('room-code')).toBeVisible();expect(await currentId(pages[1])).toBe(id);
  await enter(pages[2],baseURL,'保存確認参加者2',code);await pages[2].getByRole('button',{name:'ルームへ参加',exact:true}).click();await expect(pages[0].getByRole('button',{name:'オンラインゲーム開始',exact:true})).toBeEnabled();
  await pages[1].reload();await expect(pages[1].locator('.ready-panel li')).toHaveCount(3);await expect(pages[1].locator('[data-connection-state]')).toHaveAttribute('data-connection-state','online');expect(await currentId(pages[1])).toBe(id);for(const page of pages)await expect(page.locator('.ready-panel li')).toHaveCount(3);
  const revisit=await contexts[1].newPage();await revisit.goto(`${baseURL}/?room=${code}`);await expect(revisit.getByRole('button',{name:'保存確認ゲストとして復帰',exact:true})).toBeVisible();await expect(revisit.getByRole('button',{name:'ルームへ参加',exact:true})).toHaveCount(0);await revisit.screenshot({path:`${folder}/invite-restore-choice.png`,fullPage:true});
 }finally{await closeIdentityContexts(contexts);}
}
