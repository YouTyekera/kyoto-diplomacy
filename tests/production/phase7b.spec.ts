import {test,expect} from '@playwright/test';
const copy='京都の街を分け合い、交渉し、裏をかき、補給拠点を奪い合う。\n一手の読みと会話の駆け引きが、そのまま勝敗につながる。\n本家ディプロマシーに運の要素を加えた京都発戦略ボードゲーム';
test('公開トップの確定コピー・画像200・OGP・3サイズのfirst view',async({page})=>{
 for(const [width,height] of [[1920,1080],[1280,720],[390,844]]){
  await page.setViewportSize({width,height});await page.goto('/');await expect(page.getByTestId('title-copy')).toHaveText(copy);
  expect(await page.getByTestId('title-copy').textContent()).toBe(copy);
  await expect(page.getByRole('img')).toBeVisible();await expect.poll(()=>page.getByRole('img').evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth===1600)).toBe(true);
  const box=await page.getByRole('button',{name:'オンライン対戦',exact:true}).boundingBox();expect(box!.y+box!.height).toBeLessThan(height);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(await page.locator('.developer-tools').getAttribute('open')).toBeNull();
  const accessible=await page.locator('body').evaluate(el=>(el as HTMLElement).innerText+' '+Array.from(el.querySelectorAll('[aria-label],[title],[alt]')).map(n=>[n.getAttribute('aria-label'),n.getAttribute('title'),n.getAttribute('alt')].join(' ')).join(' '));expect(accessible).not.toMatch(/army|\bSC\b/i);
  await page.screenshot({path:`docs/screenshots/phase7b/public-top-${width}.png`,fullPage:width===390});
 }
 await expect(page).toHaveTitle('京都市版 Diplomacy');
 await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content','https://kyoto-diplomacy-web.onrender.com/');
 await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content','https://kyoto-diplomacy-web.onrender.com/og/kyoto-diplomacy-og.png');
 // Fetch in Chromium so the test's public-host resolver also applies.
 const html=await page.evaluate(async()=>await(await fetch('/')).text());for(const tag of ['og:title','og:description','og:type','og:url','og:image','og:image:width','og:image:height','og:image:alt','twitter:card'])expect(html).toContain(`"${tag}"`);
 const statuses=await page.evaluate(async()=>await Promise.all(['/media/kyoto-board-hero.webp','/og/kyoto-diplomacy-og.png'].map(async path=>(await fetch(path)).status)));expect(statuses).toEqual([200,200]);
 const image=await page.evaluate(async()=>{const img=new Image();img.src='/og/kyoto-diplomacy-og.png';await img.decode();return[img.naturalWidth,img.naturalHeight];});expect(image).toEqual([1200,630]);
});
