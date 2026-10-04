import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { OnlineConnection,PermanentConnectionError,probeHealth,type ConnectionState } from './online-connection';
import { OnlineSession,sessionWaitingMessage } from './online-session';
import { currentOnlineTarget } from './online-target';
import { credentialsSchema, privatePlayerSchema, publicRoomSchema, responseSchema,
  type Credentials, type PrivatePlayerView, type PublicRoomView, type OnlineRequest, type OnlineResponse, type ClientToServerEvents, type ServerToClientEvents } from '../../../packages/shared/online';

const storageKey='kyoto-online-session-v1';
function storedCredentials():Credentials|null {
  try {const value=sessionStorage.getItem(storageKey);return value?credentialsSchema.parse(JSON.parse(value)):null;}catch{return null;}
}
function saveCredentials(value:Credentials|null){try{if(value)sessionStorage.setItem(storageKey,JSON.stringify(value));else sessionStorage.removeItem(storageKey);}catch{/* The current tab can still use its in-memory credentials. */}}
export function useOnline() {
  const socket=useRef<Socket<ServerToClientEvents,ClientToServerEvents>|null>(null);
  const credentials=useRef<Credentials|null>(storedCredentials()),session=useRef(new OnlineSession()),inflight=useRef(0);
  const [publicView,setPublicView]=useState<PublicRoomView|null>(null),[privateView,setPrivateView]=useState<PrivatePlayerView|null>(null);
  const [state,setState]=useState({transportConnected:false,roomSessionReady:false});
  const [pending,setPending]=useState(false),[errors,setErrors]=useState<string[]>([]);
  const [presentationEpoch,setPresentationEpoch]=useState(0);
  const [connectionState,setConnectionState]=useState<ConnectionState>('connecting');
  const recovery=useRef<OnlineConnection|null>(null);
  const target=currentOnlineTarget();
  function sync(){const gate=session.current;setState(previous=>previous.transportConnected===gate.transportConnected&&previous.roomSessionReady===gate.roomSessionReady?previous:{transportConnected:gate.transportConnected,roomSessionReady:gate.roomSessionReady});}
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
        const completeIfReady=()=>{if(gate.roomSessionReady){cleanup();resolve();}};
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
            gate.authenticated(epoch,credentials.current!);sync();setErrors([]);completeIfReady();
          }).catch(()=>{if(!disposed&&!signal.aborted&&gate.current(epoch))failure();});
        };
        client.once('connect',success);client.once('connect_error',failure);signal.addEventListener('abort',aborted,{once:true});client.connect();
      }),
    });recovery.current=connection;
    client.on('publicState',view=>{
      if(!gate.transportConnected)return;
      const parsed=publicRoomSchema.safeParse(view);
      if(parsed.success){
        gate.public(parsed.data);sync();snapshotComplete?.();
        if(reconnectPublic){reconnectPublic=false;setPresentationEpoch(v=>v+1);}
        setPublicView(previous=>({...parsed.data,map:parsed.data.map??(previous?.roomCode===parsed.data.roomCode?previous.map:undefined)}));
      }else setErrors(['公開盤面の通信形式が不正です']);
    });
    client.on('privateState',view=>{
      if(!gate.transportConnected)return;
      const parsed=privatePlayerSchema.safeParse(view);
      if(parsed.success){gate.private(parsed.data);sync();snapshotComplete?.();setPrivateView(parsed.data);}else setErrors(['本人用入力の通信形式が不正です']);
    });
    client.on('disconnect',reason=>{gate.invalidate();sync();inflight.current=0;setPending(false);if(!disposed&&reason!=='io client disconnect')connection.start(true);});
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
        setErrors([]);
        if(response.credentials){credentials.current=response.credentials;saveCredentials(response.credentials);gate.authenticated(epoch,response.credentials);sync();}
        if(input.action==='leave'){credentials.current=null;saveCredentials(null);inflight.current=0;setPending(false);gate.open(null);sync();setPublicView(null);setPrivateView(null);}
      }
      return response;
    }catch{const response={ok:false as const,errors:['応答を確認できません。再接続後の状態を確認してください']};if(gate.current(epoch))setErrors(response.errors);return response;}
    finally{if(gate.current(epoch)){inflight.current=Math.max(0,inflight.current-1);setPending(inflight.current>0);}}
  }
  function retry(){setErrors([]);session.current.invalidate();sync();inflight.current=0;setPending(false);socket.current?.disconnect();recovery.current?.start(true);}
  function forget(){credentials.current=null;saveCredentials(null);setPublicView(null);setPrivateView(null);retry();}
  const connected=state.transportConnected&&(!credentials.current||state.roomSessionReady);
  return {publicView,privateView,...state,connected,pending,errors,request,forget,retry,connectionState,configurationError:target.error,presentationEpoch,hasCredentials:!!credentials.current};
}
