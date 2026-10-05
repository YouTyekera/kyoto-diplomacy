import { describe, expect, it } from 'vitest';
import { victoryTarget } from '../../../packages/online-core/initial';
import { victoryDescriptions } from './VictoryConditions';

describe('Phase 7F concise victory wording', () => {
  it.each([[3, 1, 2], [4, 7, 4], [11, 12, 1]])('uses frozen settings for %s players / %s years / %s rival initial centers', (players, maxYears, rivals) => {
    const target = victoryTarget(players), text = victoryDescriptions({ victoryTargetSC: target, maxYears, requiredRivalInitialSupplyCentersForInstantWin: rivals });
    expect(text.instant).toBe(`補給拠点${target}か所＋敵の初期補給拠点${rivals}か所で勝利。`);
    expect(text.years).toContain(`${maxYears}年目終了時`);
    expect(text.years).toContain('脱落者が出た年');
  });
});
