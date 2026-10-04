import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { configSchema, datasetSchema, createConfig, type MapConfig, type WardId } from '../../packages/shared/model';
import { compileMap } from '../../packages/map-core/compile';
import { sampleConfig } from '../../packages/map-core/sample';
import { completeKyotoTestScenario } from '../scenario-fixture';

async function entry(page: Page, nickname: string, ward: string, url = '/') {
  await page.goto(url);
  if (!url.includes('room=')) await page.getByRole('button', { name: 'オンライン対戦', exact: true }).click();
  await page.getByLabel('オンラインニックネーム').fill(nickname);
  await page.getByLabel('オンライン希望区').selectOption(ward);
  await expect(page.getByText('サーバー接続中', { exact: true })).toBeVisible();
}
async function closePresentation(pages:Page[]){for(const page of pages){if(!await page.locator('.left-hud').count())await page.getByRole('button',{name:'イベント・結果',exact:true}).click();await expect(page.getByLabel('裁定演出')).toBeVisible();if(await page.getByRole('button',{name:'スキップ',exact:true}).isVisible())await page.getByRole('button',{name:'スキップ',exact:true}).click();await page.getByRole('button',{name:'結果を閉じる',exact:true}).click();const submit=page.getByRole('button',{name:'命令書を確定',exact:true});if(await submit.count())await expect(submit).toBeEnabled();}}
async function finalize(pages: Page[]) { for (const page of pages) await page.getByRole('button', { name: '命令書を確定', exact: true }).click();await closePresentation(pages); }
async function audioManifest(page: Page) {
  // Test-only source override: production slots remain empty; no dummy music is added.
  await page.route('**/assets/index-*.js', async route => {
    const response = await route.fetch(); let body = await response.text();
    for (const slot of ['title', 'lobby', 'game', 'result']) {
      const source = `id:"${slot}-main",src:""`; expect(body).toContain(source);
      body = body.replace(source, `id:"${slot}-main",src:"/audio/bgm/test-${slot}.mp3"`);
    }
    await route.fulfill({ response, body });
  });
}

test('トップ・設定保存・開発ツールの分離・ローカルの地図入力', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await expect(page.getByRole('heading', { name: '京都市版 Diplomacy', exact: true })).toBeVisible();
  await expect(page.getByTestId('connection-scope')).toContainText('LOCAL');
  await expect(page.getByLabel('設定JSONを読込')).toHaveCount(0);
  await page.getByRole('button', { name: '設定', exact: true }).click();
  await page.getByLabel('BGM ON/OFF').click(); await page.getByLabel('BGM音量').focus(); await page.getByLabel('BGM音量').press('Home'); await page.getByLabel('BGM音量').press('ArrowRight');
  await page.reload(); await page.getByRole('button', { name: '設定', exact: true }).click();
  await expect(page.getByLabel('BGM ON/OFF')).toHaveAttribute('aria-pressed', 'false'); await expect(page.getByLabel('BGM音量')).toHaveValue('1');
  await page.getByRole('button', { name: 'トップへ戻る', exact: true }).click();
  await page.getByRole('button', { name: '地図エディタ', exact: true }).click(); await expect(page.getByLabel('設定JSONを読込')).toBeAttached();
  await page.getByRole('button', { name: '架空サンプルで確認', exact: true }).click();
  const config = structuredClone(sampleConfig); config.regions['sample-a'] = { enabled: true, isSupplyCenter: true, homeWardId: '26101', startingUnit: { ownerWardId: '26101', type: 'army' } };
  await page.getByLabel('設定JSONを読込').setInputFiles({ name: 'local-ui-test.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(config)) }); await expect(page.locator('.calculating')).toHaveCount(0);
  await page.getByRole('button', { name: 'トップへ戻る', exact: true }).click(); await page.getByRole('button', { name: 'ローカルで試す', exact: true }).click();
  await expect(page.getByLabel('年間命令種別')).toHaveCount(0);
  await page.getByRole('button', { name: '現在のPreviewから開始', exact: true }).click();
  await expect(page.getByLabel('選択軍の操作')).toHaveCount(0);
  await page.locator('[data-marker-region="sample-a"] .unit-pin').click(); await expect(page.getByLabel('選択軍の操作')).toBeVisible();
  await page.getByRole('button', { name: '移動', exact: true }).click(); await expect(page.locator('[data-region-id="sample-b"]')).toHaveClass(/legal-target/);
  await page.locator('[data-region-id="sample-b"]').press('Enter'); await expect(page.locator('.move-line')).toHaveCount(1);
  await page.getByRole('button', { name: 'トップへ戻る', exact: true }).click(); await page.getByRole('button', { name: 'ローカルで試す', exact: true }).click(); await expect(page.locator('.move-line')).toHaveCount(1);
  await page.getByRole('button', { name: '移動を裁定', exact: true }).click(); await expect(page.getByTestId('game-phase')).toContainText('撤退');
  expect(errors).toEqual([]);
});

test('3人の招待・初期表示・シナリオ・地図命令・ready・1920/1280 HUD・音楽継続', async ({ browser }) => {
  test.setTimeout(120000);
  const config = configSchema.parse(JSON.parse(await readFile('tests/fixtures/phase4b-kyoto-map-config.json', 'utf8')));
  const dataset = datasetSchema.parse(JSON.parse(await readFile('data/generated/regions.json', 'utf8')));
  const wards = ['26101', '26102', '26103'];
  const starts = wards.map(ward => dataset.regions.find(r => config.regions[r.regionId].startingUnit?.ownerWardId === ward)!);
  const destination = dataset.regions.find(r => r.wardId === wards[0] && config.regions[r.regionId].enabled && !config.regions[r.regionId].isSupplyCenter)!;
  const helper = dataset.regions.find(r => r.wardId === wards[0] && config.regions[r.regionId].isSupplyCenter && !config.regions[r.regionId].startingUnit)!;
  config.regions[helper.regionId].startingUnit = { ownerWardId: '26101', type: 'army' };
  config.adjacencyAdd.push([starts[0].regionId, destination.regionId], [helper.regionId, destination.regionId], [helper.regionId, starts[1].regionId]);
  const map = compileMap(dataset, config).map;
  const contexts = await Promise.all(wards.map(() => browser.newContext({ viewport: { width: 1920, height: 1080 }, permissions: ['clipboard-read', 'clipboard-write'] })));
  const pages = await Promise.all(contexts.map(c => c.newPage())); const errors: string[] = [];
  for (const page of pages) page.on('pageerror', e => errors.push(e.message));
  try {
    await audioManifest(pages[0]);
    await pages[0].addInitScript(() => {
      const observed: { src: string; plays: number; pauses: number }[] = [];
      (window as unknown as { musicObserved: typeof observed }).musicObserved = observed;
      const NativeAudio = window.Audio;
      window.Audio = class extends NativeAudio {
        private record: typeof observed[number];
        constructor(src?: string) { super(); this.record = { src: src ?? '', plays: 0, pauses: 0 }; observed.push(this.record); }
        play() { this.record.plays++; return Promise.resolve(); }
        pause() { this.record.pauses++; }
      };
    });
    await entry(pages[0], 'Host', wards[0]); await pages[0].getByRole('button', { name: 'ルームを作成', exact: true }).click();
    const code = await pages[0].getByTestId('room-code').innerText(); const codeBox = await pages[0].getByTestId('room-code').boundingBox(); expect(codeBox!.y + codeBox!.height).toBeLessThan(1080);
    await pages[0].getByRole('button', { name: 'コードをコピー', exact: true }).click(); expect(await pages[0].evaluate(() => navigator.clipboard.readText())).toBe(code);
    await pages[0].getByRole('button', { name: '招待リンクをコピー', exact: true }).click(); const invite = await pages[0].evaluate(() => navigator.clipboard.readText()); expect(invite).toContain(`/?room=${code}`);
    await expect(pages[0].getByRole('status').filter({ hasText: '同じPCからのみ' })).toBeVisible();
    await pages[0].getByLabel('京都シナリオJSONを読み込む').setInputFiles({ name: 'player-ui-test-only.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(config)) });
    await expect(pages[0].getByTestId('scenario-summary')).toContainText('player-ui-test-only.json');
    await pages[0].setViewportSize({ width: 1280, height: 720 }); const compactCode = await pages[0].getByTestId('room-code').boundingBox(); expect(compactCode!.y + compactCode!.height).toBeLessThan(720); await pages[0].setViewportSize({ width: 1920, height: 1080 });
    for (let i = 1; i < 3; i++) { await pages[i].goto(invite); await expect(pages[i].getByLabel('参加ルームコード')).toHaveValue(code); await expect(pages[i].getByLabel('オンラインニックネーム')).toBeFocused(); await pages[i].getByLabel('オンラインニックネーム').fill(`Guest${i}`); await pages[i].getByLabel('オンライン希望区').selectOption(wards[i]); await pages[i].getByRole('button', { name: 'ルームへ参加', exact: true }).click(); await expect(pages[i].getByTestId('scenario-summary')).toContainText('player-ui-test-only.json'); }
    await pages[0].getByLabel('オンライン規定年数').fill('4'); await expect(pages[1].getByLabel('ルーム情報')).toContainText('規定年数: 4年'); await pages[0].getByLabel('オンライン規定年数').fill('5'); await expect(pages[2].getByLabel('ルーム情報')).toContainText('規定年数: 5年');
    await pages[0].getByRole('button', { name: 'オンラインゲーム開始', exact: true }).click();
    for (const page of pages) { await expect(page.getByTestId('online-phase')).toContainText('春'); await expect(page.getByLabel('オンライン命令種別')).toHaveCount(0); await expect(page.getByLabel('選択軍の操作')).toHaveCount(0); await page.getByRole('button',{name:'イベント・結果',exact:true}).click(); await page.getByRole('button',{name:'参加者・装備',exact:true}).click(); }
    await pages[0].getByLabel('オンライン行政区').selectOption('26101'); await pages[0].getByRole('button', { name: /選択(?:区|地域)を拡大/ }).click();
    const marker = pages[0].locator(`[data-marker-region="${starts[0].regionId}"] .unit-pin`); await marker.hover(); await expect(pages[0].getByRole('tooltip')).toContainText(starts[0].name); await marker.click();
    await expect(pages[0].getByLabel('選択軍の操作')).toBeVisible(); const path = pages[0].locator(`[data-region-id="${starts[0].regionId}"]`); expect(await path.evaluate(e => getComputedStyle(e).strokeWidth)).toBe('2px');
    await pages[0].getByRole('button', { name: '移動', exact: true }).click();
    const legal = await pages[0].locator('.legal-target').evaluateAll(elements => elements.map(e => e.getAttribute('data-region-id'))); expect(legal.sort()).toEqual([...map.adjacency[starts[0].regionId]].sort());
    await pages[0].locator(`[data-region-id="${destination.regionId}"]`).press('Enter'); await expect(pages[0].locator('.move-line')).toHaveCount(1); await expect(pages[1].locator('.move-line')).toHaveCount(0);
    await pages[0].locator(`[data-marker-region="${helper.regionId}"]`).press('Enter'); await pages[0].getByRole('button', { name: '支援', exact: true }).click();
    await expect(pages[0].locator(`[data-region-id="${starts[1].regionId}"]`)).toHaveClass(/legal-target/); await pages[0].locator(`[data-marker-region="${starts[1].regionId}"]`).press('Enter'); await pages[0].getByRole('button',{name:'この軍の現在地を守る',exact:true}).click();await expect(pages[0].getByLabel('選択軍の操作')).toContainText('現在地で支援');
    await pages[0].getByRole('button', { name: '支援', exact: true }).click();
    await pages[0].locator(`[data-marker-region="${starts[0].regionId}"]`).press('Enter');await pages[0].getByRole('button',{name:'この軍の移動を支援する',exact:true}).click(); await expect(pages[0].locator(`[data-region-id="${destination.regionId}"]`)).toHaveClass(/legal-target/); await pages[0].locator(`[data-region-id="${destination.regionId}"]`).press('Enter'); await expect(pages[0].locator('.support-line')).toHaveCount(1);
    for (const viewport of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }]) {
      await pages[0].setViewportSize(viewport); const mapBox = await pages[0].locator('svg.map').boundingBox(), submit = await pages[0].getByRole('button', { name: '命令書を確定', exact: true }).boundingBox();
      expect(mapBox!.width).toBeGreaterThan(viewport.width * 0.5); expect(mapBox!.height).toBeGreaterThan(190); expect(submit!.y + submit!.height).toBeLessThanOrEqual(viewport.height);
      expect(await pages[0].evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      await pages[0].screenshot({ path: `test-results/phase5a-hud-${viewport.width}.png`, fullPage: true });
    }
    const text = await pages[0].locator('.game-layout').innerText(); for (const word of ['kyoto-261', 'initial-kyoto', 'support-move', 'reasonCode', 'controllerWardId']) expect(text).not.toContain(word);
    await pages[0].getByRole('button', { name: '命令書を確定', exact: true }).click(); await expect(pages[1].getByLabel('提出状況')).toContainText('確定済み'); await pages[0].getByRole('button', { name: '確定解除', exact: true }).click(); await expect(pages[1].getByLabel('提出状況')).toContainText('入力中');
    await finalize(pages); for (const page of pages) await expect(page.getByTestId('online-phase')).toContainText('秋');
    const music = await pages[0].evaluate(() => (window as unknown as { musicObserved: { src: string; plays: number }[] }).musicObserved.filter(a => a.src.includes('domestic'))); expect(music).toHaveLength(1); expect(music[0].plays).toBe(1);
    await finalize(pages); await expect(pages[0].getByTestId('online-phase')).toContainText('冬'); await expect(pages[0].locator('html')).toHaveAttribute('data-bgm-context', 'domestic');
    await pages[0].getByRole('button', { name: '冬調整を確定', exact: true }).click(); await expect(pages[0].getByTestId('online-phase')).toContainText('第2年 · 春');
    const afterWinter = await pages[0].evaluate(() => (window as unknown as { musicObserved: { src: string; plays: number }[] }).musicObserved.filter(a => a.src.includes('domestic'))); expect(afterWinter).toHaveLength(1); expect(afterWinter[0].plays).toBeGreaterThanOrEqual(1);
    await pages[0].getByRole('button', { name: 'イベント・結果', exact: true }).click(); await expect(pages[0].locator('.left-hud')).toHaveCount(0); await pages[0].getByRole('button', { name: '参加者・装備', exact: true }).click(); await expect(pages[0].locator('.right-hud')).toHaveCount(0);
    await pages[0].setViewportSize({ width: 390, height: 844 }); expect(await pages[0].evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390); await expect(pages[0].getByRole('button', { name: '命令書を確定', exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  } finally { await Promise.all(contexts.map(c => c.close().catch(() => {}))); }
});

test('実音声URLの404でも無音で継続し、音楽ボタンから再試行', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message)); await audioManifest(page);
  await page.route('**/audio/bgm/test-*.mp3', route => route.fulfill({ status: 404, body: '' }));
  await page.goto('/'); await page.getByRole('button', { name: '設定', exact: true }).click(); await expect(page.getByLabel('BGM ON/OFF')).toHaveAttribute('aria-pressed', 'false');
  await page.getByLabel('BGM ON/OFF').click(); await expect(page.getByRole('heading', { name: '設定', exact: true })).toBeVisible(); await expect(page.getByRole('alert')).toHaveCount(0); expect(errors).toEqual([]);
});

test('Game OverでresultのBGM contextへ切替・再接続でも結果を保持', async ({ browser }) => {
  test.setTimeout(120000);
  const config = configSchema.parse(JSON.parse(await readFile('tests/fixtures/phase4b-kyoto-map-config.json', 'utf8')));
  for (const [id, s] of Object.entries(config.regions)) if (['26101', '26102', '26103'].some(w => id.startsWith(`kyoto-${w}-`)) && !s.isSupplyCenter) s.enabled = false;
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]); const pages = await Promise.all(contexts.map(c => c.newPage()));
  try {
    for (let i = 0; i < 3; i++) await entry(pages[i], `Result${i}`, ['26101', '26102', '26103'][i]);
    await pages[0].getByRole('button', { name: 'ルームを作成', exact: true }).click(); const code = await pages[0].getByTestId('room-code').innerText();
    await pages[0].getByLabel('京都シナリオJSONを読み込む').setInputFiles({ name: 'result-ui-test.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(config)) });
    for (const page of pages.slice(1)) { await page.getByLabel('参加ルームコード').fill(code); await page.getByRole('button', { name: 'ルームへ参加', exact: true }).click(); }
    await pages[1].evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })); await pages[1].getByRole('button', { name: 'コードをコピー', exact: true }).click(); await expect(pages[1].getByText('コピーしました', { exact: true })).toBeVisible();
    await pages[0].getByRole('button', { name: 'オンラインゲーム開始', exact: true }).click(); await expect(pages[0].locator('html')).toHaveAttribute('data-bgm-context', 'domestic');
    for (const page of pages) await page.getByRole('button', { name: 'イベント・結果', exact: true }).click();
    await finalize(pages); await finalize(pages);
    for (const page of pages) { await expect(page.getByRole('heading', { name: '共同勝利', exact: true })).toBeVisible(); await expect(page.locator('html')).toHaveAttribute('data-bgm-context', 'result'); }
    await pages[1].reload(); await expect(pages[1].locator('html')).toHaveAttribute('data-bgm-context', 'result'); await expect(pages[1].getByRole('table', { name: '最終順位' })).toBeVisible();
  } finally { await Promise.all(contexts.map(c => c.close().catch(() => {}))); }
});

test('プレイヤーの地図操作で自転車2区間・バリケード設置・秘密予約・再接続', async ({ browser }) => {
  test.setTimeout(120000);
  const dataset = datasetSchema.parse(JSON.parse(await readFile('data/generated/regions.json', 'utf8'))), config: MapConfig = createConfig(dataset);
  const wards: WardId[] = ['26101', '26102', '26103'];
  const groups = wards.map(w => dataset.regions.filter(r => r.wardId === w).slice(0, 4)), scs = groups.map(g => g[0].regionId), nonSC = groups.flatMap(g => g.slice(1).map(r => r.regionId));
  for (const [i, group] of groups.entries()) for (const [j, r] of group.entries()) config.regions[r.regionId] = { enabled: true, isSupplyCenter: j === 0, homeWardId: j === 0 ? wards[i] : null, startingUnit: j === 0 ? { ownerWardId: wards[i], type: 'army' } : null };
  config.adjacencyAdd = scs.flatMap(a => nonSC.map(b => [a, b] as [string, string]));
  const desired = new Set(config.adjacencyAdd.map(([a, b]) => [a, b].sort().join('|'))), compiled = compileMap(dataset, config).map;
  config.adjacencyRemove = Object.entries(compiled.adjacency).flatMap(([a, neighbors]) => neighbors.filter(b => a < b && !desired.has([a, b].sort().join('|'))).map(b => [a, b] as [string, string]));
  completeKyotoTestScenario(dataset, config);
  const contexts = await Promise.all(wards.map(() => browser.newContext())), pages = await Promise.all(contexts.map(c => c.newPage()));
  const errors: string[] = [], packets: string[] = []; for (const page of pages) page.on('pageerror', e => errors.push(e.message));
  pages[1].on('websocket', socket => socket.on('framereceived', f => { const payload = String(f.payload); if (payload.startsWith('42["publicState"')) packets.push(payload); }));
  try {
    for (let i = 0; i < 3; i++) await entry(pages[i], `Gear${i}`, wards[i]);
    await pages[0].getByRole('button', { name: 'ルームを作成', exact: true }).click(); const code = await pages[0].getByTestId('room-code').innerText();
    await pages[0].getByLabel('京都シナリオJSONを読み込む').setInputFiles({ name: 'gear-ui-test-only.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(config)) });
    for (const page of pages.slice(1)) { await page.getByLabel('参加ルームコード').fill(code); await page.getByRole('button', { name: 'ルームへ参加', exact: true }).click(); }
    await pages[0].getByRole('button', { name: 'オンラインゲーム開始', exact: true }).click(); await expect(pages[0].getByTestId('online-phase')).toContainText('春');
    for (const page of pages) { await page.getByRole('button', { name: 'イベント・結果', exact: true }).click(); await page.getByRole('button', { name: '参加者・装備', exact: true }).click(); }
    const bicycleRegion = (await pages[0].locator('[data-ground-equipment="bicycle"]').getAttribute('data-ground-region'))!;
    await pages[0].locator(`[data-marker-region="${scs[0]}"]`).press('Enter'); await expect(pages[0].getByRole('button', { name: '自転車', exact: true })).toHaveCount(0);
    await pages[0].getByRole('button', { name: '移動', exact: true }).click(); await pages[0].locator(`[data-region-id="${bicycleRegion}"]`).press('Enter'); await finalize(pages);
    await expect(pages[0].getByTestId('online-phase')).toContainText('秋'); const wallRegion = (await pages[0].locator('[data-ground-equipment="barricade"]').getAttribute('data-ground-region'))!;
    await pages[0].locator(`[data-marker-region="${bicycleRegion}"]`).press('Enter'); await pages[0].getByRole('button', { name: '自転車', exact: true }).click();
    await expect(pages[0].getByLabel('選択軍の操作')).toContainText('経由'); await expect(pages[0].locator(`[data-region-id="${scs[0]}"]`)).toHaveClass(/legal-target/);
    await pages[0].locator(`[data-region-id="${scs[0]}"]`).press('Enter'); await expect(pages[0].getByLabel('選択軍の操作')).toContainText('次の移動先'); await expect(pages[0].locator(`[data-region-id="${wallRegion}"]`)).toHaveClass(/legal-target/);
    await pages[0].locator(`[data-region-id="${wallRegion}"]`).press('Enter'); await expect(pages[0].locator('.bicycle-line')).toHaveCount(1); await expect(pages[1].locator('.bicycle-line')).toHaveCount(0);
    await pages[0].getByLabel('自分の装備と予約').locator('summary').click(); await expect(pages[0].getByLabel('自分の装備と予約')).toContainText('今季予約'); await expect(pages[1].getByLabel('自分の装備と予約')).not.toContainText('今季予約');
    await pages[0].getByRole('button', { name: '命令書を確定', exact: true }).click(); await pages[0].reload(); await expect(pages[0].getByRole('button', { name: '確定解除', exact: true })).toBeVisible(); await expect(pages[0].locator('.bicycle-line')).toHaveCount(1);
    expect(packets.length).toBeGreaterThan(0); expect(packets.every(p => !p.includes('"reservations"') && !p.includes('"bicycle-move"') && !p.includes('"viaRegionId"'))).toBe(true);
    await finalize(pages.slice(1));await closePresentation([pages[0]]); await expect(pages[0].getByTestId('online-phase')).toContainText('第2年 · 春');
    await pages[0].locator(`[data-marker-region="${wallRegion}"]`).press('Enter'); await pages[0].getByRole('button', { name: 'バリケード', exact: true }).click(); await expect(pages[0].locator(`[data-region-id="${scs[0]}"]`)).toHaveClass(/legal-target/);
    await pages[0].locator(`[data-region-id="${scs[0]}"]`).press('Enter'); await finalize(pages); await expect(pages[0].getByTestId('online-phase')).toContainText('秋'); await expect(pages[0].getByLabel('有効バリケード')).toContainText('残り4季');
    await pages[0].locator(`[data-marker-region="${wallRegion}"]`).press('Enter'); await expect(pages[0].getByRole('button', { name: 'バリケード', exact: true })).toHaveCount(0); await pages[0].getByRole('button', { name: '移動', exact: true }).click(); await expect(pages[0].locator(`[data-region-id="${scs[0]}"]`)).not.toHaveClass(/legal-target/);
    expect(errors).toEqual([]);
  } finally { await Promise.all(contexts.map(c => c.close().catch(() => {}))); }
});
