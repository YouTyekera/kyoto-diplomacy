import {test} from '@playwright/test';
import {gameplayPresentation} from '../phase7g-browser-helper';
test('7G HTTPS/WSS本番buildで全命令公開・host演出・履歴復帰',async({browser,baseURL})=>{
  test.setTimeout(90000);await gameplayPresentation(browser,baseURL!,'docs/screenshots/phase7g-production');
});
