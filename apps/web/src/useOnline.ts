import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { OnlineConnection,PermanentConnectionError,probeHealth,type ConnectionState } from './online-connection';
import { OnlineSession,sessionWaitingMessage } from './online-session';
import { currentOnlineTarget } from './online-target';
import {browserIdentities,identityCredentials,type SavedIdentity,historyKey,identityPrefix} from './online-identities';
import { turnHistorySchema,type TurnSnapshot,sessionEndedSchema,privatePlayerSchema, publicRoomSchema, responseSchema,
  type SessionEnded,type Credentials, type PrivatePlayerView, type PublicRoomView, type OnlineRequest, type OnlineResponse, type ClientToServerEvents, type ServerToClientEvents } from '../../../packages/shared/online';

export function useOnline(inviteRoom?:string) {
  const [history]=useState(browserIdentities);
  const turnCache=useRef(new Map<string,TurnSnapshot[]>());
  const socket=useRef<Socket<ServerToClientEvents,ClientToServerEvents>|null>(null);
  const credentials=useRef<Credentials|null>(history.active(inviteRoom)),session=useRef(new OnlineSession()),inflight=useRef(0),blockingInflight=useRef(0),latestPublic=useRef<PublicRoomView|null>(null);
  const [savedIdentities,setSavedIdentities]=useState(()=>history.list()),[sessionNotice,setSessionNotice]=useState('');
  const waitingEnd=useRef<SessionEnded|null>(null);
  const [publicView,setPublicView]=useState<PublicRoomView|null>(null),[privateView,setPrivateView]=useState<PrivatePlayerView|null>(null);
  const [state,setState]=useState({transportConnected:false,roomSessionReady:false});
  const [pending,setPending]=useState(false),[blockingPending,setBlockingPending]=useState(false),[errors,setErrors]=useState<string[]>([]);
  const [presentationEpoch,setPresentationEpoch]=useState(0);
  const [connectionState,setConnectionState]=useState<ConnectionState>('connecting');
  // Browser-only diagnostic breadcrumbs. Do not include room codes, player identifiers, or tokens.
  const [networkEvents,setNetworkEvents]=useState<string[]>([]);
  const connectionAttempts=useRef(0);
  function trace(event:string,detail:string,transport='-'){
    const safeDetail=detail.slice(0,110);
    setNetworkEvents(previous=>[...previous.slice(-7),`${new Date().toLocaleTimeString('ja-JP')} | ${event} | ${safeDetail} | ${transport} | 再接続回数:${connectionAttempts.current}`]);
  }
  const recovery=useRef<OnlineConnection|null>(null);
  const target=currentOnlineTarget();
  function sync(){const gate=session.current;setState(previous=>previous.transportConnected===gate.transportConnected&&previous.roomSessionReady===gate.roomSessionReady?previous:{transportConnected:gate.transportConnected,roomSessionReady:gate.roomSessionReady});if(gate.roomSessionReady)setConnectionState('online');}
  function remember(value:Credentials,nickname?:string){history.remember(value,nickname??latestPublic.current?.players.find(p=>p.playerId===value.playerId)?.nickname??history.list().find(i=>i.playerId===value.playerId&&i.roomCode===value.roomCode)?.nickname??'以前の参加者');setSavedIdentities(history.list());}
  function endIdentity(reason:'kicked'|'replaced'|'removed'){
    const active=credentials.current;if(!active)return;
    if(reason==='kicked')history.remove(active);else history.clearActive();
    credentials.current=null;session.current.invalidate();sync();inflight.current=0;blockingInflight.current=0;setPending(false);setBlockingPending(false);latestPublic.current=null;setPublicView(null);setPrivateView(null);setSavedIdentities(history.list());setErrors([]);
    setSessionNotice(reason==='kicked'?'ホストによりルームから退出しました。':reason==='replaced'?'別のタブで復帰したため、このタブの参加を終了しました。':'保存した参加情報が削除されたため、このタブの参加を終了しました。');
    socket.current?.disconnect();recovery.current?.start(true);
  }
  useEffect(()=>{const refresh=(event:StorageEvent)=>{if(event.key===historyKey||event.key?.startsWith(identityPrefix)||event.key===null){const values=history.list();setSavedIdentities(values);const active=credentials.current;if(active&&!values.some(i=>i.roomCode===active.roomCode&&i.playerId===active.playerId))endIdentity('removed');}};window.addEventListener('storage',refresh);return()=>window.removeEventListener('storage',refresh);},[history]);
  useEffect(()=>{
    const config=currentOnlineTarget();
    if(!config.url){setConnectionState('unavailable');return;}
    const client:Socket<ServerToClientEvents,ClientToServerEvents>=io(config.url,{autoConnect:false,reconnection:false,timeout:10000,transports:['websocket','polling'],tryAllTransports:true});socket.current=client;
    const gate=session.current;
    let disposed=false,reconnectPublic=false,snapshotComplete:(()=>void)|undefined;
    const connection=new OnlineConnection({
      health:signal=>probeHealth(config.url!,signal),state:setConnectionState,disconnect:()=>client.disconnect(),
      connect:signal=>new Promise<void>((resolve,reject)=>{
        if(signal.aborted){reject(signal.reason);return;}
        let timer:ReturnType<typeof setTimeout>|undefined;
        let restoreStage='接続';
        const completeIfReady=()=>{if(gate.roomSessionReady){if(credentials.current)remember(credentials.current);cleanup();resolve();}};
        const cleanup=()=>{clearTimeout(timer);client.off('connect',success);client.off('connect_error',connectionError);signal.removeEventListener('abort',aborted);if(snapshotComplete===completeIfReady)snapshotComplete=undefined;};
        const failure=()=>{trace('接続失敗・タイムアウト',restoreStage,client.io.engine?.transport?.name??'-');cleanup();client.disconnect();reject(Error('Connection unavailable'));};
        const aborted=()=>{cleanup();client.disconnect();reject(signal.reason);};
        const success=()=>{
          trace('Socket接続成功',credentials.current?'本人復帰を開始':'新規参加待機',client.io.engine?.transport?.name??'-');
          const epoch=gate.open(credentials.current);sync();
          reconnectPublic=!!credentials.current;
          if(!credentials.current){cleanup();resolve();return;}
          setConnectionState('restoring');snapshotComplete=completeIfReady;
          restoreStage='本人認証応答待ち';
          timer=setTimeout(failure,10000);
          void client.timeout(10000).emitWithAck('request',{action:'reconnect',...credentials.current}).then(raw=>{
            if(disposed||signal.aborted||!gate.current(epoch))return;
            const response=responseSchema.parse(raw);
            if(!response.ok){
              trace('本人復帰拒否','保存されたルームが見つからないか、認証が無効');
              setErrors(['参加していたルームに復帰できません。サーバーの再起動でルームが失われた可能性があります。保存した参加情報を消し、新しいルームを作成してください。']);
              cleanup();reject(new PermanentConnectionError('Room session unavailable'));return;
            }
            // Ack authentication stays at 10s; the separate authoritative snapshot may take longer.
            clearTimeout(timer);restoreStage='公開・本人状態の受信待ち';timer=setTimeout(failure,30000);
            gate.authenticated(epoch,credentials.current!);sync();setErrors([]);completeIfReady();
          }).catch(()=>{if(!disposed&&!signal.aborted&&gate.current(epoch))failure();});
        };
        const connectionError=()=>{trace('Socket接続エラー','接続方式またはネットワークが利用できません');failure();};
        client.once('connect',success);client.once('connect_error',connectionError);signal.addEventListener('abort',aborted,{once:true});client.connect();
      }),
    });recovery.current=connection;
    client.on('publicState',view=>{
      if(disposed||!gate.transportConnected)return;
      const parsed=publicRoomSchema.safeParse(view);
      if(parsed.success){
        latestPublic.current=parsed.data;
        gate.public(parsed.data);sync();snapshotComplete?.();
        if(reconnectPublic){reconnectPublic=false;setPresentationEpoch(v=>v+1);}
        setPublicView(previous=>({...parsed.data,map:parsed.data.map??(previous?.roomCode===parsed.data.roomCode?previous.map:undefined),game:parsed.data.game?{...parsed.data.game,history:turnCache.current.get(parsed.data.roomCode)??[]}:null}));
      } else {
        // Report schema field paths only; never log room contents or private credentials.
        const fields = parsed.error.issues.slice(0, 3).map(issue => issue.path.join('.') || 'root').join(', ');
        trace('公開状態の形式エラー',fields);
        setErrors([`公開盤面の通信形式が不正です（${fields}）。FrontendとBackendの両方を最新コミットでデプロイしてください。`]);
      }
    });
    client.on('privateState',view=>{
      if(disposed||!gate.transportConnected)return;
      const parsed=privatePlayerSchema.safeParse(view);
      if(parsed.success){gate.private(parsed.data);sync();snapshotComplete?.();setPrivateView(parsed.data);}else {trace('本人状態の形式エラー',parsed.error.issues.slice(0,3).map(issue=>issue.path.join('.')||'root').join(', '));setErrors(['本人用入力の通信形式が不正です']);}
    });
    client.on('turnHistory',raw=>{
      if(disposed||!gate.transportConnected)return;
      const parsed=turnHistorySchema.safeParse(raw);if(!parsed.success||parsed.data.roomCode!==credentials.current?.roomCode)return;
      const {roomCode,snapshots}=parsed.data,merged=new Map((turnCache.current.get(roomCode)??[]).map(s=>[s.id,s]));
      for(const snapshot of snapshots)merged.set(snapshot.id,snapshot);
      const history=[...merged.values()].sort((a,b)=>a.year-b.year||(a.season===b.season?0:a.season==='spring'?-1:1));turnCache.current.set(roomCode,history);
      setPublicView(previous=>previous?.roomCode===roomCode&&previous.game?{...previous,game:{...previous.game,history}}:previous);
    });
    client.on('sessionEnded',raw=>{
      const parsed=sessionEndedSchema.safeParse(raw),active=credentials.current;
      if(disposed||!parsed.success)return;
      if(!active){waitingEnd.current=parsed.data;return;}
      if(active.roomCode!==parsed.data.roomCode||active.playerId!==parsed.data.playerId)return;
      trace('参加セッション終了',parsed.data.reason==='replaced'?'別タブが同じ参加者として復帰':parsed.data.reason==='kicked'?'ホストから退出指定':'参加情報が無効');
      endIdentity(parsed.data.reason);
    });
    client.on('disconnect',reason=>{if(disposed)return;
      if(reason!=='io client disconnect')connectionAttempts.current++;
      trace('Socket切断',reason,client.io.engine?.transport?.name??'-');
      gate.invalidate();sync();inflight.current=0;blockingInflight.current=0;setPending(false);setBlockingPending(false);if(reason!=='io client disconnect')connection.start(true);});
    connection.start();return ()=>{disposed=true;gate.invalidate();connection.dispose();recovery.current=null;socket.current=null;};
  },[]);
  async function request(input:OnlineRequest):Promise<OnlineResponse> {
    const gate=session.current,client=socket.current;
    if(!client?.connected||!gate.canRequest(input.action)){
      const response={ok:false as const,errors:[input.action==='create'||input.action==='join'?'サーバーへの接続を待ってください':sessionWaitingMessage]};setErrors(response.errors);return response;
    }
    const entering=input.action==='create'||input.action==='join';
    if(entering){gate.begin();sync();}
    const epoch=gate.epoch,blocking=!(input.action==='order-patch'||input.action==='legal-orders'||input.action==='history'||input.action==='orders'&&!input.finalize);
    inflight.current++;setPending(true);if(blocking){blockingInflight.current++;setBlockingPending(true);}
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
        if(input.action==='leave'){if(credentials.current)history.remove(credentials.current);history.clearActive();credentials.current=null;setSavedIdentities(history.list());inflight.current=0;blockingInflight.current=0;setPending(false);setBlockingPending(false);gate.open(null);sync();setPublicView(null);setPrivateView(null);latestPublic.current=null;}
      }
      return response;
    }catch{const response={ok:false as const,errors:['応答を確認できません。再接続後の状態を確認してください']};if(gate.current(epoch))setErrors(response.errors);return response;}
    finally{if(gate.current(epoch)){inflight.current=Math.max(0,inflight.current-1);setPending(inflight.current>0);if(blocking){blockingInflight.current=Math.max(0,blockingInflight.current-1);setBlockingPending(blockingInflight.current>0);}}}
  }
  function retry(){setErrors([]);session.current.invalidate();sync();inflight.current=0;blockingInflight.current=0;setPending(false);setBlockingPending(false);socket.current?.disconnect();recovery.current?.start(true);}
  function forget(){if(credentials.current)history.remove(credentials.current);history.clearActive();credentials.current=null;setSavedIdentities(history.list());setPublicView(null);setPrivateView(null);latestPublic.current=null;retry();}
  function restore(identity:SavedIdentity){if(publicView||credentials.current)return;credentials.current=identityCredentials(identity);remember(credentials.current,identity.nickname);setSessionNotice('');retry();}
  const connected=state.transportConnected&&(!credentials.current||state.roomSessionReady);
  return {publicView,privateView,...state,connected,pending,blockingPending,errors,request,forget,retry,restore,savedIdentities,sessionNotice,connectionState,networkEvents,configurationError:target.error,presentationEpoch,hasCredentials:!!credentials.current};
}
