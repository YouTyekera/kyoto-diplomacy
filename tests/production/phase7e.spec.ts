import {test} from '@playwright/test';
import {identityRecovery} from '../identity-browser-helper';
test('7E HTTPS/WSSで永続identity/20秒Host復帰/全員presence一致/接続中kick',async({browser,baseURL})=>{test.setTimeout(110000);await identityRecovery(browser,baseURL!,'docs/screenshots/phase7e-production');});
