import { startPlayback } from './playback-browser-helper';
import { expect, type Browser, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import type { PublicRoomView, PrivatePlayerView } from '../packages/shared/online';
import { instrument } from './session-browser-helper';
interface MusicObservation { blocked: boolean; plays: string[] }
declare global { interface Window { gameplayAudio: MusicObservation; orderFirstFrame?: { arrows: number; ms: number; cues: number } } }

/** In-memory browser audio port, never writes or replaces a user's audio asset. */
export async function observeMusic(page: Page) {
  await page.addInitScript(() => {
    if (!localStorage.getItem('kyoto-music-v1')) localStorage.setItem('kyoto-music-v1', JSON.stringify({ enabled: true, volume: 43 }));
    window.gameplayAudio = { blocked: false, plays: [] };
    const Native = window.Audio;
    window.Audio = class extends Native {
      private path: string;
      constructor(src?: string) { super(); this.path = src ?? ''; }
      play() {
        window.gameplayAudio.plays.push(this.path);
        return window.gameplayAudio.blocked && this.path.includes('/bgm/') ? Promise.reject(new DOMException('Autoplay blocked', 'NotAllowedError')) : Promise.resolve();
      }
      pause() { /* A controllable audio port, without fixture files in public/audio. */ }
    };
  });
}
async function point(page: Page, region: string) {
  return page.locator(`[data-region-id="${region}"]`).evaluate(el => {
    const [x, y] = el.getAttribute('data-display-center')!.split(',').map(Number);
    const p = new DOMPoint(x, y).matrixTransform((el as SVGGraphicsElement).getScreenCTM()!); return { x: p.x, y: p.y };
  });
}
export async function gameplayPolish(browser: Browser, baseURL: string, folder: string) {
  const wards = ['26102', '26104', '26111'];
  const contexts = await Promise.all(wards.map(() => browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1920, height: 1080 } })));
  const pages = await Promise.all(contexts.map(c => c.newPage())), page = pages[0];
  const states: { room?: PublicRoomView; self?: PrivatePlayerView }[] = pages.map(() => ({}));
  const errors: string[] = [];
  try {
    for (let i = 0; i < 3; i++) {
      const p = pages[i], state = states[i]; await instrument(p); await observeMusic(p);
      p.on('pageerror', e => errors.push(e.message));
      p.on('websocket', socket => socket.on('framereceived', f => {
        const packet = String(f.payload); if (!packet.startsWith('42[')) return;
        const [event, value] = JSON.parse(packet.slice(2));
        if (event === 'publicState') state.room = { ...value, map: value.map ?? state.room?.map };
        if (event === 'privateState') state.self = value;
      }));
      await p.goto(baseURL); await p.getByRole('button', { name: 'オンライン対戦', exact: true }).click();
      await p.getByLabel('オンラインニックネーム').fill(`即時入力${i}`); await p.getByLabel('オンライン希望区').selectOption(wards[i]);
      await expect(p.getByText('サーバー接続中', { exact: true })).toBeVisible();
      if (!i) await p.getByRole('button', { name: 'ルームを作成', exact: true }).click();
      else { await p.getByLabel('参加ルームコード').fill(await page.getByTestId('room-code').innerText()); await p.getByRole('button', { name: 'ルームへ参加', exact: true }).click(); }
      await expect(p.getByTestId('room-code')).toBeVisible();
    }
    await page.getByLabel('オンライン規定年数').fill('3');
    await page.getByRole('button', { name: 'オンラインゲーム開始', exact: true }).click();
    for (const p of pages) await expect(p.getByTestId('online-phase')).toContainText('春');
    await expect.poll(() => states[0].self?.phaseKey).toBe(states[0].room!.game!.phaseKey);
    const state = states[0], game = state.room!.game!, own = game.board.units.filter(u => u.ownerWardId === wards[0]);
    const support = own.flatMap(u => state.self!.legalOrders[u.unitId]).find(o => o.type === 'support-move' && own.some(u => u.unitId === o.targetUnitId));
    if (support?.type !== 'support-move') throw Error('Standard map needs an own-army support choice');
    const target = own.find(u => u.unitId === support.targetUnitId)!, helper = own.find(u => u.unitId === support.unitId)!;
    const second = own.find(u => u.unitId !== target.unitId && u.unitId !== helper.unitId && state.self!.legalOrders[u.unitId].some(o => o.type === 'move'))!;
    const secondMove = state.self!.legalOrders[second.unitId].find(o => o.type === 'move')!;
    if (secondMove.type !== 'move') throw Error('Second move fixture');
    const originalPositions = own.map(u => [u.unitId, u.regionId]);
    await page.getByLabel('オンライン行政区').selectOption(wards[0]); await page.getByRole('button', { name: '選択地域を拡大', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.recoveryTest.upgraded?.readyState)).toBe(1);
    await page.evaluate(() => { window.recoveryTest.orderDelayMs = 2000; window.recoveryTest.orderRequests = []; });
    await page.locator(`[data-marker-region="${target.regionId}"] .unit-pin`).click();
    await page.evaluate(() => document.querySelector('svg.map')!.addEventListener('contextmenu', () => {
      const start = performance.now(); requestAnimationFrame(() => { window.orderFirstFrame = { arrows: document.querySelectorAll('.move-line').length, ms: performance.now() - start, cues: window.gameplayAudio.plays.filter(p => p.includes('order-confirm')).length }; });
    }, { capture: true, once: true }));
    const destination = await point(page, support.destination); await page.mouse.click(destination.x, destination.y, { button: 'right' });
    await expect.poll(() => page.evaluate(() => window.orderFirstFrame?.arrows), { intervals: [10] }).toBe(1);
    const firstFrame = await page.evaluate(() => window.orderFirstFrame!); expect(firstFrame.cues).toBe(1);
    expect(state.self!.orders).toEqual([]); await expect(page.locator('.submission-bar')).toContainText('入力済み 1');
    await expect(page.locator('.command-summary')).toContainText('移動');
    await page.locator(`[data-marker-region="${second.regionId}"] .unit-pin`).click(); await page.getByRole('button', { name: '移動', exact: true }).click();
    const next = await point(page, secondMove.destination); await page.mouse.click(next.x, next.y);
    await expect(page.locator('.move-line')).toHaveCount(2); await expect(page.locator('.submission-bar')).toContainText('入力済み 2');
    // The second/third armies remain interactive while the first server request is still delayed.
    expect(state.self!.orders).toEqual([]);
    await page.locator(`[data-marker-region="${helper.regionId}"] .unit-pin`).click(); await page.getByRole('button', { name: '支援', exact: true }).click();
    await page.locator(`[data-marker-region="${target.regionId}"] .unit-pin`).click(); await page.getByRole('button', { name: /現在の移動命令:/ }).click();
    await expect(page.locator('.support-line')).toHaveCount(1); await expect(page.locator('.submission-bar')).toContainText('入力済み 3');
    await page.getByRole('button', { name: '参加者・装備', exact: true }).click(); await page.getByText(`自分の命令一覧 · 3 / ${own.length}軍`, { exact: true }).click();
    await expect(page.getByLabel('自分の命令一覧')).toContainText('への移動を支援');
    await page.getByRole('button', { name: '命令書を確定', exact: true }).click();
    await expect(page.locator('.submission-bar')).toContainText('命令書を保存して確定しています…');
    await expect(page.getByRole('button', { name: '待機', exact: true })).toBeDisabled();
    await expect.poll(() => state.self?.finalized, { timeout: 16000 }).toBe(true);
    const sent = await page.evaluate(() => window.recoveryTest.orderRequests!);
    expect(sent.map(r => r.orders.length)).toEqual([1, 2, 3, 3]); expect(sent.map(r => r.finalize)).toEqual([false, false, false, true]);
    expect(state.self!.orders).toEqual(expect.arrayContaining(sent[3].orders)); expect(sent[3].orders).toContainEqual(support);
    expect(state.self!.orders.filter(o => !sent[3].orders.some(draft => draft.unitId === o.unitId)).every(o => o.type === 'hold')).toBe(true);
    expect(state.room!.game!.board.units.filter(u => u.ownerWardId === wards[0]).map(u => [u.unitId, u.regionId])).toEqual(originalPositions);
    for (const s of states.slice(1)) expect(s.self!.orders).toEqual([]); // Optimistic drafts remain private.
    await page.screenshot({ path: `${folder}/optimistic-move-support-1920.png` });

    // A real server refusal restores the accepted sheet, removes the invalid extra arrow, and shows the error.
    await page.getByRole('button', { name: '確定解除', exact: true }).click();
    await page.locator(`[data-marker-region="${second.regionId}"] .unit-pin`).click(); await page.getByRole('button', { name: '待機', exact: true }).click();
    await expect.poll(() => state.self?.orders.find(o => o.unitId === second.unitId)?.type, { timeout: 7000 }).toBe('hold');
    await page.evaluate(() => { window.recoveryTest.rejectNextOrder = true; });
    await page.getByRole('button', { name: '移動', exact: true }).click(); await page.mouse.click(next.x, next.y);
    await expect(page.locator('.move-line')).toHaveCount(2);
    await expect(page.getByRole('alert')).toBeVisible(); await expect(page.locator('.move-line')).toHaveCount(1);
    await expect(page.getByLabel('自分の命令一覧')).toContainText('待機'); expect(state.self!.orders.find(o => o.unitId === second.unitId)?.type).toBe('hold');
    await page.screenshot({ path: `${folder}/refused-rollback-1920.png` });
    await page.locator(`[data-marker-region="${second.regionId}"] .unit-pin`).click(); await page.getByRole('button', { name: '待機', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);

    await page.getByRole('button', { name: '勝利条件', exact: true }).click(); const panel = page.getByLabel('この対局の勝利条件');
    await expect(panel).toContainText(`補給拠点${game.victoryTargetSC}か所＋敵の初期補給拠点${game.requiredRivalInitialSupplyCentersForInstantWin}か所`);
    await expect(panel).toContainText('3年目終了時'); await expect(panel.locator('details')).not.toHaveAttribute('open');
    await expect(panel.getByText(/同じ相手の初期補給拠点/)).toBeHidden();
    await panel.getByText('詳細ルール', { exact: true }).click(); await expect(panel.getByText(/同じ相手の初期補給拠点/)).toBeVisible();
    await panel.getByText('詳細ルール', { exact: true }).click(); await page.setViewportSize({ width: 1280, height: 720 });
    await page.screenshot({ path: `${folder}/victory-concise-1280.png` }); await page.getByRole('button', { name: '勝利条件を閉じる', exact: true }).click();

    const music = { enabled: true, volume: 43 };
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('kyoto-music-v1')!))).toEqual(music);
    await page.locator('.audio-settings > summary').click(); await expect(page.getByLabel('BGM ON/OFF')).toHaveAttribute('aria-pressed', 'true');
    await page.reload(); await expect(page.getByTestId('online-phase')).toContainText('春');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('kyoto-music-v1')!))).toEqual(music);
    await page.getByRole('button', { name: '命令書を確定', exact: true }).click();
    for (const p of pages.slice(1)) await p.getByRole('button', { name: '命令書を確定', exact: true }).click();
    await startPlayback(pages);
    await expect(page.locator('html')).toHaveAttribute('data-bgm-context', 'adjudication');
    await page.getByRole('button', { name: '演出をスキップ', exact: true }).click(); await expect(page.locator('html')).toHaveAttribute('data-bgm-context', 'domestic');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('kyoto-music-v1')!))).toEqual(music);
    const plays = await page.evaluate(() => window.gameplayAudio.plays);
    expect(plays).toContain('/audio/bgm/domestic.mp3'); expect(plays).toContain('/audio/bgm/adjudication.mp3');
    expect(errors).toEqual([]);
    await mkdir(folder, { recursive: true }); await writeFile(`${folder}/optimistic-proof.json`, JSON.stringify({ delayMs: 2000, firstFrame, orderLengths: sent.map(r => r.orders.length), finalizationSentLatestDraft: true, armyPositionsUnchangedBeforeAdjudication: true, rollback: true, bgmSettings: music }, null, 2) + '\n');
  } finally { await Promise.all(contexts.map(c => c.close())); }
}
