import {defineConfig} from '@playwright/test';
import {resolve} from 'node:path';
process.env.PLAYWRIGHT_BROWSERS_PATH??=resolve('.playwright-browsers');
// Exercise the Render override through the actual start:server entry, not just a pure config test.
const env={RENDER:'true',NODE_ENV:'development',PORT:'3036',ONLINE_PORT:'3999',ONLINE_HOST:'127.0.0.1',HOST:'localhost',FRONTEND_ORIGIN:'https://kyoto-web.test:5443'};
const npm=process.platform==='win32'?'npm.cmd':'npm';
export default defineConfig({
 testDir:'./tests/production',testMatch:'*.spec.ts',timeout:60000,workers:1,outputDir:'test-results/production',
 use:{baseURL:env.FRONTEND_ORIGIN,ignoreHTTPSErrors:true,viewport:{width:1920,height:1080},launchOptions:{args:['--host-resolver-rules=MAP kyoto-web.test 127.0.0.1, MAP kyoto-server.test 127.0.0.1','--no-proxy-server']}},
 webServer:[
  {command:`${npm} run start:server`,env,url:'http://127.0.0.1:3036/health',reuseExistingServer:false},
  {command:'node --import tsx tests/production/https-fixture.ts',env,url:'https://127.0.0.1:5443',ignoreHTTPSErrors:true,reuseExistingServer:false},
 ],
});
