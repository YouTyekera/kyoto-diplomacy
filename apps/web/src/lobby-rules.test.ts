import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { guideUrl } from './LobbyRules';

describe('ロビーの説明PDF', () => {
  it('静的PDFのパスと表示リンクが一致する', () => {
    const baseFileName = decodeURIComponent(guideUrl).split('/').at(-1);
    expect(baseFileName).toBe('ディプロマシールール説明.pdf');
    expect(existsSync('apps/web/public/rules/ディプロマシールール説明.pdf')).toBe(true);
  });
});
