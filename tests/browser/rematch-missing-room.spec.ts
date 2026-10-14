import { test,expect } from '@playwright/test';
test('missing previous room keeps history, stops automatic restore and permits a new room',async({page})=>{
 await page.addInitScript(()=>{
  if(sessionStorage.getItem('missing-room-fixture-installed'))return;
  const value={roomCode:'ZZZ234',playerId:'missing-ux',reconnectToken:'a'.repeat(64),nickname:'以前の参加者',updatedAt:1};
  localStorage.setItem('kyoto-online-identities-v1:ZZZ234:missing-ux',JSON.stringify(value));sessionStorage.setItem('kyoto-online-active-identity-v2',JSON.stringify({roomCode:value.roomCode,playerId:value.playerId}));sessionStorage.setItem('missing-room-fixture-installed','true');
 });
 let reconnects=0;page.on('websocket',s=>s.on('framesent',f=>{if(String(f.payload).includes('"action":"reconnect"'))reconnects++;}));
 await page.goto('/?room=ZZZ234');await expect(page.getByRole('status').filter({hasText:'保存したルームに復帰できません'})).toBeVisible();
 expect(await page.evaluate(()=>!!localStorage.getItem('kyoto-online-identities-v1:ZZZ234:missing-ux'))).toBe(true);
 await page.getByRole('button',{name:'新しいゲームを作る',exact:true}).click();await page.getByLabel('オンラインニックネーム').fill('新規参加');
 await page.getByRole('button',{name:'ルームを作成',exact:true}).click();await expect(page.getByTestId('room-code')).toBeVisible();expect(reconnects).toBe(1);
 expect(await page.evaluate(()=>!!localStorage.getItem('kyoto-online-identities-v1:ZZZ234:missing-ux'))).toBe(true);
});
