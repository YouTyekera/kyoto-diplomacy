import {expect,type Browser,type Page,type BrowserContext} from '@playwright/test';
import {lobby,breakTransport,resume,instrument} from './session-browser-helper';
import {activeIdentityKey,identityPrefix} from '../apps/web/src/online-identities';
export const historyCount=(page:Page)=>page.evaluate(prefix=>Object.keys(localStorage).filter(k=>k.startsWith(prefix)).length,identityPrefix);
export const currentId=(page:Page)=>page.evaluate(key=>JSON.parse(sessionStorage.getItem(key)!).playerId as string,activeIdentityKey);
export async function closeIdentityContexts(contexts:BrowserContext[]){for(const context of contexts)for(const page of context.pages())await page.unrouteAll({behavior:'ignoreErrors'});await Promise.all(contexts.map(c=>c.close()));}
export async function presence(pages:Page[],id:string,value:'connected'|'disconnected'|'checking'){
 for(const page of pages)await expect(page.locator(`.ready-panel [data-player-id="${id}"]`)).toHaveAttribute('data-presence',value);
}
export async function kick(page:Page,id:string,nickname:string){
 const dialog=page.waitForEvent('dialog');const action=page.locator(`.ready-panel [data-player-id="${id}"]`).getByRole('button',{name:'退出させる',exact:true}).click();const confirmation=await dialog;expect(confirmation.message()).toBe(`「${nickname}」をルームから退出させますか？`);await confirmation.accept();await action;
}
export async function identityRecovery(browser:Browser,baseURL:string,folder:string){
 const {contexts,pages,state}=await lobby(browser,baseURL),host=pages[0],guest=pages[1],hostId=await currentId(host),guestId=await currentId(guest),code=await host.getByTestId('room-code').innerText();
 try{
  await guest.setViewportSize({width:390,height:844});await presence(pages,hostId,'connected');
  await host.reload();await expect(host.getByRole('button',{name:'オンラインゲーム開始',exact:true})).toBeEnabled();expect(await currentId(host)).toBe(hostId);await presence(pages,hostId,'connected');
  await breakTransport(host);await presence([host],hostId,'checking');await presence(pages.slice(1),hostId,'disconnected');
  await expect(pages[1].getByText('ホストの再接続を待っています…',{exact:true})).toBeVisible();await expect(pages[1].getByText(/残り\d+秒/)).toBeVisible();
  // Real wall time: verify a 20-second outage, not just a fake timer.
  await new Promise<void>(resolve=>setTimeout(resolve,20000));expect(state.room!.hostId).toBe(hostId);await resume(host);
  await expect(host.getByRole('button',{name:'オンラインゲーム開始',exact:true})).toBeEnabled();expect(await currentId(host)).toBe(hostId);expect(state.room!.hostId).toBe(hostId);await presence(pages,hostId,'connected');
  await breakTransport(guest);await presence([guest],guestId,'checking');await presence([host,pages[2]],guestId,'disconnected');await resume(guest);await presence(pages,guestId,'connected');
  const newTab=await contexts[0].newPage();await instrument(newTab);await newTab.goto(`${baseURL}/?room=${code}`);await expect(newTab.getByRole('button',{name:'接続確認0として復帰',exact:true})).toBeVisible();await expect(newTab.getByRole('button',{name:'ルームへ参加',exact:true})).toHaveCount(0);await newTab.getByRole('button',{name:'接続確認0として復帰',exact:true}).click();await expect(newTab.getByRole('button',{name:'オンラインゲーム開始',exact:true})).toBeEnabled();expect(await currentId(newTab)).toBe(hostId);
  await expect(host.getByText('別のタブで復帰したため、このタブの参加を終了しました。',{exact:true})).toBeVisible();await expect(host.getByTestId('room-code')).toHaveCount(0);await presence([newTab,guest,pages[2]],hostId,'connected');
  const before=state.room!.players.length;await host.getByRole('button',{name:'別の参加者として入る',exact:true}).click();await host.getByLabel('参加ルームコード').fill(code);await host.getByLabel('オンラインニックネーム').fill('接続確認0');await host.getByRole('button',{name:'ルームへ参加',exact:true}).click();await expect(host.getByRole('alert')).toContainText('同じニックネームの参加者がいます');expect(state.room!.players.length).toBe(before);
  await newTab.screenshot({path:`${folder}/restored-presence.png`,fullPage:true});
  await kick(newTab,guestId,'接続確認1');await expect(guest.getByText('ホストによりルームから退出しました。',{exact:true})).toBeVisible();await expect(guest.getByTestId('room-code')).toHaveCount(0);await expect(guest.locator('[data-player-id]')).toHaveCount(0);
  expect(await guest.evaluate(key=>sessionStorage.getItem(key),activeIdentityKey)).toBeNull();expect(await historyCount(guest)).toBe(0);
  await guest.screenshot({path:`${folder}/kicked-mobile.png`,fullPage:true});
 }finally{await closeIdentityContexts(contexts);}
}

export async function hostExpiry(browser:Browser,baseURL:string){
 const {contexts,pages}=await lobby(browser,baseURL),host=pages[0],id=await currentId(host);
 try{await breakTransport(host);await presence(pages.slice(1),id,'disconnected');for(const page of pages.slice(1))await expect(page.getByRole('button',{name:'オンラインゲーム開始',exact:true})).toHaveCount(0);
  await expect.poll(async()=>Promise.all(pages.slice(1).map(p=>p.getByRole('button',{name:'オンラインゲーム開始',exact:true}).count())),{timeout:65000,intervals:[1000]}).toContain(1);
  const successor=(await pages[1].getByRole('button',{name:'オンラインゲーム開始',exact:true}).count())?pages[1]:pages[2];await expect(successor.getByRole('button',{name:'オンラインゲーム開始',exact:true})).toBeDisabled();expect(await currentId(successor)).not.toBe(id);
  await kick(successor,id,'接続確認0');await resume(host);await expect(host.getByRole('alert')).toContainText('ルームに復帰できません');await expect(host.getByRole('button',{name:'オンラインゲーム開始',exact:true})).toBeDisabled();
  await host.getByRole('button',{name:'保存した参加情報を消す',exact:true}).click();await expect(host.getByTestId('room-code')).toHaveCount(0);for(const p of pages.slice(1))await expect(p.locator(`[data-player-id="${id}"]`)).toHaveCount(0);
 }finally{await closeIdentityContexts(contexts);}
}
