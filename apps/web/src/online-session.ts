import type {Credentials,OnlineRequest,PrivatePlayerView,PublicRoomView} from '../../../packages/shared/online';
export const sessionWaitingMessage='ルームへの再接続を確認しています。少しお待ちください。';
type Identity=Pick<Credentials,'roomCode'|'playerId'>;
/** Transport epochs invalidate old acknowledgements; UI snapshots are not authentication. */
export class OnlineSession {
  epoch=0;
  transportConnected=false;
  roomSessionReady=false;
  private identity:Identity|null=null;
  private accepted=false;
  private publicState:PublicRoomView|null=null;
  private privateState:PrivatePlayerView|null=null;
  open(identity:Identity|null){this.invalidate();this.transportConnected=true;this.identity=identity?{roomCode:identity.roomCode,playerId:identity.playerId}:null;return this.epoch;}
  invalidate(){this.epoch++;this.transportConnected=false;this.roomSessionReady=false;this.accepted=false;this.identity=null;this.publicState=null;this.privateState=null;}
  begin(){this.roomSessionReady=false;this.accepted=false;this.publicState=null;this.privateState=null;}
  authenticated(epoch:number,identity:Identity){if(!this.current(epoch))return;this.identity={roomCode:identity.roomCode,playerId:identity.playerId};this.accepted=true;this.restore();}
  public(view:PublicRoomView){if(!this.transportConnected)return;this.publicState=view;this.restore();}
  private(view:PrivatePlayerView){if(!this.transportConnected)return;this.privateState=view;this.restore();}
  current(epoch:number){return this.transportConnected&&this.epoch===epoch;}
  canRequest(action:OnlineRequest['action']){return this.transportConnected&&(action==='create'||action==='join'||this.roomSessionReady);}
  private restore(){
    if(this.roomSessionReady)return;
    const identity=this.identity,pub=this.publicState,own=this.privateState;
    this.roomSessionReady=!!(this.accepted&&identity&&pub?.roomCode===identity.roomCode&&own?.playerId===identity.playerId&&pub.players.some(p=>p.playerId===identity.playerId&&p.connected)&&own.phaseKey===(pub.game?.phaseKey??null));
  }
}
