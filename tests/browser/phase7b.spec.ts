import {test,expect,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {sampleConfig} from '../../packages/map-core/sample';
async function terminology(page:Page){const text=await page.locator('body').evaluate(el=>(el as HTMLElement).innerText+' '+Array.from(el.querySelectorAll('[aria-label],[title],[alt]')).map(n=>[n.getAttribute('aria-label'),n.getAttribute('title'),n.getAttribute('alt')].join(' ')).join(' '));expect(text).not.toMatch(/army|\bSC\b/i);}
test('標準既定・カスタム切替・失敗保持・標準復帰・3人uploadなし開始・陸軍/補給拠点の表示',async({browser})=>{
 test.setTimeout(90000);const contexts=await Promise.all([1,2,3].map(()=>browser.newContext())),pages=await Promise.all(contexts.map(c=>c.newPage())),host=pages[0];
 try{
  for(let i=0;i<3;i++){await pages[i].goto('/');await pages[i].getByRole('button',{name:'オンライン対戦',exact:true}).click();await expect(pages[i].getByText('サーバー接続中',{exact:true})).toBeVisible();await pages[i].getByLabel('オンラインニックネーム').fill(`標準参加者${i}`);await pages[i].getByLabel('オンライン希望区').selectOption(['26102','26104','26111'][i]);}
  await host.getByRole('button',{name:'ルームを作成',exact:true}).click();await expect(host.getByRole('button',{name:'標準シナリオ',exact:true})).toHaveAttribute('aria-pressed','true');await terminology(host);
  await host.getByLabel('カスタムJSONを読み込む').setInputFiles({name:'sample-custom.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(sampleConfig))});await expect(host.getByRole('heading',{name:'カスタムシナリオ',exact:true})).toBeVisible();await expect(host.getByRole('button',{name:'標準シナリオ',exact:true})).toHaveAttribute('aria-pressed','false');
  const before=await host.getByTestId('scenario-summary').innerText();await host.getByLabel('カスタムJSONを読み込む').setInputFiles({name:'broken.json',mimeType:'application/json',buffer:Buffer.from('{')});await expect(host.getByRole('alert')).toBeVisible();expect(await host.getByTestId('scenario-summary').innerText()).toBe(before);
  // A custom file sharing the standard file name remains custom: name is not identity.
  await host.getByLabel('カスタムJSONを読み込む').setInputFiles({name:'kyoto-standard.json',mimeType:'application/json',buffer:await readFile('data/default-scenarios/kyoto-standard.json')});await expect(host.getByRole('heading',{name:'カスタムシナリオ',exact:true})).toBeVisible();
  await host.getByRole('button',{name:'標準シナリオ',exact:true}).click();await expect(host.getByRole('button',{name:'標準シナリオ',exact:true})).toHaveAttribute('aria-pressed','true');await expect(host.getByRole('alert')).toHaveCount(0);
  const code=await host.getByTestId('room-code').innerText();for(const page of pages.slice(1)){await page.getByLabel('参加ルームコード').fill(code);await page.getByRole('button',{name:'ルームへ参加',exact:true}).click();await expect(page.getByLabel('シナリオ検証')).toContainText('標準シナリオを選択済み');}
  await host.getByRole('button',{name:'オンラインゲーム開始',exact:true}).click();for(const page of pages){await expect(page.getByTestId('online-phase')).toContainText('第1年');await terminology(page);}
  await host.locator('.unit-pin').first().click();await expect(host.locator('.command-dock')).toContainText('選択中の陸軍');await terminology(host);
  await host.getByRole('button',{name:'勝利条件',exact:true}).click();await terminology(host);await host.screenshot({path:'docs/screenshots/phase7b/standard-online.png'});
 }finally{await Promise.all(contexts.map(c=>c.close()));}
});
