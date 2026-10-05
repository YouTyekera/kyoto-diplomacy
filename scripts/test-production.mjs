import {spawnSync} from 'node:child_process';
import {readFileSync,readdirSync,mkdirSync,mkdtempSync} from 'node:fs';
import {resolve} from 'node:path';
const npmCli=process.env.npm_execpath;
if(!npmCli)throw Error('Run this helper with npm run test:production.');
// Every run owns a fresh build directory. Never clear/overwrite user music in dist or dist-public.
mkdirSync('.reference-cache',{recursive:true});
const buildDir=mkdtempSync(resolve('.reference-cache/production-build-'));
const env={...process.env,VITE_PUBLIC_DEPLOYMENT:'true',VITE_ONLINE_SERVER_URL:'https://kyoto-server.test:5444',E2E_PRODUCTION_BUILD_DIR:buildDir};
function run(args){const result=spawnSync(process.execPath,[npmCli,...args],{stdio:'inherit',env});if(result.status!==0)process.exit(result.status??1);}
run(['run','build','--','--outDir',buildDir]);
for(const name of readdirSync(`${buildDir}/assets`).filter(f=>f.endsWith('.js'))){
 const text=readFileSync(`${buildDir}/assets/${name}`,'utf8');
 if(/https?:\/\/(?:localhost|127\.0\.0\.1)(?=[:/"'])/.test(text))throw Error(`Fixed local URL in public bundle: ${name}`);
}
console.log('Public bundle: no fixed localhost URL.');
run(['run','test:browser','--','--config','playwright.production.config.ts']);
