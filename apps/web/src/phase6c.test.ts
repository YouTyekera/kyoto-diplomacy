import { describe, it, expect } from 'vitest';
import { clampBoardView, neutralSupplyScale, fitBoard } from './board-camera';
import { victoryDescriptions } from './VictoryConditions';
import { playerMessage } from './player-language';
describe('Phase 6C display constraints', () => {
  it('neutral symbols interpolate without changing the tactical scale', () => {
    expect(neutralSupplyScale(600, 1000)).toBe(1);
    expect(neutralSupplyScale(1000, 1000)).toBeCloseTo(.7);
    const mid=neutralSupplyScale(780,1000);expect(mid).toBeCloseTo(.85);
    expect(neutralSupplyScale(779,1000)-neutralSupplyScale(780,1000)).toBeLessThan(.003);
  });
  it.each([1920/916,1280/556])('limits wide zoom and keeps the board in reach, aspect %s', aspect => {
    const all=fitBoard([[300,400],[700,800]],aspect,1.1)!;
    const next=clampBoardView({x:9000,y:-9000,width:4000,height:3200},all,aspect);
    expect(next.width).toBeCloseTo(all.width*1.04);expect(next.width/next.height).toBeCloseTo(aspect);
    expect(next.x).toBeLessThan(all.x+all.width);expect(next.y+next.height).toBeGreaterThan(all.y);
    expect(clampBoardView(next,all,aspect)).toEqual(next);
  });
  it('victory help follows session settings, including a non-default rival target and year', () => {
    const text=victoryDescriptions({victoryTargetSC:19,requiredRivalInitialSupplyCentersForInstantWin:4,maxYears:7});
    expect(text.instant).toContain('19か所');expect(text.instant).toContain('4か所');expect(text.years).toContain('7年目');
  });
  it('legacy validation messages are translated only at the display boundary',()=>{
    expect(playerMessage('初期SC 0 / 非SC 0 / 敵初期SC 2')).toBe('初期補給拠点 0 / 補給拠点以外の地域 0 / 敵の初期補給拠点 2');
  });
});
