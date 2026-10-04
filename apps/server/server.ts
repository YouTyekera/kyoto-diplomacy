import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { randomUUID } from 'node:crypto';
import { RoomManager, serializePrivateState, serializePublicState, type Room } from '../../packages/online-core/room-manager';
import type { ClientToServerEvents, ServerToClientEvents, PublicRoomView } from '../../packages/shared/online';
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
  function publish(room:Room|undefined) {
    if(!room||!manager.rooms.has(room.code)) return;
    const publicView=serializePublicState(manager,room,false);
    let snapshot:PublicRoomView|undefined;
    for(const player of room.players.values()) if(player.socketId) {
      const socket=io.sockets.sockets.get(player.socketId);
      if(socket) {
        const mapKey=`${room.code}:${room.scenario.hash}`;
        if(sentMap.get(socket.id)!==mapKey) {
          snapshot??=serializePublicState(manager,room);
          socket.emit('publicState',snapshot);sentMap.set(socket.id,mapKey);
        } else socket.emit('publicState',publicView);
      }
      socket?.emit('privateState',serializePrivateState(manager,room,player));
    }
  }
  io.on('connection',socket=>{
    socket.on('request',(request,ack)=>{
      if(typeof ack!=='function') return;
      if(draining){ack({ok:false,errors:['サーバーを再起動しています。接続が戻るまでお待ちください。']});return;}
      const previous=manager.roomForSocket(socket.id);
      try {
        const requestId=randomUUID();
        const scenarioRequest=request?.action==='scenario';
        const result=manager.request(socket.id,request,scenarioRequest?value=>console.info('[scenario-upload]',JSON.stringify({requestId,...value})):undefined);
        if(scenarioRequest&&!result.ok)console.info('[scenario-upload]',JSON.stringify({requestId,stage:'rejected'}));
        if(result.ok&&request.action==='leave') sentMap.delete(socket.id);
        if(result.ok) {const current=manager.roomForSocket(socket.id);publish(current);if(previous!==current) publish(previous);}
        // State packets precede the ack, so clients unlock inputs only after receiving the saved draft.
        ack(result);
      } catch(error) {ack({ok:false,errors:[!config.production&&error instanceof Error?error.message:'サーバーの処理に失敗しました。接続状態を確認して再試行してください。']});}
    });
    socket.on('disconnect',()=>{sentMap.delete(socket.id);const room=manager.roomForSocket(socket.id);manager.disconnect(socket.id);publish(room);});
  });
  function close(){
    if(closing)return closing;
    draining=true;
    closing=new Promise<void>(resolve=>{
      const limit=setTimeout(()=>{io.disconnectSockets(true);http.closeAllConnections();},8000);limit.unref();
      io.close(()=>{clearTimeout(limit);resolve();});http.closeIdleConnections();
    });
    return closing;
  }
  return {http,io,manager,close};
}
