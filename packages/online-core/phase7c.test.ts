import {afterEach,expect,it,vi} from 'vitest';
import {RoomManager,hostReconnectGraceMs,type SessionDiagnostic} from './room-manager';
import {sampleConfig,sampleDataset} from '../map-core/sample';
import {completeSyntheticScenario} from '../../tests/scenario-fixture';
import type {Credentials} from '../shared/online';
function setup(count=3){
 const {dataset,config}=completeSyntheticScenario(sampleDataset,sampleConfig),manager=new RoomManager({sample:dataset,'kyoto-kml':dataset}),credentials:Credentials[]=[],events:SessionDiagnostic[]=[];
 manager.onSessionEvent(e=>events.push(e));
 for(let i=0;i<count;i++){const r=manager.request(`s${i}`,i===0?{action:'create',nickname:'host',preferredWardId:null,datasetKind:'sample',config}:{action:'join',nickname:`guest${i}`,preferredWardId:null,roomCode:credentials[0].roomCode});expect(r.ok).toBe(true);if(!r.ok)throw Error('fixture');credentials.push(r.credentials!);}
 return{manager,room:manager.rooms.get(credentials[0].roomCode)!,credentials,events};
}
afterEach(()=>vi.useRealTimers());
it('開始直前のHost瞬断→15秒以内復帰→権限維持→3人で開始',()=>{
 vi.useFakeTimers();const {manager,room,credentials,events}=setup(),host=room.hostId;
 try{manager.disconnect('s0');expect(room.hostId).toBe(host);expect(manager.startErrors(room)).toContain('全参加者の接続を待っています');
 vi.advanceTimersByTime(14999);expect(manager.request('new-host',{action:'reconnect',...credentials[0]}).ok).toBe(true);expect(room.hostId).toBe(host);expect(manager.startErrors(room)).toEqual([]);
 vi.advanceTimersByTime(30000);expect(room.hostId).toBe(host);expect(manager.request('new-host',{action:'start',yearLimit:null}).ok).toBe(true);expect(room.game?.activePlayerCount).toBe(3);expect(events.map(e=>e.event)).toContain('host-grace-cancel');expect(events.some(e=>e.event==='host-transferred')).toBe(false);
 }finally{manager.dispose();}
});
it('guest瞬断中は開始不可、復帰後に開始できる',()=>{
 const {manager,room,credentials}=setup();try{manager.disconnect('s1');expect(manager.request('s0',{action:'start',yearLimit:null}).ok).toBe(false);expect(manager.request('new-guest',{action:'reconnect',...credentials[1]}).ok).toBe(true);expect(manager.request('s0',{action:'start',yearLimit:null}).ok).toBe(true);expect(room.game).not.toBeNull();}finally{manager.dispose();}
});
it('Host猶予を過ぎると接続中playerへ移譲し、切断者がいる限り開始条件を維持',()=>{
 vi.useFakeTimers();const {manager,room,credentials,events}=setup(),host=room.hostId;
 try{manager.disconnect('s0');vi.advanceTimersByTime(hostReconnectGraceMs-1);expect(room.hostId).toBe(host);vi.advanceTimersByTime(1);expect(room.hostId).not.toBe(host);const next=room.players.get(room.hostId)!;expect(next.socketId).toBeTruthy();expect(manager.request(next.socketId!,{action:'start',yearLimit:null}).ok).toBe(false);
 const newHost=room.hostId;expect(manager.request('late',{action:'reconnect',...credentials[0]}).ok).toBe(true);expect(room.hostId).toBe(newHost);expect(events.filter(e=>e.event==='host-transferred')).toHaveLength(1);
 }finally{manager.dispose();}
});
it('明示leaveは即移譲し、古い復帰情報は拒否',()=>{
 const {manager,room,credentials}=setup(4),host=room.hostId;try{expect(manager.request('s0',{action:'leave'}).ok).toBe(true);expect(room.hostId).not.toBe(host);expect(manager.startErrors(room)).toEqual([]);expect(manager.request('gone',{action:'reconnect',...credentials[0]}).ok).toBe(false);}finally{manager.dispose();}
});
it('join/guest復帰はHost猶予を迂回せず、連続復帰・old socket切断でtimer二重発火なし',()=>{
 vi.useFakeTimers();const {manager,room,credentials,events}=setup(),host=room.hostId;
 try{manager.disconnect('s0');manager.disconnect('s0');expect(manager.request('fourth',{action:'join',nickname:'fourth',preferredWardId:null,roomCode:room.code}).ok).toBe(true);manager.disconnect('s1');expect(manager.request('guest-return',{action:'reconnect',...credentials[1]}).ok).toBe(true);expect(room.hostId).toBe(host);
 vi.advanceTimersByTime(10000);expect(manager.request('h1',{action:'reconnect',...credentials[0]}).ok).toBe(true);manager.disconnect('s0');expect(manager.playerForSocket('h1')?.playerId).toBe(host);
 manager.disconnect('h1');vi.advanceTimersByTime(10000);expect(manager.request('h2',{action:'reconnect',...credentials[0]}).ok).toBe(true);vi.advanceTimersByTime(30000);expect(room.hostId).toBe(host);expect(events.filter(e=>e.event==='host-grace-start')).toHaveLength(2);expect(events.filter(e=>e.event==='host-grace-cancel')).toHaveLength(2);expect(events.some(e=>e.event==='host-transferred')).toBe(false);
 }finally{manager.dispose();}
});
it('復帰成功後のold socket要求を拒否し、不正tokenでもidentityを作らない',()=>{
 const {manager,room,credentials,events}=setup();try{expect(manager.request('new',{action:'reconnect',...credentials[0]}).ok).toBe(true);for(const action of ['start','leave','preference'] as const)expect(manager.request('s0',action==='start'?{action,yearLimit:null}:action==='preference'?{action,preferredWardId:null}:{action})).toMatchObject({ok:false,errors:['先にルームへ参加してください']});
 expect(manager.request('bad',{action:'reconnect',...credentials[0],reconnectToken:'0'.repeat(64)}).ok).toBe(false);expect(manager.roomForSocket('bad')).toBeUndefined();expect(manager.playerForSocket('new')?.playerId).toBe(room.hostId);
 for(const credential of credentials)expect(JSON.stringify(events)).not.toContain(credential.reconnectToken);expect(events.map(e=>e.event)).toContain('reconnect-failed');
 }finally{manager.dispose();}
});
it('全員切断で猶予終了後、最初のguest復帰に移譲でき、disposeはtimerを止める',()=>{
 vi.useFakeTimers();const {manager,room,credentials,events}=setup();for(let i=0;i<3;i++)manager.disconnect(`s${i}`);vi.advanceTimersByTime(15000);expect(manager.request('g',{action:'reconnect',...credentials[1]}).ok).toBe(true);expect(room.hostId).toBe(credentials[1].playerId);manager.disconnect('g');const n=events.length;manager.dispose();vi.advanceTimersByTime(30000);expect(events).toHaveLength(n);
});
