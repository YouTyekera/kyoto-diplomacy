import {test} from '@playwright/test';
import {gameplayPresentation} from '../phase7g-browser-helper';
test('7G 全命令公開・host開始・平和/衝突・skip一致・履歴read-only/draft保持/再接続・京都地理レイヤー',async({browser,baseURL})=>{
  test.setTimeout(90000);await gameplayPresentation(browser,baseURL!,'docs/screenshots/phase7g');
});
