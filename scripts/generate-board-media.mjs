// Capture the actual MapCanvas with the user-approved scenario. No external art.
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
process.env.PLAYWRIGHT_BROWSERS_PATH??=resolve('.playwright-browsers');
const {chromium}=await import('@playwright/test');
const url=process.argv[2]??'http://127.0.0.1:5190';
const ogOnly=process.argv.includes('--og-only');
const browser=await chromium.launch(),page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
try{
 let png,armies,centers;
 if(!ogOnly){
 await page.goto(url);await page.getByRole('button',{name:'地図エディタ',exact:true}).click();
 await page.getByLabel('設定JSONを読込',{exact:true}).setInputFiles(resolve('data/default-scenarios/kyoto-standard.json'));
 await page.getByRole('button',{name:'ゲームプレビュー',exact:true}).click();
 await page.getByRole('button',{name:'マップ設定からPreviewを再生成',exact:true}).click();
 await page.getByRole('button',{name:'トップへ戻る',exact:true}).click();await page.getByRole('button',{name:'ローカルで試す',exact:true}).click();
 await page.locator('.player-map .unit-pin').first().waitFor();
 await page.addStyleTag({content:'.local-trial .map {width:1600px!important;height:900px!important;min-height:900px!important;flex:none!important} .map-tooltip {display:none!important}'});
 await page.getByRole('button',{name:'全体に戻す',exact:true}).click();await page.mouse.move(0,0);
 await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(400);
 armies=await page.locator('.player-map .unit-pin').count();centers=await page.locator('.player-map .supply-marker').count();
 if(armies!==59||centers!==72)throw Error(`Unexpected scenario markers: ${armies}/${centers}`);
 await mkdir('docs/screenshots/phase7b',{recursive:true});await mkdir('apps/web/public/media',{recursive:true});await mkdir('apps/web/public/og',{recursive:true});
 png=await page.locator('svg.map').screenshot({path:'docs/screenshots/phase7b/board-source.png'});
 }else{png=await readFile('docs/screenshots/phase7b/board-source.png');}
 const assets=await page.evaluate(async raw=>{
  const img=new Image();img.src=`data:image/png;base64,${raw}`;await img.decode();
  const hero=document.createElement('canvas');hero.width=1600;hero.height=900;hero.getContext('2d').drawImage(img,0,0,1600,900);
  const og=document.createElement('canvas');og.width=1200;og.height=630;const ctx=og.getContext('2d');ctx.drawImage(img,0,0,1600,900,0,-22.5,1200,675);
  ctx.fillStyle='rgba(244,241,224,.94)';ctx.fillRect(0,0,1200,86);ctx.fillStyle='#213b34';ctx.font='bold 38px "Yu Gothic UI", "Meiryo", sans-serif';ctx.fillText('京都ま市ー',36,57);
  return {hero:hero.toDataURL('image/webp',.9).split(',')[1],og:og.toDataURL('image/png').split(',')[1]};
 },png.toString('base64'));
 if(!ogOnly)await writeFile('apps/web/public/media/kyoto-board-hero.webp',Buffer.from(assets.hero,'base64'));
 await writeFile('apps/web/public/og/kyoto-diplomacy-og.png',Buffer.from(assets.og,'base64'));
 if(!ogOnly){
 const hash=createHash('sha256').update(await readFile('data/default-scenarios/kyoto-standard.json')).digest('hex');
 await writeFile('docs/screenshots/phase7b/media-proof.json',JSON.stringify({scenario:'data/default-scenarios/kyoto-standard.json',sha256:hash,state:'Game Previewを標準設定から再生成し、ローカル試遊の開始前盤面を作戦表示。11勢力の表示確認状態。',armies,centers,hero:{width:1600,height:900},og:{width:1200,height:630}},null,2));
 console.log(`Generated real MapCanvas hero 1600x900 and OGP 1200x630; ${armies} armies / ${centers} supply centers.`);
 }else console.log('Regenerated branded OGP 1200x630 from the existing real MapCanvas capture; hero unchanged.');
}finally{await browser.close();}
