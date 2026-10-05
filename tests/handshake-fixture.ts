import {RoomManager,type Room} from '../packages/online-core/room-manager';
import type {ScenarioDiagnostic} from '../packages/online-core/scenario';
/** Browser fixture only: block the SERVER event loop for > the client's ack timeout. */
export class DelayedPublishManager extends RoomManager {
 private readonly delayed=new Set<string>();
 private readonly armed=new Set<Room>();
 override request(socketId:string,input:unknown,diagnostic?:(value:ScenarioDiagnostic)=>void){
  const result=super.request(socketId,input,diagnostic),room=this.roomForSocket(socketId),player=this.playerForSocket(socketId);
  if(result.ok&&room&&player?.nickname.startsWith('遅延保存')&&input&&typeof input==='object'&&'action' in input&&(input.action==='create'||input.action==='join'||input.action==='reconnect')){
   const key=`${input.action}:${player.playerId}`;if(!this.delayed.has(key)){this.delayed.add(key);this.armed.add(room);}
  }
  return result;
 }
 override preflight(room:Room){if(this.armed.delete(room))Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,11000);return super.preflight(room);}
}
