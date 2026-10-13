import { expect,it } from 'vitest';
import { retreatFixture,ok,R,B,army } from '../../tests/gameplay-fixture';
import { adjudicateGameRetreats } from './session';
import { legalRetreatDestinations } from '../rules-core/retreat';
import { effectiveMap } from './events';
it('uses post-movement control, not administrative ward or supply ownership, for candidates and resolution',()=>{
 const {map,state}=retreatFixture();expect(state.board.regionControl.a.controllerWardId).toBe(B);
 expect(state.movement!.dislodgedUnits[0].legalRetreatDestinations).toEqual(['d']);
 expect(map.regions.find(r=>r.regionId==='d')!.wardId).not.toBe(R);expect(state.board.regionControl.d.supplyCenterOwnerWardId).not.toBe(R);
 const next=ok(adjudicateGameRetreats(map,state,[{type:'retreat',unitId:'r',destination:'d'}]));expect(next.board.units.find(u=>u.unitId==='r')!.regionId).toBe('d');
});
it.each(['e','f'])('rejects neutral/enemy destination %s even if stale candidate metadata allows it',destination=>{
 const {map,state}=retreatFixture();state.movement!.dislodgedUnits[0].legalRetreatDestinations.push(destination);
 expect(adjudicateGameRetreats(map,state,[{type:'retreat',unitId:'r',destination}]).ok).toBe(false);
});
it.each(['barricade','roadwork'] as const)('honors %s restrictions and automatically disbands when no owned destination remains',type=>{
 const {map,state}=retreatFixture();if(type==='barricade')state.events.activeBarricades=[{a:'a',b:'d',barricadeId:'x',ownerWardId:B,remainingMovementSeasons:4}];else state.events.roadworkEdges=[{a:'a',b:'d'}];
 expect(legalRetreatDestinations(effectiveMap(map,state.events),state.movement!,'r',state.board.regionControl)).toEqual([]);
 expect(ok(adjudicateGameRetreats(map,state,[])).retreatResult!.outcomes[0]).toMatchObject({status:'disbanded',reason:'no-retreat'});
});
it('keeps adjacency, occupation, attacker origin and standoff checks with owned destinations',()=>{
 const {map,state}=retreatFixture();for(const c of Object.values(state.board.regionControl))c.controllerWardId=R;
 state.movement!.standoffRegions=['f'];state.movement!.units.push(army('occupied',R,'g'));
 expect(legalRetreatDestinations(map,state.movement!,'r',state.board.regionControl)).toEqual(['d','e']);
});
it('disbands same-faction simultaneous retreats colliding in an owned destination',()=>{
 const {map,state}=retreatFixture();const second=structuredClone(state.movement!.dislodgedUnits[0]);second.unit=army('r2',R,'g');state.movement!.dislodgedUnits.push(second);map.adjacency.g.push('d');map.adjacency.d.push('g');
 const next=ok(adjudicateGameRetreats(map,state,[{type:'retreat',unitId:'r',destination:'d'},{type:'retreat',unitId:'r2',destination:'d'}]));expect(next.retreatResult!.outcomes.map(o=>o.reason)).toEqual(['retreat-collision','retreat-collision']);
});
