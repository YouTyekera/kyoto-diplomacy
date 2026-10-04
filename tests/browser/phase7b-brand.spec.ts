import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import type {PublicRoomView} from '../../packages/shared/online';

test('11人の標準対局の盤面がトップの11勢力配置と一致する',async({browser})=>{
 test.setTimeout(120000);
 const contexts=await Promise.all(Array.from({length:11},()=>browser.newContext({viewport:{width:1920,height:1080}}))),pages=await Promise.all(contexts.map(c=>c.newPage())),host=pages[0];
 let room:PublicRoomView|undefined;
 host.on('websocket',socket=>socket.on('framereceived',frame=>{const packet=String(frame.payload);if(!packet.startsWith('42['))return;const [event,value]=JSON.parse(packet.slice(2));if(event==='publicState')room={...value,map:value.map??room?.map};}));
 try{
  for(let i=0;i<11;i++){
   const page=pages[i];await page.goto('/');await page.getByRole('button',{name:'オンライン対戦',exact:true}).click();await expect(page.getByText('サーバー接続中',{exact:true})).toBeVisible();await page.getByLabel('オンラインニックネーム').fill(`表示確認${i+1}`);await page.getByLabel('オンライン希望区').selectOption(`261${String(i+1).padStart(2,'0')}`);
   if(i===0)await page.getByRole('button',{name:'ルームを作成',exact:true}).click();else{await page.getByLabel('参加ルームコード').fill(await host.getByTestId('room-code').innerText());await page.getByRole('button',{name:'ルームへ参加',exact:true}).click();}
   await expect(page.getByLabel('シナリオ検証')).toContainText('標準シナリオを選択済み');
  }
  await expect.poll(()=>room?.players.length).toBe(11);await host.getByRole('button',{name:'オンラインゲーム開始',exact:true}).click();await expect(host.getByTestId('online-phase')).toContainText('第1年');
  await expect.poll(()=>room?.game?.board.units.length).toBe(59);expect(new Set(room!.game!.board.units.map(u=>u.ownerWardId)).size).toBe(11);
  const config=JSON.parse(await readFile('data/default-scenarios/kyoto-standard.json','utf8')) as {regions:Record<string,{startingUnit:{ownerWardId:string}|null}>};
  const expected=Object.entries(config.regions).filter(([,r])=>r.startingUnit).map(([id,r])=>`${id}:${r.startingUnit!.ownerWardId}`).sort();expect(room!.game!.board.units.map(u=>`${u.regionId}:${u.ownerWardId}`).sort()).toEqual(expected);
  await expect(host.locator('svg.map .unit-pin')).toHaveCount(59);await expect(host.locator('svg.map .supply-marker')).toHaveCount(72);await host.screenshot({path:'docs/screenshots/phase7b-brand/standard-11-players.png'});
  await host.getByRole('button',{name:'トップへ戻る',exact:true}).click();await expect(host.getByRole('heading',{name:'京都ま市ー',exact:true})).toBeVisible();await expect(host.locator('figcaption')).toHaveText('11人戦時の実際のマップ');await expect(host.getByRole('img')).toHaveAttribute('src',/media\/kyoto-board-hero.webp$/);
 }finally{await Promise.all(contexts.map(c=>c.close()));}
});
