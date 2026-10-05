import {test,expect} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {identityHandshake,enter,savedId} from '../handshake-browser-helper';
import {currentId,historyCount,closeIdentityContexts} from '../identity-browser-helper';

test('7E.1 guest join直後の永続保存・同じIDでreload復帰・新tab inviteの復帰選択',async({browser,baseURL})=>{test.setTimeout(60000);await identityHandshake(browser,baseURL!,'docs/screenshots/phase7e1');});

test('7E.1 serverの同期publishを11秒停止してもcreate/join/reconnect ackは10秒以内、snapshot前はロック',async({browser,baseURL})=>{
 test.setTimeout(90000);const contexts=await Promise.all([0,1].map(()=>browser.newContext({viewport:{width:1280,height:720}}))),pages=await Promise.all(contexts.map(c=>c.newPage()));const timings:{action:string;ackAndSaveMs:number;snapshotMs:number}[]=[];
 try{
  for(let i=0;i<2;i++){
   const page=pages[i],code=i?await pages[0].getByTestId('room-code').innerText():undefined;await enter(page,baseURL!,i?'遅延保存ゲスト':'遅延保存ホスト',code);const start=await page.evaluate(()=>Date.now());await page.getByRole('button',{name:i?'ルームへ参加':'ルームを作成',exact:true}).click();
   await expect.poll(()=>historyCount(page),{timeout:9000,intervals:[50]}).toBe(1);const saved=(await savedId(page))!;const ackAndSaveMs=saved.updatedAt-start;expect(ackAndSaveMs).toBeLessThan(10000);await expect(page.getByTestId('room-code')).toHaveCount(0);await expect(page.locator('[data-connection-state]')).toHaveAttribute('data-connection-state','restoring');await expect(page.getByRole('button',{name:'ルームへ参加',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'ルームを作成',exact:true})).toBeDisabled();
   if(i)await page.screenshot({path:'docs/screenshots/phase7e1/identity-saved-before-snapshot.png'});
   await expect(page.getByTestId('room-code')).toBeVisible({timeout:20000});await expect(page.locator('[data-connection-state]')).toHaveAttribute('data-connection-state','online');expect(await currentId(page)).toBe(saved.playerId);const snapshotMs=await page.evaluate(()=>Date.now())-start;expect(snapshotMs).toBeGreaterThanOrEqual(11000);timings.push({action:i?'join':'create',ackAndSaveMs,snapshotMs});
  }
  const guest=pages[1],id=await currentId(guest),start=await guest.evaluate(()=>Date.now());await guest.reload();await expect.poll(()=>guest.evaluate(()=>window.recoveryTest.acknowledgements),{timeout:9000,intervals:[50]}).toBeGreaterThan(0);const ackAndSaveMs=await guest.evaluate(()=>Date.now())-start;expect(ackAndSaveMs).toBeLessThan(10000);expect(await historyCount(guest)).toBe(1);expect(await currentId(guest)).toBe(id);await expect(guest.getByTestId('room-code')).toHaveCount(0);await expect(guest.locator('[data-connection-state]')).toHaveAttribute('data-connection-state','restoring');
  await expect(guest.getByTestId('room-code')).toBeVisible({timeout:20000});await expect(guest.locator('[data-connection-state]')).toHaveAttribute('data-connection-state','online');expect(await currentId(guest)).toBe(id);await expect(pages[0].locator('.ready-panel li')).toHaveCount(2);const snapshotMs=await guest.evaluate(()=>Date.now())-start;expect(snapshotMs).toBeGreaterThanOrEqual(11000);timings.push({action:'reconnect',ackAndSaveMs,snapshotMs});
  await mkdir('docs/screenshots/phase7e1',{recursive:true});await writeFile('docs/screenshots/phase7e1/handshake-timings.json',JSON.stringify({publishBlockingMs:11000,timings},null,2)+'\n');
 }finally{await closeIdentityContexts(contexts);}
});
