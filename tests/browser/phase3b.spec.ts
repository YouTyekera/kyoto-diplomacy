import { test, expect, type Page } from '@playwright/test';
import { sampleConfig } from '../../packages/map-core/sample';

async function sameFill(page: Page) {
  await page.getByRole('button', { name: '全体に戻す', exact: true }).hover();
  const styles = await page.locator('[data-region-id="sample-a"], [data-region-id="sample-b"]').evaluateAll(elements =>
    elements.map(element => {
      const style = getComputedStyle(element);
      return { fill: style.fill, opacity: style.opacity, fillOpacity: style.fillOpacity, filter: style.filter };
    }));
  expect(styles).toHaveLength(2);
  expect(styles[0]).toEqual(styles[1]);
  await expect(page.locator('[data-supply-region="sample-a"] .supply-circle')).toBeVisible();
  await expect(page.locator('[data-supply-region="sample-b"] .supply-circle')).toHaveCount(0);
}

test('隣接SC/非SCの同一fill・所有者ring・全ローカルモード・hover/選択', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/regions.json', route => route.fulfill({ status: 404, body: '' }));
  await page.goto('/?tool=editor');
  const config = structuredClone(sampleConfig);
  config.regions['sample-a'].isSupplyCenter = true;
  config.regions['sample-a'].homeWardId = '26102';
  await page.getByLabel('設定JSONを読込').setInputFiles({ name: 'phase3b-display-only.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(config)) });
  await expect(page.locator('.calculating')).toHaveCount(0);
  await page.getByRole('button', { name: 'ゲームプレビュー', exact: true }).click();
  // Select a different region so both compared regions have no temporary selection/neighbor styles.
  await page.getByLabel('地域を検索').fill('架空地域D');
  await page.locator('.region-list button').first().click();
  await sameFill(page);
  await expect(page.locator('[data-supply-region="sample-a"] .supply-marker')).toHaveAttribute('data-supply-owner', '26102');
  await expect(page.locator('[data-supply-region="sample-a"] .supply-marker circle').nth(1)).toHaveAttribute('stroke', '#bb8468');
  await page.screenshot({ path: 'test-results/phase3b-unified-fill.png', fullPage: true });
  // Equal controller also means equal opacity across original wards under a ward filter.
  await page.getByLabel('地域を検索').fill('架空地域C');
  await page.locator('.region-list button').first().click();
  await page.getByLabel('現在の支配勢力', { exact: true }).selectOption('26101');
  await page.getByLabel('地域を検索').fill('架空地域D');
  await page.locator('.region-list button').first().click();
  await page.getByLabel('行政区フィルター').selectOption('26101');
  await sameFill(page);
  const crossWard = await page.locator('[data-region-id="sample-a"], [data-region-id="sample-c"]').evaluateAll(elements =>
    elements.map(e => ({ fill: getComputedStyle(e).fill, opacity: getComputedStyle(e).opacity })));
  expect(crossWard[0]).toEqual(crossWard[1]);
  for (const mode of ['ルールサンドボックス', '年間進行（ローカル）']) {
    await page.getByRole('button', { name: mode, exact: true }).click();
    await sameFill(page);
  }
  const sc = page.locator('[data-supply-region="sample-a"] .supply-circle');
  await sc.hover();
  await expect(page.getByRole('tooltip')).toContainText('架空地域A');
  const region = page.locator('[data-region-id="sample-a"]');
  await expect(region).toHaveClass(/hovered/);
  expect(await region.evaluate(e => getComputedStyle(e).filter)).toBe('brightness(1.04)');
  await sc.click();
  await expect(region).toHaveClass(/selected/);
  expect(await region.evaluate(e => getComputedStyle(e).strokeWidth)).toBe('1.8px');
  expect(errors).toEqual([]);
});
