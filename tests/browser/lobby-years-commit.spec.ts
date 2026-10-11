import { test, expect } from '@playwright/test';

test('lobby year changes are sent once when editing finishes',async({page})=>{
  const yearRequests:string[]=[];
  page.on('websocket',socket=>socket.on('framesent',frame=>{
    const payload=String(frame.payload);
    if(payload.includes('"action":"lobby-years"'))yearRequests.push(payload);
  }));
  await page.goto('/');
  await page.getByRole('button',{name:'オンライン対戦',exact:true}).click();
  await page.getByLabel('オンラインニックネーム').fill('年数ホスト');
  await page.getByRole('button',{name:'ルームを作成',exact:true}).click();
  const years=page.getByLabel('オンライン規定年数');
  await expect(years).toBeEnabled();
  await years.fill('');
  await years.pressSequentially('12');
  await page.waitForTimeout(150);
  expect(yearRequests).toHaveLength(0);
  await years.press('Tab');
  await expect.poll(()=>yearRequests.length).toBe(1);
  await expect(page.getByLabel('ルーム情報')).toContainText('規定年数: 12年');
});
