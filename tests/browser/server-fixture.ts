// Browser regression runs use equipment-only weights, so unrelated movement fixtures
// never gain random road closures. Production main.ts always uses the equal-weight file.
import { readFile } from 'node:fs/promises';
import { datasetSchema } from '../../packages/shared/model';
import { sampleDataset } from '../../packages/map-core/sample';
import { RoomManager } from '../../packages/online-core/room-manager';
import { createOnlineServer } from '../../apps/server/server';
import { seededValue } from '../../packages/game-core/events';

let serial=0,seed:string;
do{seed=`browser-events-${serial++}`;}while(seededValue(`${seed}:1:spring:0`)>=.5||seededValue(`${seed}:1:autumn:2`)<.5);
const dataset=datasetSchema.parse(JSON.parse(await readFile('data/generated/regions.json','utf8')));
const standardScenarioJson=await readFile('data/default-scenarios/kyoto-standard.json','utf8');
const manager=new RoomManager({'kyoto-kml':dataset,sample:sampleDataset},undefined,{standardScenarioJson,seedFactory:()=>seed,settings:{weights:{bicycle:1,barricade:1,roadwork:0,bus:0}}});
const server=createOnlineServer(manager);
const port=Number(process.env.ONLINE_PORT??3001);
server.http.listen(port,'127.0.0.1',()=>console.log(`ブラウザー検証サーバー: http://127.0.0.1:${port}`));
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{void server.close().then(()=>process.exit(0));});
