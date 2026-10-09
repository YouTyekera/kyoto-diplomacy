import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { randomUUID } from 'node:crypto';
import { RoomManager, serializePrivateState, serializePublicState, type Room } from '../../packages/online-core/room-manager';
import type { ClientToServerEvents, ServerToClientEvents, PublicRoomView } from '../../packages/shared/online';
import {mapDefinitionSchema,type MapDefinition} from '../../packages/shared/model';
import {turnHistorySchema} from '../../packages/shared/online';
import { permittedOrigin, type ServerConfig } from './config';

export function createOnlineServer(manager:RoomManager,config:Pick<ServerConfig,'production'|'frontendOrigin'>={production:false}) {
  if(config.production&&!config.frontendOrigin)throw new Error('Production frontend origin is required');
  let draining=false,closing:Promise<void>|undefined;
  const http=createServer((request,response)=>{
    if(request.url==='/health') {
      response.setHeader('Vary','Origin');response.setHeader('Cache-Control','no-store');
      const origin=request.headers.origin;
      if(origin&&!permittedOrigin(origin,config)){response.writeHead(403);response.end();return;}
      if(origin)response.setHeader('Access-Control-Allow-Origin',origin);
      response.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');
      if(request.method==='OPTIONS'){response.writeHead(204);response.end();return;}
      if(request.method!=='GET'){response.writeHead(405);response.end();return;}
      response.writeHead(draining?503:200,{'Content-Type':'application/json'});response.end(JSON.stringify({ok:!draining,revision:process.env.RENDER_GIT_COMMIT?.slice(0,12)??null}));
    }
    else {response.writeHead(404);response.end('Not found');}
  });
  const io=new Server<ClientToServerEvents,ServerToClientEvents>(http,{
    maxHttpBufferSize:4*1024*1024,serveClient:false,
    cors:{origin:(origin,callback)=>callback(null,permittedOrigin(origin,config)),methods:['GET','POST']},
    // CORS alone does not protect a WebSocket upgrade.
    allowRequest:(request,callback)=>callback(null,!draining&&permittedOrigin(request.headers.origin,config)),
  });
  const sentMap=new Map<string,string>();
  const sentLobbyPrivate=new Map<string,{roomCode:string;playerId:string;preferredWardId:string|null}>();
  const sentHistory=new Map<string,{roomCode:string;count:number}>();
  function history(socketId:string,room:Room,force=false){
    if(!room.game)return;
    const previous=sentHistory.get(socketId),from=!force&&previous?.roomCode===room.code?previous.count:0;
    if(!force&&previous?.roomCode===room.code&&from===room.game.history.length)return;
    io.sockets.sockets.get(socketId)?.emit('turnHistory',turnHistorySchema.parse({roomCode:room.code,snapshots:room.game.history.slice(from)}));
    sentHistory.set(socketId,{roomCode:room.code,count:room.game.history.length});
  }
  const wireMaps=new WeakMap<MapDefinition,NonNullable<PublicRoomView['map']>>();
  const queuedRooms=new Set<Room>();
  let scheduled:ReturnType<typeof setImmediate>|undefined;
  function publish(room:Room|undefined) {
    if(!room||manager.rooms.get(room.code)!==room) return;
    const publishStarted=performance.now();
    const publicView=serializePublicState(manager,room,false,false);
    let snapshot:PublicRoomView|undefined;
    for(const player of room.players.values()) if(player.socketId) {
      const socket=io.sockets.sockets.get(player.socketId);
      if(socket) {
        const mapKey=`${room.code}:${room.scenario.hash}`;
        // The map is needed for gameplay, not for gathering people in the lobby.
        // Defer the expensive immutable map snapshot until the match starts.
        if(room.game&&sentMap.get(socket.id)!==mapKey) {
          // Parse the immutable compiled map once, not once per player/connection/presence update.
          let map=wireMaps.get(room.map);if(!map){map=mapDefinitionSchema.parse(room.map);wireMaps.set(room.map,map);}
          snapshot??={...publicView,map};
          socket.emit('publicState',snapshot);sentMap.set(socket.id,mapKey);
        } else socket.emit('publicState',publicView);
      }
      // Lobby presence updates do not change another player's private view.
      // Send it on the first snapshot or when that player's preference changes.
      if(socket){
        const previous=sentLobbyPrivate.get(socket.id);
        if(room.game||!previous||previous.roomCode!==room.code||previous.playerId!==player.playerId||previous.preferredWardId!==player.preferredWardId){
          socket.emit('privateState',serializePrivateState(manager,room,player));
          sentLobbyPrivate.set(socket.id,{roomCode:room.code,playerId:player.playerId,preferredWardId:player.preferredWardId});
        }
      }
      if(socket)history(socket.id,room);
    }
    const durationMs=Math.round(performance.now()-publishStarted);
    if(durationMs>250)console.warn('[online-perf] slow publish',JSON.stringify({durationMs,players:room.players.size,started:!!room.game}));
  }
  function publishSafely(room:Room|undefined){
    try{publish(room);return true;}catch{
      // Do not log the exception, request, snapshots or credentials: any may contain a token.
      console.error('[server-error] publish failed',JSON.stringify({roomCode:room?.code}));return false;
    }
  }
  function queuePublish(room:Room|undefined){
    if(!room||draining)return;
    queuedRooms.add(room);
    if(!scheduled)scheduled=setImmediate(()=>{
      scheduled=undefined;const rooms=[...queuedRooms];queuedRooms.clear();
      if(!draining)for(const current of rooms)publishSafely(current);
    });
  }
  const unsubscribe=manager.onSessionEvent(event=>{
    console.info('[online-session]',JSON.stringify(event));
    // A grace timeout runs outside the socket request transaction.
    if(event.event==='host-transferred'&&event.roomCode)queuePublish(manager.rooms.get(event.roomCode));
  });
  const unsubscribeEnds=manager.onSessionEnd((socketId,event)=>{
    console.info('[online-session-ended]',JSON.stringify({reason:event.reason}));
    sentMap.delete(socketId);sentLobbyPrivate.delete(socketId);io.sockets.sockets.get(socketId)?.emit('sessionEnded',event);
  });
  const unsubscribeRooms=manager.onRoomUpdate(queuePublish);
  io.engine.on('connection_error',error=>console.warn('[online-handshake]',JSON.stringify({code:error.code??null})));
  io.on('connection',socket=>{
    console.info('[online-socket]',JSON.stringify({event:'connected',transport:socket.conn.transport.name,connectedSockets:io.of('/').sockets.size}));
    socket.on('request',(request,ack)=>{
      if(typeof ack!=='function') return;
      if(draining){ack({ok:false,errors:['サーバーを再起動しています。接続が戻るまでお待ちください。']});return;}
      const previous=manager.roomForSocket(socket.id);
      let acknowledged=false;
      const respond:(result:Parameters<typeof ack>[0])=>void=result=>{if(!acknowledged){acknowledged=true;ack(result);}};
      try {
        const requestId=randomUUID();
        const scenarioRequest=request?.action==='scenario';
        const started=performance.now();
        const result=manager.request(socket.id,request,scenarioRequest?value=>console.info('[scenario-upload]',JSON.stringify({requestId,...value})):undefined);
        if(request?.action==='create'||request?.action==='join'||request?.action==='reconnect'){
          const room=manager.roomForSocket(socket.id);
          console.info('[online-entry]',JSON.stringify({action:request.action,ok:result.ok,players:room?.players.size??null,durationMs:Math.round(performance.now()-started),transport:socket.conn.transport.name}));
        }
        if(scenarioRequest&&!result.ok)console.info('[scenario-upload]',JSON.stringify({requestId,stage:'rejected'}));
        if(result.ok&&request.action==='leave') {sentMap.delete(socket.id);sentLobbyPrivate.delete(socket.id);}
        if(result.ok){
          const current=manager.roomForSocket(socket.id);
          if(request.action==='order-patch'||request.action==='legal-orders'||request.action==='history'||request.action==='orders'&&!request.finalize){
            respond(result);
            if(request.action==='history'&&current)setImmediate(()=>{try{if(manager.roomForSocket(socket.id)===current)history(socket.id,current,true);}catch{console.error('[server-error] history publish failed',JSON.stringify({roomCode:current.code}));}});
            return;
          }
          if(request.action==='create'||request.action==='join'||request.action==='reconnect'){
            // Persist identity before snapshots. Yield so synchronous serialization cannot block ack I/O.
            respond(result);queuePublish(current);if(previous!==current)queuePublish(previous);return;
          }
          const published=publishSafely(current),previousPublished=previous===current||publishSafely(previous);
          if(!published||!previousPublished){respond({ok:false,errors:['ルームの状態を配信できませんでした。再接続して最新の状態を確認してください。']});return;}
        }
        respond(result);
      } catch(error) {respond({ok:false,errors:[!config.production&&error instanceof Error?error.message:'サーバーの処理に失敗しました。接続状態を確認して再試行してください。']});}
    });
    socket.on('disconnect',reason=>{
      sentMap.delete(socket.id);sentLobbyPrivate.delete(socket.id);sentHistory.delete(socket.id);
      const room=manager.roomForSocket(socket.id);
      console.info('[online-transport]',JSON.stringify({reason,hadRoom:!!room,players:room?.players.size??null,phase:room?.game?'game':room?'lobby':'entry',transport:socket.conn.transport.name}));
      manager.disconnect(socket.id);publishSafely(room);
    });
  });
  function close(){
    if(closing)return closing;
    draining=true;
    if(scheduled)clearImmediate(scheduled);scheduled=undefined;queuedRooms.clear();
    unsubscribe();unsubscribeEnds();unsubscribeRooms();manager.dispose();
    closing=new Promise<void>(resolve=>{
      const limit=setTimeout(()=>{io.disconnectSockets(true);http.closeAllConnections();},8000);limit.unref();
      io.close(()=>{clearTimeout(limit);resolve();});http.closeIdleConnections();
    });
    return closing;
  }
  return {http,io,manager,close};
}
