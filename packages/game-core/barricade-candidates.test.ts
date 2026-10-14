import { expect,it } from 'vitest';
import { gameplayFixture,R } from '../../tests/gameplay-fixture';
import { legalGameOrders,validateGameOrders } from './equipment-orders';
it('every offered barricade edge passes full validation; bridge, duplicate and reserved edges are excluded',()=>{
 const {map,state}=gameplayFixture();state.events.inventory=[{equipmentId:'wall',type:'barricade',ownerWardId:R}];
 const choices=legalGameOrders(map,state,'r').filter(o=>o.type==='deploy-barricade');expect(choices.map(o=>o.targetRegionId).sort()).toEqual(['b','c']);
 for(const order of choices)expect(validateGameOrders(map,state,state.board.units.map(u=>u.unitId==='r'?order:{type:'hold',unitId:u.unitId})).ok).toBe(true);
 state.events.activeBarricades=[{a:'a',b:'b',barricadeId:'old',ownerWardId:R,remainingMovementSeasons:2}];
 expect(legalGameOrders(map,state,'r').filter(o=>o.type==='deploy-barricade')).toEqual([]);
 state.events.activeBarricades=[];state.events.reservations=[{equipmentId:'wall',type:'barricade',unitId:'other'}];
 expect(legalGameOrders(map,state,'r').filter(o=>o.type==='deploy-barricade')).toEqual([]);
});
