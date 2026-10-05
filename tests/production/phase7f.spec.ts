import { test } from '@playwright/test';
import { gameplayPolish } from '../gameplay-browser-helper';
test('7F 公開origin WSSでも2秒遅延の次frame入力・最新draft確定・rollback・BGM設定を維持', async ({ browser, baseURL }) => {
  test.setTimeout(90000); await gameplayPolish(browser, baseURL!, 'docs/screenshots/phase7f/production');
});
