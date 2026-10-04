import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fitBoard } from './board-camera';
import { sfxManifest } from './audio/sfx-manifest';
describe('Phase 6B board camera', () => {
  it.each([1920 / 916, 1280 / 556])('fits all SC anchors with margin at aspect %s', aspect => {
    const points = [[405, 470], [647, 670]], view = fitBoard(points, aspect)!;
    expect(view.width / view.height).toBeCloseTo(aspect);
    for (const [x, y] of points) { expect(x).toBeGreaterThan(view.x); expect(x).toBeLessThan(view.x + view.width); expect(y).toBeGreaterThan(view.y); expect(y).toBeLessThan(view.y + view.height); }
    expect(view.height).toBeLessThan(300);
  });
  it('empty maps have no fabricated focus and one point remains zoomable', () => {
    expect(fitBoard([], 2)).toBeNull(); expect(fitBoard([[10, 20]], 2)!.height).toBeGreaterThan(20);
  });
});
describe('Phase 6B real local sound assets', () => {
  for (const [cue, asset] of Object.entries(sfxManifest)) it(`${cue}: decodable PCM, expected length, audible signal and headroom`, () => {
    const wav = readFileSync(new URL(`../public${asset.src}`, import.meta.url));
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF'); expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
    expect(wav.readUInt16LE(20)).toBe(1); expect(wav.readUInt16LE(22)).toBe(1); expect(wav.readUInt16LE(34)).toBe(16);
    expect(wav.readUInt32LE(40)).toBe(wav.length - 44);
    const duration = (wav.length - 44) / 2 / wav.readUInt32LE(24) * 1000;
    expect(duration).toBeGreaterThanOrEqual(asset.lengthMs[0]); expect(duration).toBeLessThanOrEqual(asset.lengthMs[1]);
    const pcm = Array.from({ length: (wav.length - 44) / 2 }, (_, i) => wav.readInt16LE(44 + i * 2) / 32767);
    expect(Math.max(...pcm.map(Math.abs))).toBeLessThan(.43);
    expect(Math.sqrt(pcm.reduce((s, v) => s + v * v, 0) / pcm.length)).toBeGreaterThan(.1);
    expect(pcm[0]).toBe(0); expect(Math.abs(pcm.at(-1)!)).toBeLessThan(.001);
  });
});
