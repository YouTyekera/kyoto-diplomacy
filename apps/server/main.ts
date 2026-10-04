import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { datasetSchema } from '../../packages/shared/model';
import { sampleDataset } from '../../packages/map-core/sample';
import { RoomManager } from '../../packages/online-core/room-manager';
import { createOnlineServer } from './server';
import { serverConfig } from './config';

const config=serverConfig();
const dataset=datasetSchema.parse(JSON.parse(await readFile(resolve('data/generated/regions.json'),'utf8')));
const standardScenarioJson=await readFile(resolve('data/default-scenarios/kyoto-standard.json'),'utf8');
const server=createOnlineServer(new RoomManager({'kyoto-kml':dataset,sample:sampleDataset},undefined,{standardScenarioJson}),config);
const {port,host}=config;
server.http.listen(port,host,()=>{
  const address=server.http.address();
  if(!address||typeof address==='string')throw new Error('HTTPサーバーのbind先を取得できません');
  console.log(`京都Diplomacy online server: http://${address.address}:${address.port} (ルームはメモリ保持)`);
  console.log(`server configuration: mode=${config.production?'production':'development'}, RENDER=${process.env.RENDER==='true'}, NODE_ENV=${JSON.stringify(process.env.NODE_ENV??null)}`);
});
server.http.on('error',error=>{console.error(`オンラインサーバーを起動できません: ${error.message}`);process.exitCode=1;});
for(const signal of ['SIGINT','SIGTERM'] as const) process.on(signal,()=>{void server.close().then(()=>process.exit(0));});
