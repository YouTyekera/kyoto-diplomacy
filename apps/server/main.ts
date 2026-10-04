import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { datasetSchema } from '../../packages/shared/model';
import { sampleDataset } from '../../packages/map-core/sample';
import { RoomManager } from '../../packages/online-core/room-manager';
import { createOnlineServer } from './server';
import { serverConfig } from './config';

const config=serverConfig();
const dataset=datasetSchema.parse(JSON.parse(await readFile(resolve('data/generated/regions.json'),'utf8')));
const server=createOnlineServer(new RoomManager({'kyoto-kml':dataset,sample:sampleDataset}),config);
const {port,host}=config;
server.http.listen(port,host,()=>console.log(`京都Diplomacy online server: http://${host}:${port} (ルームはメモリ保持)`));
server.http.on('error',error=>{console.error(`オンラインサーバーを起動できません: ${error.message}`);process.exitCode=1;});
for(const signal of ['SIGINT','SIGTERM'] as const) process.on(signal,()=>{void server.close().then(()=>process.exit(0));});
