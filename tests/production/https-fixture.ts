// Test-only TLS edge: a static site and a separate HTTPS/WSS proxy to the real production entry.
// The checked-in self-signed key is public test data, never a deployment credential.
import {createServer} from 'node:https';
import {request as upstream} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import type {Socket} from 'node:net';
const tls={key:await readFile('tests/production/fixture-key.pem'),cert:await readFile('tests/production/fixture-cert.pem')};
const root=resolve(process.env.E2E_PRODUCTION_BUILD_DIR??'dist-public'),port=Number(process.env.PORT??3036);
const web=createServer(tls,async(req,res)=>{
 try{
  const path=resolve(root,'.'+new URL(req.url??'/', 'https://fixture.invalid').pathname);
  if(path!==root&&!path.startsWith(root+sep)){res.writeHead(403);res.end();return;}
  const file=(await stat(path)).isDirectory()?resolve(path,'index.html'):path;
  const types:Record<string,string>={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.wav':'audio/wav','.mp3':'audio/mpeg'};
  res.writeHead(200,{'Content-Type':types[extname(file)]??'application/octet-stream'});res.end(await readFile(file));
 }catch{res.writeHead(404);res.end();}
});
const api=createServer(tls,(req,res)=>{
 const proxy=upstream({host:'127.0.0.1',port,path:req.url,method:req.method,headers:req.headers},response=>{res.writeHead(response.statusCode??502,response.headers);response.pipe(res);});
 proxy.on('error',()=>{res.writeHead(503);res.end();});req.pipe(proxy);
});
const tunnels=new Set<Socket>();
api.on('upgrade',(req,socket,head)=>{
 const proxy=upstream({host:'127.0.0.1',port,path:req.url,method:'GET',headers:req.headers});
 proxy.on('upgrade',(response,target,targetHead)=>{
  socket.write(`HTTP/1.1 ${response.statusCode} Switching Protocols\r\n`+Object.entries(response.headers).map(([k,v])=>`${k}: ${v}\r\n`).join('')+'\r\n');
  if(targetHead.length)socket.write(targetHead);if(head.length)target.write(head);
  tunnels.add(target);tunnels.add(socket as Socket);target.on('close',()=>{tunnels.delete(target);socket.destroy();});socket.on('close',()=>{tunnels.delete(socket as Socket);target.destroy();});target.on('error',()=>socket.destroy());socket.on('error',()=>target.destroy());target.pipe(socket);socket.pipe(target);
 });
 proxy.on('response',response=>{socket.end(`HTTP/1.1 ${response.statusCode} Rejected\r\nConnection: close\r\n\r\n`);response.resume();});proxy.on('error',()=>socket.destroy());proxy.end();
});
web.listen(5443,'127.0.0.1');api.listen(5444,'127.0.0.1');
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{for(const socket of tunnels)socket.destroy();web.close();api.close();web.closeAllConnections();api.closeAllConnections();});
