import { describe,it,expect } from 'vitest';
import { markerGeometry } from './MapMarkers';
import { markerPixels } from './marker-layout';
describe('独立SCとArmyのgeometry',()=>{
  it.each([0.5,1,2,4,12])('zoom=%sでもpin尖端はSC中心、bodyは上側に立つ',zoom=>{
    const scale=markerPixels(zoom)/14;
    expect(Math.abs((markerGeometry.pinTipY+markerGeometry.pinOffsetY)*scale)).toBeLessThanOrEqual(markerGeometry.scRadius*scale);
    expect(markerGeometry.pinOffsetY).toBeLessThan(0);
    expect(markerGeometry.scRadius).toBe(6);
    expect(markerGeometry.scStroke).toBe(1.6);
  });
});
