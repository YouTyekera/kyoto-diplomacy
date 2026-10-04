import {test} from '@playwright/test';
import {hostRecovery} from '../session-browser-helper';
test('本番HTTPS/WSSの開始直前Host復帰・本人状態を待つ・3人でStart成功',async({browser,baseURL})=>{test.setTimeout(90000);await hostRecovery(browser,baseURL!,'docs/screenshots/phase7c-production');});
