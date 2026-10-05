import { test, expect } from '@playwright/test';
import { gameplayPolish, observeMusic } from '../gameplay-browser-helper';

test('7F 3クライアント・次frameの右クリックMove/SE・2秒遅延連続入力・最新draft確定・拒否rollback・BGM/勝利条件', async ({ browser, baseURL }) => {
  test.setTimeout(90000); await gameplayPolish(browser, baseURL!, 'docs/screenshots/phase7f');
});
test('7F autoplay blockedでもBGM ON設定をOFFへ変更せずreload後も保持', async ({ page }) => {
  await observeMusic(page);
  // Give the otherwise silent title slot a test URL entirely in the HTTP response, never in public/audio.
  await page.route('**/audio/bgm-manifest.ts', async route => {
    const response = await route.fetch(); const body = (await response.text()).replace(/id:\s*"title-main",\s*src:\s*""/, 'id:"title-main",src:"/tests/fixtures/bgm/blocked-title.mp3"');
    await route.fulfill({ response, body });
  });
  await page.goto('/'); await page.evaluate(() => { window.gameplayAudio.blocked = true; });
  await page.getByRole('button', { name: '設定', exact: true }).click();
  await expect(page.getByLabel('BGM ON/OFF')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('BGM ON/OFF')).toContainText('再生待ち');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('kyoto-music-v1')!))).toEqual({ enabled: true, volume: 43 });
  await page.reload(); await page.evaluate(() => { window.gameplayAudio.blocked = true; }); await page.getByRole('button', { name: '設定', exact: true }).click();
  await expect(page.getByLabel('BGM ON/OFF')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('BGM ON/OFF')).toContainText('再生待ち');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('kyoto-music-v1')!))).toEqual({ enabled: true, volume: 43 });
});
