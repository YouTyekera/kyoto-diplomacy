import {test,expect} from '@playwright/test';
const copy='3〜11人で京都の街を奪い合う、交渉型オンライン戦略ゲーム。\n全員が同時に命令を出し、表面上の協力・裏切り・イベントを駆使して補給拠点の制覇を目指そう！';
test('公開トップの確定コピー・画像200・OGP・3サイズのfirst view',async({page})=>{
 for(const [width,height] of [[1920,1080],[1280,720],[390,844]]){
  await page.setViewportSize({width,height});await page.goto('/');await expect(page.getByTestId('title-copy')).toHaveText(copy);
  expect(await page.getByTestId('title-copy').textContent()).toBe(copy);
  await expect(page.getByRole('img')).toBeVisible();await expect.poll(()=>page.getByRole('img').evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth===1600)).toBe(true);
  const box=await page.getByRole('button',{name:'オンライン対戦',exact:true}).boundingBox();expect(box!.y+box!.height).toBeLessThan(height);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.getByRole('heading',{name:'京都ま市ー',exact:true})).toBeVisible();await expect(page.locator('h1 ruby rt')).toHaveText('きょうとましー');
  // Ruby's text Range includes font ascent above the visible base glyphs in Chromium.
  const ruby=await page.locator('h1 ruby').evaluate(el=>{const base=el.getBoundingClientRect();return{baseMiddle:base.top+base.height/2,readingBottom:el.querySelector('rt')!.getBoundingClientRect().bottom,position:getComputedStyle(el).rubyPosition};});expect(ruby.position).toBe('over');expect(ruby.readingBottom).toBeLessThan(ruby.baseMiddle);
  const credit=page.locator('.creator-credit');await expect(credit).toHaveText('Presented by ようちぇけら');const creditBox=await credit.boundingBox(),copyBox=await page.getByTestId('title-copy').boundingBox();expect(creditBox!.y).toBeGreaterThanOrEqual(copyBox!.y+copyBox!.height);expect(creditBox!.y+creditBox!.height).toBeLessThan(box!.y);
  const link=credit.getByRole('link',{name:'ようちぇけら',exact:true});await expect(link).toHaveAttribute('href','https://x.com/ReindeerSkyBean');await expect(link).toHaveAttribute('target','_blank');await expect(link).toHaveAttribute('rel','noopener noreferrer');await expect(page.locator('figcaption')).toHaveText('11人戦時の実際のマップ');
  expect(await page.locator('.developer-tools').getAttribute('open')).toBeNull();
  const accessible=await page.locator('body').evaluate(el=>(el as HTMLElement).innerText+' '+Array.from(el.querySelectorAll('[aria-label],[title],[alt]')).map(n=>[n.getAttribute('aria-label'),n.getAttribute('title'),n.getAttribute('alt')].join(' ')).join(' '));expect(accessible).not.toMatch(/army|\bSC\b/i);
  expect(accessible).not.toContain('京都市版 Diplomacy');await page.screenshot({path:`docs/screenshots/phase7b-brand/public-top-${width}.png`,fullPage:width===390});
 }
 await expect(page).toHaveTitle('京都ま市ー');
 for(const selector of ['meta[property="og:title"]','meta[name="twitter:title"]'])await expect(page.locator(selector)).toHaveAttribute('content','京都ま市ー');
 for(const selector of ['meta[name="description"]','meta[property="og:description"]','meta[name="twitter:description"]'])await expect(page.locator(selector)).toHaveAttribute('content',copy.replace('\n',''));
 await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content','https://kyoto-diplomacy-web.onrender.com/');
 await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content','https://kyoto-diplomacy-web.onrender.com/og/kyoto-diplomacy-og.png');
 // Fetch in Chromium so the test's public-host resolver also applies.
 const html=await page.evaluate(async()=>await(await fetch('/')).text());for(const tag of ['og:title','og:description','og:type','og:url','og:image','og:image:width','og:image:height','og:image:alt','twitter:card'])expect(html).toContain(`"${tag}"`);
 const statuses=await page.evaluate(async()=>await Promise.all(['/media/kyoto-board-hero.webp','/og/kyoto-diplomacy-og.png'].map(async path=>(await fetch(path)).status)));expect(statuses).toEqual([200,200]);
 const image=await page.evaluate(async()=>{const img=new Image();img.src='/og/kyoto-diplomacy-og.png';await img.decode();return[img.naturalWidth,img.naturalHeight];});expect(image).toEqual([1200,630]);
});
