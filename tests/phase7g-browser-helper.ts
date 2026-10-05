import {expect,type Browser,type Page} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {lobby} from './session-browser-helper';
import {startPlayback} from './playback-browser-helper';
import type {PublicRoomView,PrivatePlayerView} from '../packages/shared/online';
import type {GameOrder} from '../packages/shared/events';
export async function gameplayPresentation(browser:Browser,baseURL:string,folder:string){
  const setup=await lobby(browser,baseURL),{pages,contexts}=setup,host=pages[0];
  const views:{room?:PublicRoomView;self?:PrivatePlayerView}[]=pages.map(()=>({}));const errors:string[]=[];
  function state(page:Page,i:number){page.on('pageerror',e=>errors.push(e.message));page.on('websocket',socket=>socket.on('framereceived',f=>{const raw=String(f.payload);if(!raw.startsWith('42['))return;const [event,data]=JSON.parse(raw.slice(2));if(event==='publicState')views[i].room={...data,map:data.map??views[i].room?.map};if(event==='privateState')views[i].self=data;}));}
  try{
    await mkdir(folder,{recursive:true});pages.forEach(state);
    for(const [i,page]of pages.entries()){
      await page.exposeFunction('observeTurn',(event:string,data:PublicRoomView|PrivatePlayerView)=>{if(event==='publicState')views[i].room=data as PublicRoomView;if(event==='privateState')views[i].self=data as PrivatePlayerView;});
      await page.evaluate(()=>{for(const socket of window.recoveryTest.sockets)socket.addEventListener('message',event=>{const raw=String(event.data);if(raw.startsWith('42[')){const [name,value]=JSON.parse(raw.slice(2));void (window as unknown as {observeTurn:(event:string,data:unknown)=>Promise<void>}).observeTurn(name,value);}});});
    }
    await host.getByLabel('オンライン規定年数').fill('3');await host.getByRole('button',{name:'オンラインゲーム開始',exact:true}).click();
    for(const p of pages)await expect(p.getByTestId('online-phase')).toContainText('春');await expect.poll(()=>views.every(v=>!!v.self&&!!v.room&&v.self.phaseKey===v.room.game?.phaseKey)).toBe(true);
    const original=structuredClone(views[0].room!.game!.board),units=original.units,all=views.flatMap((v,i)=>Object.values(v.self!.legalOrders).flat().filter(o=>o.type==='move').map(o=>({i,order:o as Extract<GameOrder,{type:'move'}>})));
    const first=all.find(a=>all.some(b=>a.i!==b.i&&a.order.destination===b.order.destination)&&!units.some(u=>u.regionId===a.order.destination))!;
    expect(first).toBeTruthy();const second=all.find(b=>first.i!==b.i&&first.order.destination===b.order.destination)!;
    const affected=new Set([first.order.destination,units.find(u=>u.unitId===first.order.unitId)!.regionId,units.find(u=>u.unitId===second.order.unitId)!.regionId]);
    const peaceful=all.find(a=>a.order.unitId!==first.order.unitId&&a.order.unitId!==second.order.unitId&&!units.some(u=>u.regionId===a.order.destination)&&!affected.has(a.order.destination)&&!affected.has(units.find(u=>u.unitId===a.order.unitId)!.regionId))!;expect(peaceful).toBeTruthy();
    for(const {i,order}of [first,second,peaceful]){
      const page=pages[i],unit=units.find(u=>u.unitId===order.unitId)!;await page.locator(`[data-marker-region="${unit.regionId}"]`).press('Enter');await page.getByRole('button',{name:'移動',exact:true}).click();await page.locator(`[data-region-id="${order.destination}"]`).press('Enter');
    }
    for(const p of pages)await p.getByRole('button',{name:'命令書を確定',exact:true}).click();
    for(const p of pages){await expect(p.locator('.operation-reveal')).toHaveAttribute('data-presentation-stage','reveal');await expect(p.locator('.move-line')).toHaveCount(3);await expect(p.locator('.presentation-layer')).toHaveCount(0);await expect(p.getByRole('button',{name:'確定解除',exact:true})).toBeDisabled();}
    expect(views.every(v=>JSON.stringify(v.room!.game!.board)===JSON.stringify(original))).toBe(true);
    await expect(pages[1].getByText('ホストが裁定開始するのを待っています',{exact:true})).toBeVisible();await expect(pages[1].getByRole('button',{name:'▶ 裁定開始',exact:true})).toHaveCount(0);
    for(const size of [{width:1920,height:1080},{width:1280,height:720}]){await host.setViewportSize(size);await host.getByRole('button',{name:'全体に戻す',exact:true}).click();await host.screenshot({path:`${folder}/orders-revealed-${size.width}.png`});}
    await expect(host.locator('[data-geography-feature]')).toHaveCount(5);expect(await host.locator('[data-geography-layer]').evaluate(el=>el.compareDocumentPosition(document.querySelector('.playable-region')!)&Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy();
    await startPlayback(pages);await expect(host.locator('.operation-reveal')).toHaveAttribute('data-presentation-stage','stage-1');await host.screenshot({path:`${folder}/peaceful-stage-1280.png`});
    await expect(host.locator('.operation-reveal')).toHaveAttribute('data-presentation-stage','stage-2');await host.screenshot({path:`${folder}/conflict-stage-1280.png`});
    const resolved=structuredClone(views[0].room!.game!.playback!.snapshot!);
    await host.getByRole('button',{name:'演出をスキップ',exact:true}).click();for(const p of pages)await expect(p.getByTestId('online-phase')).toContainText('秋');
    expect(views.every(v=>JSON.stringify(v.room!.game!.board.units)===JSON.stringify(resolved.after))).toBe(true);
    expect(views[0].room!.game!.history![0].board.units).toEqual(resolved.after);
    await host.getByRole('button',{name:'イベント・結果',exact:true}).click();await host.getByRole('button',{name:'結果を閉じる',exact:true}).click();
    const own=views[0].room!.game!.board.units.find(u=>u.ownerWardId===views[0].self!.wardId)!;
    await host.evaluate(()=>{window.recoveryTest.orderDelayMs=2000;});
    await host.locator(`[data-marker-region="${own.regionId}"]`).press('Enter');await host.getByRole('button',{name:'待機',exact:true}).click();await expect(host.locator('.submission-bar')).toContainText('入力済み 1');expect(views[0].self!.orders).toEqual([]);
    const current=structuredClone(views[0].room!.game!.board),orders=[{type:'hold',unitId:own.unitId}],key=views[0].self!.phaseKey;
    await host.getByRole('button',{name:'← 前ターン',exact:true}).click();await expect(host.getByLabel('移動ターンの履歴')).toContainText('第1年 春・裁定後');await expect(host.getByRole('button',{name:'命令書を確定',exact:true})).toBeDisabled();
    expect(await host.locator('[data-ground-equipment]').count()).toBe(views[0].room!.game!.history![0].events.groundEquipment.length);
    expect(await host.getByTestId('current-events').locator('[data-event-type]').evaluateAll(elements=>elements.map(e=>e.getAttribute('data-event-type')))).toEqual(views[0].room!.game!.history![0].events.current.map(e=>e.type));await expect(host.getByTestId('previous-result-drawer')).toHaveCount(0);
    await host.locator(`[data-marker-region="${own.regionId}"]`).press('Enter');await host.locator(`[data-region-id="${own.regionId}"]`).dispatchEvent('contextmenu',{button:2});
    await host.getByLabel('このターンの命令を見る').check();await expect(host.locator('.move-line')).toHaveCount(3);
    await expect(host.locator('.submission-bar')).toContainText('入力済み 1');expect(views[0].self!.phaseKey).toBe(key);expect(views[0].room!.game!.board).toEqual(current);
    for(const size of [{width:1280,height:720},{width:1920,height:1080}]){await host.setViewportSize(size);await host.screenshot({path:`${folder}/history-${size.width}.png`});}
    await host.getByRole('button',{name:'現在に戻る',exact:true}).click();await expect(host.locator('.move-line')).toHaveCount(0);await expect(host.getByRole('button',{name:'命令書を確定',exact:true})).toBeEnabled();await expect.poll(()=>views[0].self!.orders).toEqual(orders);
    await expect(host.getByTestId('previous-result-drawer')).toHaveCount(0);
    await host.reload();await expect(host.getByTestId('online-phase')).toContainText('秋');await expect(host.getByRole('button',{name:'← 前ターン',exact:true})).toBeEnabled();await host.getByRole('button',{name:'← 前ターン',exact:true}).click();await expect(host.getByLabel('移動ターンの履歴')).toContainText('第1年 春・裁定後');await host.getByRole('button',{name:'→ 次ターン',exact:true}).click();await expect(host.locator('.turn-history')).toHaveAttribute('data-history-id','current');
    expect(views[0].self!.orders).toEqual(orders);
    for(const p of pages)await p.getByRole('button',{name:'命令書を確定',exact:true}).click();await startPlayback(pages);await host.getByRole('button',{name:'演出をスキップ',exact:true}).click();await expect.poll(()=>views[0].room!.game!.history?.length).toBe(2);
    await host.getByRole('button',{name:'← 前ターン',exact:true}).click();await expect(host.getByLabel('移動ターンの履歴')).toContainText('第1年 秋・裁定後');await host.getByRole('button',{name:'← 前ターン',exact:true}).click();await expect(host.getByLabel('移動ターンの履歴')).toContainText('第1年 春・裁定後');await host.getByRole('button',{name:'→ 次ターン',exact:true}).click();await expect(host.getByLabel('移動ターンの履歴')).toContainText('第1年 秋・裁定後');await host.getByRole('button',{name:'現在に戻る',exact:true}).click();
    expect(errors).toEqual([]);
    await writeFile(`${folder}/proof.json`,JSON.stringify({allCommandsRevealedTogether:true,boardUnchangedUntilStart:true,peacefulThenConflict:true,skipMatchesServer:true,historyReadOnly:true,draftPreserved:true,reloadRestoresHistory:true,geographyBehindRegions:true},null,2)+'\n');
  }finally{await Promise.all(contexts.map(c=>c.close()));}
}
