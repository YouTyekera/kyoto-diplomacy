import {it,expect,vi} from 'vitest';
import {io} from 'socket.io-client';
import {serverConfig,permittedOrigin} from './config';
import {createOnlineServer} from './server';
import {RoomManager} from '../../packages/online-core/room-manager';
import {sampleDataset,sampleConfig} from '../../packages/map-core/sample';
const origin='https://kyoto-web.example';
it('PORT/0.0.0.0・productionの必須HTTPS originとdevelopmentだけのLAN許可',()=>{
 expect(serverConfig({NODE_ENV:'production',PORT:'10000',FRONTEND_ORIGIN:origin,ONLINE_HOST:'127.0.0.1'})).toEqual({production:true,port:10000,host:'0.0.0.0',frontendOrigin:origin});
 for(const value of [undefined,'*','http://kyoto-web.example','https://localhost','https://user:secret@kyoto-web.example','https://kyoto-web.example/path'])expect(()=>serverConfig({NODE_ENV:'production',PORT:'10000',FRONTEND_ORIGIN:value})).toThrow();
 for(const port of [undefined,'0','65536','abc','1.5'])expect(()=>serverConfig({NODE_ENV:'production',PORT:port,FRONTEND_ORIGIN:origin})).toThrow();
 expect(permittedOrigin('http://localhost:5173',{production:false})).toBe(true);expect(permittedOrigin('http://192.168.1.5:5173',{production:false})).toBe(true);expect(permittedOrigin('https://other.example',{production:false})).toBe(false);
 expect(permittedOrigin('http://localhost:5173',{production:true,frontendOrigin:origin})).toBe(false);
});
it('health/CORS・pollingとWebSocketのorigin拒否・debug非公開・秘密非出力・終了',async()=>{
 const server=createOnlineServer(new RoomManager({sample:sampleDataset,'kyoto-kml':sampleDataset}),{production:true,frontendOrigin:origin});
 await new Promise<void>(resolve=>server.http.listen(0,'127.0.0.1',resolve));
 const address=server.http.address();if(!address||typeof address==='string')throw Error('address');const url=`http://127.0.0.1:${address.port}`;
 const clients:ReturnType<typeof io>[]=[];const log=vi.spyOn(console,'info').mockImplementation(()=>{});
 try{
  expect(await (await fetch(url+'/health')).json()).toEqual({ok:true});
  const healthy=await fetch(url+'/health',{headers:{Origin:origin}});expect(healthy.status).toBe(200);expect(healthy.headers.get('access-control-allow-origin')).toBe(origin);expect(healthy.headers.get('vary')).toBe('Origin');
  expect((await fetch(url+'/health',{headers:{Origin:origin+'.evil'}})).status).toBe(403);
  expect((await fetch(url+'/health',{method:'OPTIONS',headers:{Origin:origin}})).status).toBe(204);
  expect((await fetch(url+'/__debug')).status).toBe(404);expect((await fetch(url+'/__rooms')).status).toBe(404);
  expect((await fetch(url+'/socket.io/?EIO=4&transport=polling',{headers:{Origin:origin+'.evil'}})).status).toBe(403);
  for(const bad of [undefined,'http://localhost:5173',origin+'.evil']){
   const client=io(url,{transports:['websocket'],autoConnect:false,reconnection:false,extraHeaders:bad?{Origin:bad}:{}});clients.push(client);
   await new Promise<void>((resolve,reject)=>{client.once('connect_error',()=>resolve());client.once('connect',()=>reject(Error('Bad origin accepted')));client.connect();});expect(client.connected).toBe(false);
  }
  const good=io(url,{transports:['websocket'],autoConnect:false,reconnection:false,extraHeaders:{Origin:origin}});clients.push(good);
  await new Promise<void>(resolve=>{good.once('connect',resolve);good.connect();});
  const result=await good.timeout(3000).emitWithAck('request',{action:'create',nickname:'公開テスト',preferredWardId:null,datasetKind:'sample',config:sampleConfig});expect(result.ok).toBe(true);
  const token=result.credentials.reconnectToken;
  await good.timeout(3000).emitWithAck('request',{action:'scenario',json:'broken '+token,fileName:'invalid.json'});
  expect(JSON.stringify(log.mock.calls)).not.toContain(token);
  const disconnected=new Promise<void>(resolve=>good.once('disconnect',()=>resolve()));const first=server.close();expect(server.close()).toBe(first);await first;await disconnected;expect(server.http.listening).toBe(false);
 }finally{log.mockRestore();clients.forEach(c=>c.disconnect());await server.close();}
},15000);
