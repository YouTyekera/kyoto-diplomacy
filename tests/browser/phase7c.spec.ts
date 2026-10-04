import {test,expect} from '@playwright/test';
import {lobby,breakTransport,resume,locked,hostRecovery} from '../session-browser-helper';
test('7C Host開始直前瞬断・transport復帰後/本人状態前のロック・権限維持・3人開始',async({browser,baseURL})=>{test.setTimeout(90000);await hostRecovery(browser,baseURL!,'docs/screenshots/phase7c');});
test('7C guest瞬断・開始不可・復帰後にHostが開始',async({browser,baseURL})=>{
 test.setTimeout(60000);const {contexts,pages,state}=await lobby(browser,baseURL!),host=pages[0],guest=pages[1],id=state.room!.hostId;
 try{await breakTransport(guest);await expect(host.getByRole('button',{name:'オンラインゲーム開始',exact:true})).toBeDisabled();await resume(guest);await expect(guest.locator('[data-room-session]')).toHaveCount(0);await expect(host.getByRole('button',{name:'オンラインゲーム開始',exact:true})).toBeEnabled();expect(state.room!.hostId).toBe(id);await host.getByRole('button',{name:'オンラインゲーム開始',exact:true}).click();for(const page of pages)await expect(page.getByTestId('online-phase')).toContainText('第1年');}
 finally{await Promise.all(contexts.map(c=>c.close()));}
});
test('7C reconnect拒否でもstale Room UIの操作は解放されない',async({browser,baseURL})=>{
 test.setTimeout(60000);const {contexts,pages}=await lobby(browser,baseURL!),host=pages[0];
 try{await host.evaluate(()=>{window.recoveryTest.failReconnect=true;});await breakTransport(host);await resume(host);await expect(host.getByRole('alert')).toContainText('ルームに復帰できません');await expect(host.locator('[data-connection-state]')).toHaveAttribute('data-connection-state','unavailable');await locked(host);await expect(host.getByTestId('room-code')).toBeVisible();
 const sent=await host.evaluate(()=>window.recoveryTest.sent.length);await host.getByRole('button',{name:'オンラインゲーム開始',exact:true}).evaluate(el=>el.dispatchEvent(new MouseEvent('click',{bubbles:true})));expect(await host.evaluate(()=>window.recoveryTest.sent.length)).toBe(sent);await host.screenshot({path:'docs/screenshots/phase7c/reconnect-rejected.png'});await expect(host.getByRole('button',{name:'保存した参加情報を消す',exact:true})).toBeEnabled();}
 finally{await Promise.all(contexts.map(c=>c.close()));}
});
