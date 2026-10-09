import {expect,it,vi} from 'vitest';
import {io, type Socket} from 'socket.io-client';
import {createOnlineServer} from './server';
import {RoomManager} from '../../packages/online-core/room-manager';
import {sampleConfig,sampleDataset} from '../../packages/map-core/sample';
import type {ClientToServerEvents,ServerToClientEvents} from '../../packages/shared/online';

it('join/disconnectと別タブ乗っ取りが秘密情報なしで診断できる',async()=>{
  const logs:string[]=[],info=vi.spyOn(console,'info').mockImplementation((...args)=>logs.push(args.map(String).join(' ')));
  const manager=new RoomManager({sample:sampleDataset,'kyoto-kml':sampleDataset});
  const server=createOnlineServer(manager);
  const clients:Socket<ServerToClientEvents,ClientToServerEvents>[]=[];
  try {
    await new Promise<void>(resolve=>server.http.listen(0,'127.0.0.1',resolve));
    const address=server.http.address();
    if(!address||typeof address==='string')throw Error('missing address');
    const endpoint=`http://127.0.0.1:${address.port}`;
    expect(await (await fetch(endpoint+'/health')).json()).toMatchObject({ok:true});
    async function connect(){
      const client:Socket<ServerToClientEvents,ClientToServerEvents>=io(endpoint,{transports:['websocket'],autoConnect:false,reconnection:false});
      clients.push(client);
      await new Promise<void>(resolve=>{client.once('connect',resolve);client.connect();});
      return client;
    }
    const first=await connect();
    const created=await first.timeout(5000).emitWithAck('request',{action:'create',nickname:'host',preferredWardId:null,datasetKind:'sample',config:sampleConfig});
    expect(created.ok).toBe(true);
    if(!created.ok)throw Error(created.errors.join(','));
    const second=await connect();
    const ended=new Promise<string>(resolve=>first.once('sessionEnded',event=>resolve(event.reason)));
    expect((await second.timeout(5000).emitWithAck('request',{action:'reconnect',...created.credentials!})).ok).toBe(true);
    expect(await ended).toBe('replaced');
    first.disconnect();
    second.disconnect();
    await vi.waitFor(()=>expect(logs.some(line=>line.startsWith('[online-transport]'))).toBe(true));
    expect(logs.filter(line=>line.startsWith('[online-entry]'))).toHaveLength(2);
    expect(logs.some(line=>line.startsWith('[online-session-ended]'))).toBe(true);
    expect(logs.join('\n')).not.toContain(created.credentials!.reconnectToken);
  }finally{
    clients.forEach(client=>client.disconnect());
    await server.close();
    info.mockRestore();
  }
},15000);
