import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioManager, readMusicSettings, musicStorageKey, defaultMusicSettings, type AudioPort } from './audio-manager';
import { bgmManifest } from './bgm-manifest';
function fixture(rejectFirstPlay = false) {
  vi.useFakeTimers();
  const audios: (AudioPort & { src: string })[] = [];
  const manifest = structuredClone(bgmManifest);
  for (const context of ['title', 'lobby', 'game', 'result'] as const) manifest[context].src = `/${context}.mp3`;
  const manager = new AudioManager(manifest, { enabled: true, volume: 100 }, src => {
    const audio = { src, volume: 1, loop: false, onerror: null, play: vi.fn().mockResolvedValue(undefined), pause: vi.fn() };
    if (rejectFirstPlay && !audios.length) audio.play.mockRejectedValueOnce(new Error('NotAllowedError'));
    audios.push(audio); return audio;
  });
  return { manager, manifest, audios };
}
afterEach(() => vi.useRealTimers());
describe('BGM manager', () => {
  it('操作前に音声を作らず、操作後は0.9秒で設定音量へフェード', async () => {
    const f = fixture(); expect(f.audios).toHaveLength(0); f.manager.unlock();
    expect(f.audios[0].volume).toBe(0); await vi.advanceTimersByTimeAsync(900);
    expect(f.audios[0].volume).toBeCloseTo(0.45); expect(f.audios[0].loop).toBe(true); f.manager.dispose();
  });
  it('Orders・Retreat・Winterの同一game contextは同じaudio・再生位置を維持', () => {
    const f = fixture(); f.manager.setContext('game'); f.manager.unlock();
    for (let phase = 0; phase < 6; phase++) f.manager.setContext('game');
    expect(f.audios).toHaveLength(1); expect(f.audios[0].play).toHaveBeenCalledTimes(1); expect(f.audios[0].pause).not.toHaveBeenCalled(); f.manager.dispose();
  });
  it('resultへの切替で旧曲を停止し、新曲へcrossfade', async () => {
    const f = fixture(); f.manager.setContext('game'); f.manager.unlock(); await vi.advanceTimersByTimeAsync(1000);
    f.manager.setContext('result'); await vi.advanceTimersByTimeAsync(450);
    expect(f.audios[0].volume).toBeCloseTo(0.225); expect(f.audios[1].volume).toBeCloseTo(0.225);
    await vi.advanceTimersByTimeAsync(600); expect(f.audios[0].pause).toHaveBeenCalled(); expect(f.audios[1].volume).toBeCloseTo(0.45); f.manager.dispose();
  });
  it('mute・音量変更を即反映し、音量変更で音声を再生成しない', async () => {
    const f = fixture(); f.manager.unlock(); await vi.advanceTimersByTimeAsync(1000);
    f.manager.setSettings({ enabled: true, volume: 50 }); expect(f.audios[0].volume).toBeCloseTo(0.225);
    f.manager.setSettings({ enabled: false, volume: 50 }); expect(f.audios[0].volume).toBe(0); expect(f.audios[0].pause).toHaveBeenCalled();
    f.manager.setSettings({ enabled: true, volume: 50 }); expect(f.audios).toHaveLength(1); f.manager.dispose();
  });
  it('未設定slotは無音、空slotへの切替でも旧曲はfadeして停止', async () => {
    const f = fixture(); f.manifest.title.src = ''; f.manager.unlock(); expect(f.audios).toHaveLength(0);
    f.manager.setContext('game'); await vi.advanceTimersByTimeAsync(1000); f.manager.setContext('title');
    await vi.advanceTimersByTimeAsync(1000); expect(f.audios).toHaveLength(1); expect(f.audios[0].pause).toHaveBeenCalled(); f.manager.dispose();
  });
  it('autoplay拒否を捕捉し、音楽ボタンの操作で再試行できる', async () => {
    const f = fixture(true); f.manager.unlock(); await Promise.resolve(); await Promise.resolve(); expect(f.manager.blocked).toBe(true);
    f.manager.unlock(); await Promise.resolve(); expect(f.audios).toHaveLength(2); expect(f.manager.blocked).toBe(false); f.manager.dispose();
  });
  it('音源404/codecエラー・factory失敗を捕捉し、アプリを停止しない', () => {
    const f = fixture(); f.manager.unlock(); const fail = f.audios[0].onerror as (() => void) | null; fail?.();
    expect(f.manager.blocked).toBe(true); expect(f.audios[0].pause).toHaveBeenCalled(); f.manager.dispose();
    const manager = new AudioManager(f.manifest, { enabled: true, volume: 50 }, () => { throw new Error('Audio unavailable'); }); expect(() => manager.unlock()).not.toThrow(); expect(manager.blocked).toBe(true); manager.dispose();
  });
  it('設定保存キー・壊れた保存・範囲外volume・storage拒否', () => {
    expect(musicStorageKey).toBe('kyoto-music-v1');
    expect(readMusicSettings({ getItem: () => JSON.stringify({ enabled: false, volume: 120 }) })).toEqual({ enabled: false, volume: 100 });
    for (const getItem of [() => '{', () => '{"enabled":true,"volume":"50"}', () => { throw new Error('blocked'); }]) expect(readMusicSettings({ getItem })).toEqual(defaultMusicSettings);
  });
  it('autoplay blockedとDomestic→Adjudication→Domesticでも保存済みON/音量を変更しない', async () => {
    vi.useFakeTimers();
    const saved = JSON.stringify({ enabled: true, volume: 43 });
    const settings = Object.freeze(readMusicSettings({ getItem: () => saved }));
    const plays: string[] = []; let blocked = true;
    const manager = new AudioManager(bgmManifest, settings, src => ({ volume: 0, loop: false, onerror: null,
      pause: vi.fn(), play: () => { plays.push(src); return blocked ? Promise.reject(Error('NotAllowedError')) : Promise.resolve(); } }));
    manager.setContext('domestic'); manager.unlock(); await vi.advanceTimersByTimeAsync(0);
    expect(manager.blocked).toBe(true); expect(settings).toEqual({ enabled: true, volume: 43 });
    blocked = false; manager.unlock(); await vi.advanceTimersByTimeAsync(1000);
    manager.setContext('adjudication'); await vi.advanceTimersByTimeAsync(1000);
    manager.setContext('domestic'); await vi.advanceTimersByTimeAsync(1000);
    expect(manager.blocked).toBe(false); expect(settings).toEqual(readMusicSettings({ getItem: () => saved }));
    expect(plays).toContain('/audio/bgm/domestic.mp3'); expect(plays).toContain('/audio/bgm/adjudication.mp3'); manager.dispose();
  });
});
