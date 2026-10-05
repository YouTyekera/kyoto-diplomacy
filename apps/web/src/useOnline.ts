import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { OnlineConnection,PermanentConnectionError,probeHealth,type ConnectionState } from './online-connection';
import { OnlineSession,sessionWaitingMessage } from './online-session';
import { currentOnlineTarget } from './online-target';
import {browserIdentities,identityCredentials,type SavedIdentity,historyKey,identityPrefix} from './online-identities';
import { sessionEndedSchema,privatePlayerSchema, publicRoomSchema, responseSchema,
  type SessionEnded,type Credentials, type PrivatePlayerView, type PublicRoomView, type OnlineRequest, type OnlineResponse, type ClientToServerEvents, type ServerToClientEvents } from '../../../packages/shared/online';

export function useOnline(inviteRoom?:string) {
  const [history]=useState(browserIdentities);
  const socket=useRef<Socket<ServerToClientEvents,ClientToServerEvents>|null>(null);
  const credentials=useRef<Credentials|null>(history.active(inviteRoom)),session=useRef(new OnlineSession()),inflight=useRef(0),latestPublic=useRef<PublicRoomView|null>(null);
  const [savedIdentities,setSavedIdentities]=useState(()=>history.list()),[sessionNotice,setSessionNotice]=useState('');
  const waitingEnd=useRef<SessionEnded|null>(null);
  const [publicView,setPublicView]=useState<PublicRoomView|null>(null),[privateView,setPrivateView]=useState<PrivatePlayerView|null>(null);
  const [state,setState]=useState({transportConnected:false,roomSessionReady:false});
  const [pending,setPending]=useState(false),[errors,setErrors]=useState<string[]>([]);
  const [presentationEpoch,setPresentationEpoch]=useState(0);
  const [connectionState,setConnectionState]=useState<ConnectionState>('connecting');
  const recovery=useRef<OnlineConnection|null>(null);
  const target=currentOnlineTarget();
  function sync(){const gate=session.current;setState(previous=>previous.transportConnected===gate.transportConnected&&previous.roomSessionReady===gate.roomSessionReady?previous:{transportConnected:gate.transportConnected,roomSessionReady:gate.roomSessionReady});if(gate.roomSessionReady)setConnectionState('online');}
  function remember(value:Credentials,nickname?:string){history.remember(value,nickname??latestPublic.current?.players.find(p=>p.playerId===value.playerId)?.nickname??history.list().find(i=>i.playerId===value.playerId&&i.roomCode===value.roomCode)?.nickname??'以前の参加者');setSavedIdentities(history.list());}
  function endIdentity(reason:'kicked'|'replaced'|'removed'){
    const active=credentials.current;if(!active)return;
    if(reason==='kicked')history.remove(active);else history.clearActive();
    credentials.current=null;session.current.invalidate();sync();inflight.current=0;setPending(false);latestPublic.current=null;setPublicView(null);setPrivateView(null);setSavedIdentities(history.list());setErrors([]);
    setSessionNotice(reason==='kicked'?'ホストによりルームから退出しました。':reason==='replaced'?'別のタブで復帰したため、このタブの参加を終了しました。':'保存した参加情報が削除されたため、このタブの参加を終了しました。');
    socket.current?.disconnect();recovery.current?.start(true);
  }
  useEffect(()=>{const refresh=(event:StorageEvent)=>{if(event.key===historyKey||event.key?.startsWith(identityPrefix)||event.key===null){const values=history.list();setSavedIdentities(values);const active=credentials.current;if(active&&!values.some(i=>i.roomCode===active.roomCode&&i.playerId===active.playerId))endIdentity('removed');}};window.addEventListener('storage',refresh);return()=>window.removeEventListener('storage',refresh);},[history]);
  useEffect(()=>{
    const config=currentOnlineTarget();
    if(!config.url){setConnectionState('unavailable');return;}
    const client:Socket<ServerToClientEvents,ClientToServerEvents>=io(config.url,{autoConnect:false,reconnection:false,timeout:10000});socket.current=client;
    const gate=session.current;
    let disposed=false,reconnectPublic=false,snapshotComplete:(()=>void)|undefined;
    const connection=new OnlineConnection({
      health:signal=>probeHealth(config.url!,signal),state:setConnectionState,disconnect:()=>client.disconnect(),
      connect:signal=>new Promise<void>((resolve,reject)=>{
        if(signal.aborted){reject(signal.reason);return;}
        let timer:ReturnType<typeof setTimeout>|undefined;
        const completeIfReady=()=>{if(gate.roomSessionReady){if(credentials.current)remember(credentials.current);cleanup();resolve();}};
        const cleanup=()=>{clearTimeout(timer);client.off('connect',success);client.off('connect_error',failure);signal.removeEventListener('abort',aborted);if(snapshotComplete===completeIfReady)snapshotComplete=undefined;};
        const failure=()=>{cleanup();client.disconnect();reject(Error('Connection unavailable'));};
        const aborted=()=>{cleanup();client.disconnect();reject(signal.reason);};
        const success=()=>{
          const epoch=gate.open(credentials.current);sync();
          reconnectPublic=!!credentials.current;
          if(!credentials.current){cleanup();resolve();return;}
          setConnectionState('restoring');snapshotComplete=completeIfReady;
          timer=setTimeout(failure,10000);
          void client.timeout(10000).emitWithAck('request',{action:'reconnect',...credentials.current}).then(raw=>{
            if(disposed||signal.aborted||!gate.current(epoch))return;
            const response=responseSchema.parse(raw);
            if(!response.ok){
              setErrors(['参加していたルームに復帰できません。サーバーの再起動でルームが失われた可能性があります。保存した参加情報を消し、新しいルームを作成してください。']);
              cleanup();reject(new PermanentConnectionError('Room session unavailable'));return;
            }
            // Ack authentication stays at 10s; the separate authoritative snapshot may take longer.
            clearTimeout(timer);timer=setTimeout(failure,30000);
            gate.authenticated(epoch,credentials.current!);sync();setErrors([]);completeIfReady();
          }).catch(()=>{if(!disposed&&!signal.aborted&&gate.current(epoch))failure();});
        };
        client.once('connect',success);client.once('connect_error',failure);signal.addEventListener('abort',aborted,{once:true});client.connect();
      }),
    });recovery.current=connection;
    client.on('publicState',view=>{
      if(disposed||!gate.transportConnected)return;
      const parsed=publicRoomSchema.safeParse(view);
      if(parsed.success){
        latestPublic.current=parsed.data;
        gate.public(parsed.data);sync();snapshotComplete?.();
        if(reconnectPublic){reconnectPublic=false;setPresentationEpoch(v=>v+1);}
        setPublicView(previous=>({...parsed.data,map:parsed.data.map??(previous?.roomCode===parsed.data.roomCode?previous.map:undefined)}));
      }else setErrors(['公開盤面の通信形式が不正です']);
    });
    client.on('privateState',view=>{
      if(disposed||!gate.transportConnected)return;
      const parsed=privatePlayerSchema.safeParse(view);
      if(parsed.success){gate.private(parsed.data);sync();snapshotComplete?.();setPrivateView(parsed.data);}else setErrors(['本人用入力の通信形式が不正です']);
    });
    client.on('sessionEnded',raw=>{
      const parsed=sessionEndedSchema.safeParse(raw),active=credentials.current;
      if(disposed||!parsed.success)return;
      if(!active){waitingEnd.current=parsed.data;return;}
      if(active.roomCode!==parsed.data.roomCode||active.playerId!==parsed.data.playerId)return;
      endIdentity(parsed.data.reason);
    });
    client.on('disconnect',reason=>{if(disposed)return;gate.invalidate();sync();inflight.current=0;setPending(false);if(reason!=='io client disconnect')connection.start(true);});
    connection.start();return ()=>{disposed=true;gate.invalidate();connection.dispose();recovery.current=null;socket.current=null;};
  },[]);
  async function request(input:OnlineRequest):Promise<OnlineResponse> {
    const gate=session.current,client=socket.current;
    if(!client?.connected||!gate.canRequest(input.action)){
      const response={ok:false as const,errors:[input.action==='create'||input.action==='join'?'サーバーへの接続を待ってください':sessionWaitingMessage]};setErrors(response.errors);return response;
    }
    const entering=input.action==='create'||input.action==='join';
    if(entering){gate.begin();sync();}
    const epoch=gate.epoch;inflight.current++;setPending(true);
    try {
      const response=responseSchema.parse(await client.timeout(10000).emitWithAck('request',input));
      if(!gate.current(epoch))return {ok:false,errors:[sessionWaitingMessage]};
      if(!response.ok)setErrors(response.errors);
      else {
        setErrors([]);setSessionNotice('');
        if(response.credentials){
          credentials.current=response.credentials;remember(response.credentials,entering?input.nickname:undefined);
          const ended=waitingEnd.current;waitingEnd.current=null;
          if(ended&&ended.roomCode===response.credentials.roomCode&&ended.playerId===response.credentials.playerId){endIdentity(ended.reason);return {ok:false,errors:['このルームへの参加は終了しました。']};}
          gate.authenticated(epoch,response.credentials);sync();if(!gate.roomSessionReady)setConnectionState('restoring');
        }
        if(input.action==='leave'){if(credentials.current)history.remove(credentials.current);history.clearActive();credentials.current=null;setSavedIdentities(history.list());inflight.current=0;setPending(false);gate.open(null);sync();setPublicView(null);setPrivateView(null);latestPublic.current=null;}
      }
      return response;
    }catch{const response={ok:false as const,errors:['応答を確認できません。再接続後の状態を確認してください']};if(gate.current(epoch))setErrors(response.errors);return response;}
    finally{if(gate.current(epoch)){inflight.current=Math.max(0,inflight.current-1);setPending(inflight.current>0);}}
  }
  function retry(){setErrors([]);session.current.invalidate();sync();inflight.current=0;setPending(false);socket.current?.disconnect();recovery.current?.start(true);}
  function forget(){if(credentials.current)history.remove(credentials.current);history.clearActive();credentials.current=null;setSavedIdentities(history.list());setPublicView(null);setPrivateView(null);latestPublic.current=null;retry();}
  function restore(identity:SavedIdentity){if(publicView||credentials.current)return;credentials.current=identityCredentials(identity);remember(credentials.current,identity.nickname);setSessionNotice('');retry();}
  const connected=state.transportConnected&&(!credentials.current||state.roomSessionReady);
  return {publicView,privateView,...state,connected,pending,errors,request,forget,retry,restore,savedIdentities,sessionNotice,connectionState,configurationError:target.error,presentationEpoch,hasCredentials:!!credentials.current};
}
