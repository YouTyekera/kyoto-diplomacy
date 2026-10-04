import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { OnlineConnection,probeHealth,type ConnectionState } from './online-connection';
import { currentOnlineTarget } from './online-target';
import { credentialsSchema, privatePlayerSchema, publicRoomSchema, responseSchema,
  type Credentials, type PrivatePlayerView, type PublicRoomView, type OnlineRequest, type OnlineResponse, type ClientToServerEvents, type ServerToClientEvents } from '../../../packages/shared/online';

const storageKey='kyoto-online-session-v1';
function storedCredentials():Credentials|null {
  try {const value=sessionStorage.getItem(storageKey);return value?credentialsSchema.parse(JSON.parse(value)):null;}catch{return null;}
}
export function useOnline() {
  const socket=useRef<Socket<ServerToClientEvents,ClientToServerEvents>|null>(null);
  const credentials=useRef<Credentials|null>(storedCredentials());
  const [publicView,setPublicView]=useState<PublicRoomView|null>(null),[privateView,setPrivateView]=useState<PrivatePlayerView|null>(null);
  const [connected,setConnected]=useState(false),[pending,setPending]=useState(false),[errors,setErrors]=useState<string[]>([]);
  const [presentationEpoch,setPresentationEpoch]=useState(0);
  const [connectionState,setConnectionState]=useState<ConnectionState>('connecting');
  const recovery=useRef<OnlineConnection|null>(null);
  const target=currentOnlineTarget();
  useEffect(()=>{
    const config=currentOnlineTarget();
    if(!config.url){setConnectionState('unavailable');return;}
    const client:Socket<ServerToClientEvents,ClientToServerEvents>=io(config.url,{autoConnect:false,reconnection:false,timeout:10000});socket.current=client;
    let disposed=false;
    const connection=new OnlineConnection({
      health:signal=>probeHealth(config.url!,signal),state:setConnectionState,disconnect:()=>client.disconnect(),
      connect:signal=>new Promise<void>((resolve,reject)=>{
        if(signal.aborted){reject(signal.reason);return;}
        const cleanup=()=>{client.off('connect',success);client.off('connect_error',failure);signal.removeEventListener('abort',aborted);};
        const success=()=>{cleanup();resolve();},failure=()=>{cleanup();client.disconnect();reject(Error('Connection unavailable'));};
        const aborted=()=>{cleanup();client.disconnect();reject(signal.reason);};
        client.once('connect',success);client.once('connect_error',failure);signal.addEventListener('abort',aborted,{once:true});client.connect();
      }),
    });recovery.current=connection;
    let reconnectPublic=false;
    client.on('publicState',view=>{
      const parsed=publicRoomSchema.safeParse(view);
      if(parsed.success&&reconnectPublic){reconnectPublic=false;setPresentationEpoch(v=>v+1);}
      if(parsed.success)setPublicView(previous=>({...parsed.data,map:parsed.data.map??(previous?.roomCode===parsed.data.roomCode?previous.map:undefined)}));
      else setErrors(['公開盤面の通信形式が不正です']);
    });
    client.on('privateState',view=>{const parsed=privatePlayerSchema.safeParse(view);if(parsed.success)setPrivateView(parsed.data);else setErrors(['本人用入力の通信形式が不正です']);});
    client.on('connect',()=>{
      setConnected(true);
      reconnectPublic=!!credentials.current;
      if(credentials.current) void client.timeout(10000).emitWithAck('request',{action:'reconnect',...credentials.current}).then(raw=>{
        if(disposed)return;
        const response=responseSchema.parse(raw);
        if(!response.ok){setPublicView(null);setPrivateView(null);setErrors(['参加していたルームに復帰できません。サーバーの再起動でルームが失われた可能性があります。保存した参加情報を消し、新しいルームを作成してください。']);}else setErrors([]);
      }).catch(()=>{if(!disposed){setConnected(false);client.disconnect();connection.start(true);}});
    });
    client.on('disconnect',reason=>{setConnected(false);if(!disposed&&reason!=='io client disconnect')connection.start(true);});
    connection.start();return ()=>{disposed=true;connection.dispose();recovery.current=null;socket.current=null;};
  },[]);
  async function request(input:OnlineRequest):Promise<OnlineResponse> {
    if(!socket.current?.connected) return {ok:false,errors:['サーバーへの接続を待ってください']};
    setPending(true);
    try {
      const response=responseSchema.parse(await socket.current.timeout(10000).emitWithAck('request',input));
      if(!response.ok) setErrors(response.errors);
      else {
        setErrors([]);
        if(response.credentials) {credentials.current=response.credentials;sessionStorage.setItem(storageKey,JSON.stringify(response.credentials));}
        if(input.action==='leave') {credentials.current=null;sessionStorage.removeItem(storageKey);setPublicView(null);setPrivateView(null);}
      }
      return response;
    }catch {const response={ok:false as const,errors:['応答を確認できません。再接続後の状態を確認してください']};setErrors(response.errors);return response;}
    finally {setPending(false);}
  }
  function retry(){setErrors([]);setConnected(false);socket.current?.disconnect();recovery.current?.start(true);}
  function forget() {credentials.current=null;sessionStorage.removeItem(storageKey);setPublicView(null);setPrivateView(null);retry();}
  return {publicView,privateView,connected,pending,errors,request,forget,retry,connectionState,configurationError:target.error,presentationEpoch,hasCredentials:!!credentials.current};
}
