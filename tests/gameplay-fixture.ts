import { compileMap } from '../packages/map-core/compile';
import { sampleConfig,sampleDataset } from '../packages/map-core/sample';
import { createPreview } from '../packages/shared/preview';
import { createGameSession,adjudicateGameOrders,type GameResponse } from '../packages/game-core';
import { noEvents } from '../packages/game-core/events';
import type { Unit } from '../packages/rules-core';
export const R='26101',B='26102',G='26103';
export const army=(unitId:string,ownerWardId:Unit['ownerWardId'],regionId:string):Unit=>({unitId,ownerWardId,regionId,type:'army'});
export function ok<T>(response:GameResponse<T>):T {if(!response.ok)throw Error(response.errors.join(';'));return response.result;}
export function gameplayFixture(){
 const map=compileMap(sampleDataset,sampleConfig).map,template=map.regions[0];
 map.regions=['a','b','c','d','e','f','g','h'].map(regionId=>({...structuredClone(template),regionId,name:regionId,enabled:true,isSupplyCenter:true,startingUnit:null,wardId:G}));
 map.adjacency={a:['b','c','d','e','f','g'],b:['a','c'],c:['a','b'],d:['a'],e:['a'],f:['a'],g:['a','h'],h:['g']};
 const board=createPreview(map);board.units=[army('r',R,'a'),army('b',B,'b'),army('s',B,'c')];
 for(const [id,c]of Object.entries(board.regionControl)){c.controllerWardId=id==='d'?R:B;c.supplyCenterOwnerWardId=G;}
 board.regionControl.e.controllerWardId=null;
 const state=ok(createGameSession(map,board,[R,B,G],null,99,{settings:noEvents}));
 return {map,state};
}
export function retreatFixture(){const {map,state}=gameplayFixture();const moved=ok(adjudicateGameOrders(map,state,[{type:'hold',unitId:'r'},{type:'move',unitId:'b',destination:'a'},{type:'support-move',unitId:'s',targetUnitId:'b',destination:'a'}]));return {map,state:moved};}
