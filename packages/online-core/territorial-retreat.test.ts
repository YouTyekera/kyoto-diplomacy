import { expect,it } from 'vitest';
import { RoomManager,serializePrivateState,serializePublicState } from './room-manager';
import { completeSyntheticScenario } from '../../tests/scenario-fixture';
import { sampleConfig,sampleDataset } from '../map-core/sample';
import { retreatFixture,R,B,G } from '../../tests/gameplay-fixture';
import { noEvents } from '../game-core/events';
it('exposes only owned retreat candidates, rejects forged orders and preserves private drafts on reconnect',()=>{
 const {dataset,config}=completeSyntheticScenario(sampleDataset,sampleConfig),manager=new RoomManager({sample:dataset,'kyoto-kml':dataset},undefined,{settings:noEvents});
 try{
  const created=manager.request('r',{action:'create',nickname:'r',preferredWardId:R,datasetKind:'sample',config});if(!created.ok||!created.credentials)throw Error('create');
  const credentials=created.credentials;
  for(const ward of [B,G])expect(manager.request(ward,{action:'join',nickname:ward,preferredWardId:ward,roomCode:credentials.roomCode}).ok).toBe(true);
  expect(manager.request('r',{action:'start',yearLimit:null}).ok).toBe(true);
  const room=manager.rooms.get(credentials.roomCode)!,fixture=retreatFixture();room.map=fixture.map;room.game!.state=fixture.state;
  const player=room.players.get(credentials.playerId)!,view=serializePrivateState(manager,room,player),phaseKey=manager.phaseKey(room)!;
  expect(view.retreatUnits[0].legalRetreatDestinations).toEqual(['d']);
  for(const destination of ['e','f'])expect(manager.request('r',{action:'retreats',phaseKey,orders:[{type:'retreat',unitId:'r',destination}],finalize:false}).ok).toBe(false);
  expect(manager.request('r',{action:'retreats',phaseKey,orders:[{type:'retreat',unitId:'r',destination:'d'}],finalize:false}).ok).toBe(true);
  manager.disconnect('r');expect(manager.request('retry',{action:'reconnect',...credentials}).ok).toBe(true);
  expect(serializePrivateState(manager,room,player).retreatOrders).toEqual([{type:'retreat',unitId:'r',destination:'d'}]);
  expect(JSON.stringify(serializePublicState(manager,room,false,false))).not.toContain('retreatOrders');
  expect(serializePrivateState(manager,room,room.players.get(room.game!.playerWards? [...room.players.keys()].find(id=>room.game!.playerWards[id]===B)!:'')!).retreatOrders).toEqual([]);
  expect(manager.request('retry',{action:'retreats',phaseKey,orders:[{type:'retreat',unitId:'r',destination:'d'}],finalize:true}).ok).toBe(true);
  expect(room.game!.state.board.units.find(u=>u.unitId==='r')!.regionId).toBe('d');
 }finally{manager.dispose();}
});
