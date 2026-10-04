import { test,expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { configSchema } from '../../packages/shared/model';
import { matchLogSchema } from '../../packages/shared/match';

test('3画面でHostシナリオ読込・Preflight・共通Game Over・秘密情報なしログdownload',async({browser})=>{
  test.setTimeout(120000);
  const config=configSchema.parse(JSON.parse(await readFile('tests/fixtures/phase4b-kyoto-map-config.json','utf8')));
  // A small, explicit end-rule fixture: all active candidate regions for the three preferred wards are SC.
  // No product scenario or initial Kyoto configuration is changed.
  for(const [id,s] of Object.entries(config.regions))if(['26101','26102','26103'].some(w=>id.startsWith(`kyoto-${w}-`))&&!s.isSupplyCenter)s.enabled=false;
  const contexts=await Promise.all([browser.newContext(),browser.newContext(),browser.newContext()]),pages=await Promise.all(contexts.map(c=>c.newPage()));
  const errors:string[]=[];for(const page of pages)page.on('pageerror',e=>errors.push(e.message));
  try {
    for(let i=0;i<3;i++){await pages[i].goto('/?tool=editor');await pages[i].getByRole('button',{name:'オンライン対戦',exact:true}).click();await pages[i].getByLabel('オンラインニックネーム').fill(`Playtest${i}`);await pages[i].getByLabel('オンライン希望区').selectOption(['26101','26102','26103'][i]);await expect(pages[i].getByText('サーバー接続中',{exact:true})).toBeVisible();}
    await pages[0].getByRole('button',{name:'ルームを作成',exact:true}).click();const code=await pages[0].getByTestId('room-code').innerText();
    await expect(pages[0].getByLabel('シナリオ検証')).toContainText('保存JSON未読込');await expect(pages[0].getByRole('button',{name:'オンラインゲーム開始',exact:true})).toBeDisabled();
    await pages[0].getByLabel('カスタムJSONを読み込む').setInputFiles({name:'broken.json',mimeType:'application/json',buffer:Buffer.from('{')});await expect(pages[0].getByRole('alert')).toBeVisible();
    await pages[0].getByLabel('カスタムJSONを読み込む').setInputFiles({name:'phase4b-test-only.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(config))});await expect(pages[0].getByLabel('シナリオ検証')).toContainText('カスタムJSON読込済み');await expect(pages[0].getByRole('alert')).toHaveCount(0);
    for(let i=1;i<3;i++){await pages[i].getByLabel('参加ルームコード').fill(code);await pages[i].getByRole('button',{name:'ルームへ参加',exact:true}).click();await expect(pages[i].getByTestId('room-code')).toHaveText(code);await expect(pages[i].getByLabel('カスタムJSONを読み込む')).toHaveCount(0);}
    await expect(pages[0].getByLabel('シナリオ検証')).toContainText('Error 0');await expect(pages[0].getByLabel('オンライン規定年数')).toHaveValue('5');await expect(pages[0].getByRole('button',{name:'オンラインゲーム開始',exact:true})).toBeEnabled();
    await pages[0].getByRole('button',{name:'オンラインゲーム開始',exact:true}).click();for(const page of pages){await expect(page.getByTestId('online-phase')).toHaveText('第1年 · 春 · 移動命令');await expect(page.getByText('規定年数: 5年',{exact:true})).toBeVisible();await expect(page.getByLabel('カスタムJSONを読み込む')).toHaveCount(0);}
    for(let season=0;season<2;season++)for(const page of pages)await page.getByRole('button',{name:'命令書を確定',exact:true}).click();
    for(const page of pages){await expect(page.getByRole('heading',{name:'共同勝利',exact:true})).toBeVisible();await expect(page.getByLabel('ゲーム終了結果')).toContainText('脱落発生により終了');await expect(page.getByLabel('ゲーム終了結果')).toContainText('同率勝者');await expect(page.getByRole('button',{name:'命令書を確定',exact:true})).toHaveCount(0);}
    const standings=await pages[0].getByRole('table',{name:'最終順位'}).innerText();for(const page of pages.slice(1))expect(await page.getByRole('table',{name:'最終順位'}).innerText()).toBe(standings);
    const downloadPromise=pages[0].waitForEvent('download');await pages[0].getByRole('button',{name:'試遊ログをダウンロード',exact:true}).click();const download=await downloadPromise;expect(download.suggestedFilename()).toBe('match-log.json');await download.saveAs('test-results/phase4b-match-log.json');
    const json=await readFile('test-results/phase4b-match-log.json','utf8'),log=matchLogSchema.parse(JSON.parse(json));expect(log.finalResult?.reason).toBe('elimination-final-year');expect(log.victorySettings.maxYears).toBe(5);expect(log.timeline.filter(r=>r.type==='adjudication')).toHaveLength(2);expect(log.finalResult?.standings.map(r=>r.rank)).toEqual([1,1,1]);
    for(const page of pages){const token=await page.evaluate(()=>{const saved=sessionStorage.getItem('kyoto-online-session-v1');return saved?JSON.parse(saved).reconnectToken:'';});if(token)expect(json).not.toContain(token);}for(const word of ['reconnectToken','socketId','reservations','draft'])expect(json).not.toContain(word);
    await pages[1].reload();await expect(pages[1].getByRole('heading',{name:'共同勝利',exact:true})).toBeVisible();expect(await pages[1].getByRole('table',{name:'最終順位'}).innerText()).toBe(standings);
    await pages[0].screenshot({path:'test-results/phase4b-game-over.png',fullPage:true});expect(errors).toEqual([]);
  } finally {await Promise.all(contexts.map(c=>c.close()));}
});
