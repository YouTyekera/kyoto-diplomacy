import {it,expect,vi} from 'vitest';
import {io} from 'socket.io-client';
import {createOnlineServer} from './server';
import {RoomManager} from '../../packages/online-core/room-manager';
import {sampleDataset,sampleConfig} from '../../packages/map-core/sample';
import {completeSyntheticScenario} from '../../tests/scenario-fixture';
const origin='https://identity.example';
async function fixture(){const f=completeSyntheticScenario(sampleDataset,sampleConfig),manager=new RoomManager({sample:f.dataset,'kyoto-kml':f.dataset}),server=createOnlineServer(manager,{production:true,frontendOrigin:origin});await new Promise<void>(resolve=>server.http.listen(0,'127.0.0.1',resolve));const address=server.http.address();if(!address||typeof address==='string')throw Error('address');const clients:ReturnType<typeof io>[]=[];
 const connect=async()=>{const client=io(`http://127.0.0.1:${address.port}`,{transports:['websocket'],autoConnect:false,reconnection:false,extraHeaders:{Origin:origin}});clients.push(client);await new Promise<void>(resolve=>{client.once('connect',resolve);client.connect();});const frames:string[]=[];client.io.engine.on('packet',packet=>{if(packet.type==='message'&&typeof packet.data==='string'){if(packet.data.startsWith('3'))frames.push('ack');else if(packet.data.startsWith('2["publicState",'))frames.push('public');else if(packet.data.startsWith('2["privateState",'))frames.push('private');}});return{client,frames};};
 return{...f,manager,server,connect,close:async()=>{clients.forEach(c=>c.disconnect());await server.close();}};
}
it('productionでcreate/join/reconnectのack packetが公開/本人snapshotより先',async()=>{
 const f=await fixture(),log=vi.spyOn(console,'info').mockImplementation(()=>{});
 try{const host=await f.connect(),created=await host.client.timeout(2000).emitWithAck('request',{action:'create',nickname:'H',preferredWardId:null,datasetKind:'sample',config:f.config});expect(created.ok).toBe(true);await vi.waitFor(()=>expect(host.frames).toContain('private'));expect(host.frames.slice(0,3)).toEqual(['ack','public','private']);
  const guest=await f.connect(),joined=await guest.client.timeout(2000).emitWithAck('request',{action:'join',nickname:'G',preferredWardId:null,roomCode:created.credentials.roomCode});expect(joined.ok).toBe(true);await vi.waitFor(()=>expect(guest.frames).toContain('private'));expect(guest.frames.slice(0,3)).toEqual(['ack','public','private']);guest.client.disconnect();
  const returned=await f.connect(),restored=await returned.client.timeout(2000).emitWithAck('request',{action:'reconnect',...joined.credentials});expect(restored.ok).toBe(true);await vi.waitFor(()=>expect(returned.frames).toContain('private'));expect(returned.frames.slice(0,3)).toEqual(['ack','public','private']);expect(f.manager.rooms.get(created.credentials.roomCode)!.players.size).toBe(2);
 }finally{await f.close();log.mockRestore();}
},10000);
it('ack後のpublish例外を秘密なしで診断し、二重ackせず、同じidentityで再試行できる',async()=>{
 const f=await fixture(),error=vi.spyOn(console,'error').mockImplementation(()=>{}),info=vi.spyOn(console,'info').mockImplementation(()=>{});
 const failure=vi.spyOn(f.manager,'preflight').mockImplementationOnce(()=>{const room=[...f.manager.rooms.values()][0],token=[...room.players.values()][0].reconnectToken;throw Error(`unexpected payload ${token}`);});
 try{const host=await f.connect(),result=await host.client.timeout(2000).emitWithAck('request',{action:'create',nickname:'H',preferredWardId:null,datasetKind:'sample',config:f.config});expect(result.ok).toBe(true);expect(result.credentials).toBeTruthy();await vi.waitFor(()=>expect(error).toHaveBeenCalled());expect(error.mock.calls[0][0]).toBe('[server-error] publish failed');expect(JSON.stringify(error.mock.calls)).not.toContain(result.credentials.reconnectToken);expect(JSON.stringify(info.mock.calls)).not.toContain(result.credentials.reconnectToken);expect(host.frames).toEqual(['ack']);
  expect((await host.client.timeout(2000).emitWithAck('request',{action:'reconnect',...result.credentials})).ok).toBe(true);await vi.waitFor(()=>expect(host.frames).toContain('private'));expect(f.manager.rooms.get(result.credentials.roomCode)!.players.size).toBe(1);expect(host.frames.filter(v=>v==='ack')).toHaveLength(2);
 }finally{failure.mockRestore();await f.close();error.mockRestore();info.mockRestore();}
},10000);
