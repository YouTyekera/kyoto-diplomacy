import {expect,type Page,type Browser} from '@playwright/test';
import type {PublicRoomView,OnlineRequest} from '../packages/shared/online';
export interface RecoveryControl {holdReconnect:boolean;holdPrivate:boolean;holdAcks:boolean;failReconnect:boolean;held:{socket?:WebSocket;data:string}[];privateFrames:{socket?:WebSocket;data:string}[];ackFrames:{socket?:WebSocket;data:string}[];sockets:WebSocket[];upgraded?:WebSocket;acknowledgements:number;sent:string[];
 orderDelayMs?:number;rejectNextOrder?:boolean;orderRequests?:Extract<OnlineRequest,{action:'orders'}>[]}
declare global {interface Window {recoveryTest:RecoveryControl}}
/** Only browser test transport instrumentation. The application has no debug endpoint. */
export async function instrument(page:Page){await page.addInitScript(()=>{
 const Native=window.WebSocket,control:RecoveryControl={holdReconnect:false,holdPrivate:false,holdAcks:false,failReconnect:false,held:[],privateFrames:[],ackFrames:[],sockets:[],acknowledgements:0,sent:[]};window.recoveryTest=control;
 window.WebSocket=class extends Native{
  constructor(url:string|URL,protocols?:string|string[]){super(url,protocols);if(String(url).includes('/socket.io/'))control.sockets.push(this);this.addEventListener('message',event=>{
   if(typeof event.data==='string'&&event.data.startsWith('43')){control.acknowledgements++;if(control.holdAcks){event.stopImmediatePropagation();control.ackFrames.push({socket:this,data:event.data});}}
   if(control.holdPrivate&&typeof event.data==='string'&&event.data.startsWith('42["privateState",')){event.stopImmediatePropagation();control.privateFrames.push({socket:this,data:event.data});}
  });}
  send(data:string|ArrayBufferLike|Blob|ArrayBufferView){
   if(data==='5')control.upgraded=this;
   if(typeof data==='string'&&data.startsWith('42')){
    const index=data.indexOf('[');if(index>=0){const [event,request]=JSON.parse(data.slice(index));if(event==='request'){
     control.sent.push(request.action);
     if(request.action==='orders'){
      (control.orderRequests??=[]).push(structuredClone(request));
      if(control.rejectNextOrder){control.rejectNextOrder=false;request.phaseKey='deliberately-stale-test-phase';data=data.slice(0,index)+JSON.stringify([event,request]);}
      if(control.orderDelayMs){const packet=data;setTimeout(()=>super.send(packet),control.orderDelayMs);return;}
     }
     if(request.action==='reconnect'){
      if(control.holdReconnect){control.held.push({socket:this,data});return;}
      if(control.failReconnect){request.reconnectToken='0'.repeat(64);data=data.slice(0,index)+JSON.stringify([event,request]);}
     }
    }}
   }
   super.send(data);
  }
 };
});
 // Socket.IO reconnect starts with HTTP polling before upgrading to WebSocket.
 await page.route('**/socket.io/**',async route=>{
  const request=route.request(),body=request.postData();
  if(request.method()==='POST'&&body?.startsWith('42')){
   const index=body.indexOf('['),[event,input]=JSON.parse(body.slice(index));
   if(event==='request'){
    await page.evaluate(action=>window.recoveryTest.sent.push(action),input.action);
    if(input.action==='reconnect'){
     if(await page.evaluate(()=>window.recoveryTest.holdReconnect)){
      await page.evaluate(data=>window.recoveryTest.held.push({data}),body);
      // Drain polling with an Engine.IO noop so other messages could be sent;
      // only the authentication request is held, not the whole transport.
      await route.continue({postData:'6',headers:{...request.headers(),'content-length':'1'}});return;
     }
     if(await page.evaluate(()=>window.recoveryTest.failReconnect)){input.reconnectToken='0'.repeat(64);await route.continue({postData:body.slice(0,index)+JSON.stringify([event,input])});return;}
    }
   }
   await route.continue();return;
  }
  if(request.method()==='GET'){
   // APIRequestContext does not inherit Chromium's test-domain resolver rules.
   const response=await route.fetch({url:request.url().replace('https://kyoto-server.test:5444/','https://127.0.0.1:5444/')}),body=await response.text();
   const packets=body.split('\x1e'),kept:string[]=[];
   for(const packet of packets){if(packet.startsWith('43')){await page.evaluate(()=>window.recoveryTest.acknowledgements++);if(await page.evaluate(()=>window.recoveryTest.holdAcks)){await page.evaluate(data=>window.recoveryTest.ackFrames.push({data}),packet);continue;}}if(packet.startsWith('42["privateState",')&&await page.evaluate(()=>window.recoveryTest.holdPrivate))await page.evaluate(data=>window.recoveryTest.privateFrames.push({data}),packet);else kept.push(packet);}
   await route.fulfill({response,body:kept.join('\x1e')||'6'});return;
  }
  await route.continue();
 });
}
export async function lobby(browser:Browser,baseURL:string){
 const contexts=await Promise.all([0,1,2].map(()=>browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1280,height:720}}))),pages=await Promise.all(contexts.map(c=>c.newPage()));
 const state:{room?:PublicRoomView}={};pages[0].on('websocket',socket=>socket.on('framereceived',f=>{const p=String(f.payload);if(p.startsWith('42["publicState",')){const [,value]=JSON.parse(p.slice(2));state.room={...value,map:value.map??state.room?.map};}}));
 try{
  for(const page of pages)await instrument(page);
  for(let i=0;i<3;i++){
   const page=pages[i];await page.goto(baseURL);await page.getByRole('button',{name:'オンライン対戦',exact:true}).click();await page.getByLabel('オンラインニックネーム').fill(`接続確認${i}`);await expect(page.getByText('サーバー接続中',{exact:true})).toBeVisible();
   if(i===0)await page.getByRole('button',{name:'ルームを作成',exact:true}).click();else{await page.getByLabel('参加ルームコード').fill(await pages[0].getByTestId('room-code').innerText());await page.getByRole('button',{name:'ルームへ参加',exact:true}).click();}
   await expect(page.getByLabel('シナリオ検証')).toBeVisible();
  }
  await expect(pages[0].getByRole('button',{name:'オンラインゲーム開始',exact:true})).toBeEnabled();
  return{contexts,pages,state};
 }catch(error){await Promise.all(contexts.map(c=>c.close()));throw error;}
}
export async function locked(page:Page){
 await expect(page.locator('[data-room-session="restoring"]')).toBeVisible();
 for(const name of ['オンラインゲーム開始','標準シナリオ','開始前に退出']){const button=page.getByRole('button',{name,exact:true});if(await button.count())await expect(button).toBeDisabled();}
 for(const name of ['カスタムJSONを読み込む','オンライン規定年数','ロビー希望区']){const input=page.getByLabel(name,{exact:true});if(await input.count())await expect(input).toBeDisabled();}
}
export async function breakTransport(page:Page,holdPrivate=false){
 await page.evaluate(hold=>{const c=window.recoveryTest;c.holdReconnect=true;c.holdPrivate=hold;c.acknowledgements=0;for(const socket of c.sockets)if(socket.readyState===WebSocket.OPEN)socket.close();},holdPrivate);
 await expect.poll(()=>page.evaluate(()=>window.recoveryTest.held.length)).toBeGreaterThan(0);
 await locked(page);await expect(page.locator('[data-connection-state]')).toHaveAttribute('data-connection-state','restoring');
}
export async function resume(page:Page){await expect.poll(()=>page.evaluate(()=>window.recoveryTest.upgraded?.readyState)).toBe(1);await page.evaluate(()=>{const c=window.recoveryTest;c.holdReconnect=false;for(const packet of c.held.splice(0))(packet.socket??c.upgraded!).send(packet.data);});}
export async function hostRecovery(browser:Browser,baseURL:string,folder:string){
 const {contexts,pages,state}=await lobby(browser,baseURL),host=pages[0],hostId=state.room!.hostId;
 try{
  await breakTransport(host,true);await expect(pages[1].getByText('ホストの再接続を待っています…',{exact:true})).toBeVisible();expect(state.room!.hostId).toBe(hostId);
  await host.screenshot({path:`${folder}/host-restoring.png`,fullPage:true});await resume(host);
  await expect.poll(()=>host.evaluate(()=>window.recoveryTest.acknowledgements)).toBeGreaterThan(0);
  await expect.poll(()=>host.evaluate(()=>window.recoveryTest.privateFrames.length)).toBeGreaterThan(0);
  // Server authentication + ack already arrived; the saved private state has not.
  await locked(host);await expect(host.locator('[data-connection-state]')).toHaveAttribute('data-connection-state','restoring');
  await expect.poll(()=>host.evaluate(()=>window.recoveryTest.upgraded?.readyState)).toBe(1);
  await host.evaluate(()=>{const c=window.recoveryTest;c.holdPrivate=false;for(const frame of c.privateFrames.splice(0))(frame.socket??c.upgraded!).dispatchEvent(new MessageEvent('message',{data:frame.data}));});
  await expect(host.getByRole('button',{name:'オンラインゲーム開始',exact:true})).toBeEnabled();expect(state.room!.hostId).toBe(hostId);
  await host.getByRole('button',{name:'オンラインゲーム開始',exact:true}).click();for(const page of pages){await expect(page.getByTestId('online-phase')).toContainText('第1年');await expect(page.getByRole('alert')).toHaveCount(0);expect(await page.locator('body').innerText()).not.toContain('先にルームへ参加してください');}
  await host.screenshot({path:`${folder}/host-restored-start.png`});
 }finally{await Promise.all(contexts.map(c=>c.close()));}
}
