import {expect,it,vi} from 'vitest';
import {OnlineSession} from './online-session';
import {OnlineConnection,PermanentConnectionError} from './online-connection';
import type {PublicRoomView,PrivatePlayerView,OnlineRequest} from '../../../packages/shared/online';
const identity={roomCode:'ABC234',playerId:'me'};
const pub=(id='me',code='ABC234')=>({roomCode:code,players:[{playerId:id,connected:true}],game:null}) as PublicRoomView;
const own=(id='me')=>({playerId:id,phaseKey:null}) as PrivatePlayerView;
const actions:OnlineRequest['action'][]=['start','scenario','standard-scenario','lobby-years','preference','leave','orders','retreats','winter','unready','export-log','presentation-skipped'];
it('transportだけではRoom操作を解放せず、ackと本人/公開状態が全て揃ってから解放',()=>{
 const gate=new OnlineSession(),epoch=gate.open(identity);expect(gate.transportConnected).toBe(true);for(const action of actions)expect(gate.canRequest(action)).toBe(false);
 gate.public(pub());gate.private(own());expect(gate.roomSessionReady).toBe(false);gate.authenticated(epoch,identity);expect(gate.roomSessionReady).toBe(true);for(const action of actions)expect(gate.canRequest(action)).toBe(true);
});
it('ackが先でも本人状態の復元を待つ',()=>{
 const gate=new OnlineSession(),epoch=gate.open(identity);gate.authenticated(epoch,identity);gate.public(pub());expect(gate.roomSessionReady).toBe(false);gate.private(own());expect(gate.roomSessionReady).toBe(true);
});
it('切断・連続接続は古いsnapshot/ackを破棄し、復帰失敗時もstale UIを操作できない',()=>{
 const gate=new OnlineSession(),old=gate.open(identity);gate.public(pub());gate.private(own());gate.authenticated(old,identity);gate.invalidate();expect(gate.canRequest('start')).toBe(false);
 const epoch=gate.open(identity);gate.authenticated(old,identity);expect(gate.roomSessionReady).toBe(false);gate.public(pub());gate.private(own());expect(gate.roomSessionReady).toBe(false);gate.authenticated(epoch,identity);expect(gate.roomSessionReady).toBe(true);
 gate.invalidate();gate.open(identity);gate.public(pub());gate.private(own());for(const action of actions)expect(gate.canRequest(action)).toBe(false);
});
it('別人/別Room/切断表示/古いphaseの状態では解放しない',()=>{
 for(const [p,s] of [[pub('other'),own()], [pub('me','DEF234'),own()], [pub(),own('other')], [{...pub(),players:[{...pub().players[0],connected:false}]},own()], [{...pub(),game:{phaseKey:'new'}},own()]] as [PublicRoomView,PrivatePlayerView][]){
  const gate=new OnlineSession(),epoch=gate.open(identity);gate.authenticated(epoch,identity);gate.public(p);gate.private(s);expect(gate.roomSessionReady).toBe(false);
 }
});
it('初参加はcreate/joinを送信でき、保存credentialsへの依存なくack後に確立',()=>{
 const gate=new OnlineSession(),epoch=gate.open(null);expect(gate.canRequest('create')).toBe(true);expect(gate.canRequest('join')).toBe(true);expect(gate.canRequest('start')).toBe(false);gate.begin();gate.public(pub());gate.private(own());gate.authenticated(epoch,identity);expect(gate.canRequest('start')).toBe(true);
});
it('永続的な復帰拒否ではonlineを表示せず、health/reconnect反復を停止',async()=>{
 vi.useFakeTimers();const states:string[]=[],health=vi.fn().mockResolvedValue(true),connect=vi.fn().mockRejectedValue(new PermanentConnectionError('Room unavailable'));
 const connection=new OnlineConnection({health,connect,disconnect:()=>{},state:s=>states.push(s)});
 try{connection.start(true);await vi.advanceTimersByTimeAsync(120000);expect(states.at(-1)).toBe('unavailable');expect(states).not.toContain('online');expect(connect).toHaveBeenCalledTimes(1);}finally{connection.dispose();vi.useRealTimers();}
});
