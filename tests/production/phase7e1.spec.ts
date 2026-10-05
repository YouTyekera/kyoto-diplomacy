import {test} from '@playwright/test';
import {identityHandshake} from '../handshake-browser-helper';
test('7E.1 HTTPS/WSSでjoin直後に保存・reload同一ID・招待URLの復帰選択',async({browser,baseURL})=>{test.setTimeout(60000);await identityHandshake(browser,baseURL!,'docs/screenshots/phase7e1-production');});
