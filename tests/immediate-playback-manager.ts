import { RoomManager as SessionManager } from '../packages/online-core/room-manager';
import type { ScenarioDiagnostic } from '../packages/online-core/scenario';
/** Existing rule regression tests explicitly use the host's start/skip commands to reach the next phase. */
export class RoomManager extends SessionManager {
  override request(socket:string,input:unknown,diagnostic?:(value:ScenarioDiagnostic)=>void){
    const response=super.request(socket,input,diagnostic),room=this.roomForSocket(socket),p=room?.game?.playback;
    if(response.ok&&p&&p.stage==='reveal'&&input&&typeof input==='object'&&'action'in input&&input.action==='orders'){
      const host=room!.players.get(room!.hostId)!.socketId!,id=p.next.presentation!.id;
      super.request(host,{action:'playback',presentationId:id,control:'start'});
      super.request(host,{action:'playback',presentationId:id,control:'skip'});
    }
    return response;
  }
}
