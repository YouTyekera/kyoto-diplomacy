import { test, expect } from '@playwright/test';

test('招待URLでは編集中の地域データを読まずにオンライン待機画面を開ける', async ({page}) => {
  const geographyRequests:string[]=[];
  page.on('request', request=>{
    if(new URL(request.url()).pathname.endsWith('/regions.json')) geographyRequests.push(request.url());
  });
  await page.goto('/?room=ABC234');
  await expect(page.getByRole('heading',{name:'オンライン対戦'})).toBeVisible();
  expect(geographyRequests).toEqual([]);
  await page.getByRole('button',{name:'トップへ戻る'}).click();
  await expect.poll(()=>geographyRequests.length).toBe(1);
  await expect(page.getByRole('button',{name:'オンライン対戦'})).toBeVisible();
});
