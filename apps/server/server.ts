import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { randomUUID } from 'node:crypto';
import { RoomManager, serializePrivateState, serializePublicState, type Room } from '../../packages/online-core/room-manager';
import type { ClientToServerEvents, ServerToClientEvents, PublicRoomView } from '../../packages/shared/online';
import {mapDefinitionSchema,type MapDefinition} from '../../packages/shared/model';
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
      response.writeHead(draining?503:200,{'Content-Type':'application/json'});response.end(JSON.stringify({ok:!draining}));
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
  const wireMaps=new WeakMap<MapDefinition,NonNullable<PublicRoomView['map']>>();
  const queuedRooms=new Set<Room>();
  let scheduled:ReturnType<typeof setImmediate>|undefined;
  function publish(room:Room|undefined) {
    if(!room||manager.rooms.get(room.code)!==room) return;
    const publicView=serializePublicState(manager,room,false);
    let snapshot:PublicRoomView|undefined;
    for(const player of room.players.values()) if(player.socketId) {
      const socket=io.sockets.sockets.get(player.socketId);
      if(socket) {
        const mapKey=`${room.code}:${room.scenario.hash}`;
        if(sentMap.get(socket.id)!==mapKey) {
          // Parse the immutable compiled map once, not once per player/connection/presence update.
          let map=wireMaps.get(room.map);if(!map){map=mapDefinitionSchema.parse(room.map);wireMaps.set(room.map,map);}
          snapshot??={...publicView,map};
          socket.emit('publicState',snapshot);sentMap.set(socket.id,mapKey);
        } else socket.emit('publicState',publicView);
      }
      socket?.emit('privateState',serializePrivateState(manager,room,player));
    }
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
    sentMap.delete(socketId);io.sockets.sockets.get(socketId)?.emit('sessionEnded',event);
  });
  const unsubscribeRooms=manager.onRoomUpdate(queuePublish);
  io.on('connection',socket=>{
    socket.on('request',(request,ack)=>{
      if(typeof ack!=='function') return;
      if(draining){ack({ok:false,errors:['サーバーを再起動しています。接続が戻るまでお待ちください。']});return;}
      const previous=manager.roomForSocket(socket.id);
      let acknowledged=false;
      const respond:(result:Parameters<typeof ack>[0])=>void=result=>{if(!acknowledged){acknowledged=true;ack(result);}};
      try {
        const requestId=randomUUID();
        const scenarioRequest=request?.action==='scenario';
        const result=manager.request(socket.id,request,scenarioRequest?value=>console.info('[scenario-upload]',JSON.stringify({requestId,...value})):undefined);
        if(scenarioRequest&&!result.ok)console.info('[scenario-upload]',JSON.stringify({requestId,stage:'rejected'}));
        if(result.ok&&request.action==='leave') sentMap.delete(socket.id);
        if(result.ok){
          const current=manager.roomForSocket(socket.id);
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
    socket.on('disconnect',()=>{sentMap.delete(socket.id);const room=manager.roomForSocket(socket.id);manager.disconnect(socket.id);publishSafely(room);});
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
