import { expect,type Page } from '@playwright/test';
export async function startPlayback(pages:Page[]){
  const all=pages[0].context().browser()?.contexts().flatMap(c=>c.pages())??pages;
  await expect(pages[0].locator('.operation-reveal')).toHaveAttribute('data-presentation-stage','reveal');
  await expect.poll(async()=>{for(const page of all)if(await page.getByRole('button',{name:'▶ 裁定開始',exact:true}).count())return true;return false;}).toBe(true);
  for(const page of all){const button=page.getByRole('button',{name:'▶ 裁定開始',exact:true});if(await button.count()){await button.click();return page;}}
  throw Error('Host playback control missing');
}
export async function finishPlayback(pages:Page[]){
  const host=await startPlayback(pages);
  await host.getByRole('button',{name:'演出をスキップ',exact:true}).click();
  for(const page of pages)await expect(page.locator('.operation-reveal')).toHaveCount(0);
}
