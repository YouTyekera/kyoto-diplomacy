import { describe,it,expect } from 'vitest';
import { createConfig,WARDS,type RegionDataset } from '../shared/model';
import { compileMap } from '../map-core/compile';
import { assignWards,createOnlineBoard,victoryTarget } from './initial';
import { serializePublicState,serializePrivateState,type Room } from './room-manager';
import { RoomManager } from '../../tests/immediate-playback-manager';
import { type Credentials,type OnlineResponse,type OnlineRequest } from '../shared/online';
import { advanceGame } from '../game-core';
import { noEvents } from '../game-core/events';
import { completeSyntheticScenario } from '../../tests/scenario-fixture';

/** Only synthetic test data: never saved into Kyoto configuration. */
export const onlineDataset:RegionDataset={version:1,kind:'sample',regions:WARDS.flatMap((w,i)=>[0,1].map(j=>{
  const x=135.74+j*.01,y=35.04+i*.01;
  return {regionId:`fixture-${w.id}-${j}`,name:`架空${w.name}${j?'通常地域':'SC'}`,wardId:w.id,sourceAreaNumber:String(j+1),
    geometry:{type:'Polygon' as const,coordinates:[[[x,y],[x+.01,y],[x+.01,y+.01],[x,y+.01],[x,y]]]},
    source:{file:'synthetic',folderName:'fixture',datasetId:'sample',url:'local test',copyright:'project',license:'test fixture',placemarks:[]}};
}))};
export function onlineFixture() {
  const config=createConfig(onlineDataset);
  for(const r of onlineDataset.regions) config.regions[r.regionId]={enabled:true,isSupplyCenter:r.regionId.endsWith('-0'),homeWardId:r.wardId,startingUnit:r.regionId.endsWith('-0')?{ownerWardId:r.wardId,type:'army'}:null};
  return {config,map:compileMap(onlineDataset,config).map};
}
function success(response:OnlineResponse) {expect(response.ok).toBe(true);if(!response.ok)throw new Error(response.errors.join(';'));return response;}
function setup(count=3) {
  const fixture=onlineFixture(),{config,dataset}=completeSyntheticScenario(onlineDataset,fixture.config),manager=new RoomManager({sample:dataset,'kyoto-kml':dataset},undefined,{settings:noEvents}),credentials:Credentials[]=[];
  const sockets=Array.from({length:count},(_,i)=>`socket-${i}`);
  for(let i=0;i<count;i++) credentials.push(success(manager.request(sockets[i],i===0?{action:'create',nickname:`player${i}`,preferredWardId:WARDS[i].id,datasetKind:'sample',config}:{action:'join',nickname:`player${i}`,preferredWardId:WARDS[i].id,roomCode:credentials[0].roomCode})).credentials!);
  const room=manager.rooms.get(credentials[0].roomCode)!;
  return {manager,room,credentials,sockets,start:()=>success(manager.request(sockets[0],{action:'start',yearLimit:null}))};
}
const key=(manager:RoomManager,room:Room)=>manager.phaseKey(room)!;
function finalize(manager:RoomManager,room:Room,socket:string,orders:Extract<OnlineRequest,{action:'orders'}>['orders']=[]) {return manager.request(socket,{action:'orders',phaseKey:key(manager,room),orders,finalize:true});}

describe('seeded行政区割当',()=>{
  it.each([3,11])('%i人で重複せず全員割当し無所属数が一致',count=>{
    const result=assignWards(WARDS.slice(0,count).map((_,i)=>({playerId:`p${i}`,preferredWardId:null})),'seed');
    expect(new Set(Object.values(result.playerWards)).size).toBe(count);expect(result.inactiveWards).toHaveLength(11-count);
  });
  it('単独希望を全員優先する',()=>{const players=WARDS.slice(0,3).map((w,i)=>({playerId:`p${i}`,preferredWardId:w.id}));expect(assignWards(players,'seed').playerWards).toEqual({p0:'26101',p1:'26102',p2:'26103'});});
  it('競合希望の勝者は希望者から1人だけ選び、敗者も別区を得る',()=>{
    const result=assignWards([{playerId:'a',preferredWardId:'26101'},{playerId:'b',preferredWardId:'26101'},{playerId:'c',preferredWardId:null}],'seed');
    expect(['a','b']).toContain(Object.keys(result.playerWards).find(p=>result.playerWards[p]==='26101'));expect(new Set(Object.values(result.playerWards)).size).toBe(3);
  });
  it('同じseed/参加者/希望は入力順に関係なく同じ結果',()=>{const players=Array.from({length:7},(_,i)=>({playerId:`p${i}`,preferredWardId:i<3?'26101' as const:null}));expect(assignWards(players,'same')).toEqual(assignWards([...players].reverse(),'same'));});
  it('希望なし・競合の割当はseedにより変化しうる',()=>{
    const players=Array.from({length:5},(_,i)=>({playerId:`p${i}`,preferredWardId:i<2?'26101' as const:null}));
    expect(new Set(Array.from({length:12},(_,i)=>JSON.stringify(assignWards(players,`seed${i}`)))).size).toBeGreaterThan(1);
  });
  it.each(Array.from({length:9},(_,i)=>i+3))('%i人の勝利目標は26−人数',n=>expect(victoryTarget(n)).toBe(26-n));
  it('設定値の変更を一箇所から適用できる',()=>expect(victoryTarget(3,{baseVictoryTargetSC:20,referencePlayerCount:11,missingPlayerSCBonus:2})).toBe(36));
});
describe('正式初期盤面と目標',()=>{
  it('activeだけcontroller/ホームSC/初期軍を持ち、無所属地域は残る',()=>{
    const {map}=onlineFixture(),before=structuredClone(map),board=createOnlineBoard(map,['26101','26102','26103']);
    expect(Object.keys(board.regionControl)).toHaveLength(22);expect(board.units).toHaveLength(3);
    expect(board.regionControl['fixture-26101-0']).toMatchObject({controllerWardId:'26101',supplyCenterOwnerWardId:'26101'});
    expect(board.regionControl['fixture-26104-0']).toMatchObject({controllerWardId:null,supplyCenterOwnerWardId:null});expect(map).toEqual(before);
  });
  it('active区内のhome=null/異なるhomeは中立SC、非SC所有はnull',()=>{
    const {map}=onlineFixture();map.regions.find(r=>r.regionId==='fixture-26101-0')!.homeWardId=null;
    map.regions.find(r=>r.regionId==='fixture-26102-0')!.homeWardId='26101';
    const board=createOnlineBoard(map,['26101','26102','26103']);expect(Object.values(board.regionControl).every(r=>r.supplyCenterOwnerWardId===null||r.supplyCenterOwnerWardId==='26103')).toBe(true);
  });
  it('除外・領域全消失にはcontroller/SC/軍を配置しない',()=>{
    const {map}=onlineFixture();map.regions[0].enabled=false;map.regions[2].playableGeometry=null;
    const board=createOnlineBoard(map,['26101','26102','26103']);expect(board.regionControl[map.regions[0].regionId]).toBeUndefined();expect(board.regionControl[map.regions[2].regionId]).toBeUndefined();expect(board.units).toHaveLength(1);
  });
  it('初期軍はstartingUnitの所有勢力を参照する',()=>{
    const {map}=onlineFixture();map.regions[0].startingUnit={type:'army',ownerWardId:'26104'};map.regions[6].startingUnit={type:'army',ownerWardId:'26101'};
    const board=createOnlineBoard(map,['26101','26102','26103']);expect(board.units.find(u=>u.regionId===map.regions[0].regionId)).toBeUndefined();expect(board.units.find(u=>u.regionId===map.regions[6].regionId)?.ownerWardId).toBe('26101');
  });
  it('人数目標は切断・脱落後も固定、15SCでも3人目標23未満なら終了しない',()=>{
    const {manager,room,sockets,start}=setup();start();manager.disconnect(sockets[1]);expect(room.game!.state.victoryTargetSC).toBe(23);
    const state=room.game!.state;state.phase='sc-update';for(const r of room.map.regions){r.isSupplyCenter=true;state.board.regionControl[r.regionId].controllerWardId='26101';}
    for(const r of room.map.regions.slice(15)) state.board.regionControl[r.regionId].controllerWardId=null;
    const response=advanceGame(room.map,state);expect(response.ok&&response.result.phase).toBe('orders');
    if(response.ok){response.result.end={reason:'elimination',finalYear:1,winnerWardId:null,candidateWardIds:[],tieUnresolved:false,eliminated:[{wardId:'26102',reasons:['zero-sc']}]};expect(response.result.victoryTargetSC).toBe(23);}
  });
  it('3人の固定目標23SCへ達したSC更新では即勝利する',()=>{
    const {room,start}=setup();start();const state=room.game!.state;
    const extra=structuredClone(room.map.regions[0]);extra.regionId='extra-synthetic-sc';room.map.regions.push(extra);room.map.adjacency[extra.regionId]=[];
    state.board.regionControl[extra.regionId]={regionId:extra.regionId,controllerWardId:'26101',supplyCenterOwnerWardId:null};
    for(const r of room.map.regions){r.isSupplyCenter=true;state.board.regionControl[r.regionId].controllerWardId='26101';}
    state.phase='sc-update';const response=advanceGame(room.map,state);expect(response.ok&&response.result.end).toMatchObject({reason:'victory',winnerWardId:'26101'});
  });
});
describe('ルーム・ロビー',()=>{
  it('2人では開始不可、3人目が入るとホストが開始できる',()=>{const {manager,room,sockets,credentials}=setup(2);expect(manager.request(sockets[0],{action:'start',yearLimit:null})).toMatchObject({ok:false,errors:['3人以上必要です']});success(manager.request('third',{action:'join',nickname:'third',preferredWardId:'26103',roomCode:credentials[0].roomCode}));success(manager.request(sockets[0],{action:'start',yearLimit:null}));expect(room.game?.activePlayerCount).toBe(3);});
  it('11人まで参加でき12人目を拒否する',()=>{const {manager,room}=setup(11);expect(manager.request('12',{action:'join',nickname:'12',preferredWardId:null,roomCode:room.code}).ok).toBe(false);expect(room.players.size).toBe(11);});
  it('ホスト以外の開始と開始後の参加/退出/希望変更を拒否',()=>{
    const {manager,room,sockets,start}=setup();expect(manager.request(sockets[1],{action:'start',yearLimit:null}).ok).toBe(false);start();
    for(const request of [{action:'join',nickname:'later',preferredWardId:null,roomCode:room.code},{action:'leave'},{action:'preference',preferredWardId:null}] as OnlineRequest[])expect(manager.request(request.action==='join'?'later':sockets[1],request).ok).toBe(false);
  });
  it('開始前の退出で人数減少・ホスト移譲、切断者がいる間は開始不可',()=>{
    const {manager,room,sockets}=setup(4);success(manager.request(sockets[0],{action:'leave'}));expect(room.players.size).toBe(3);expect(room.players.get(room.hostId)?.socketId).toBeTruthy();manager.disconnect(sockets[1]);expect(manager.startErrors(room)).toContain('全参加者の接続を待っています');
  });
  it('開始前ホスト瞬断は猶予中の権限を保持する',()=>{const {manager,room,sockets}=setup(),host=room.hostId;manager.disconnect(sockets[0]);expect(room.hostId).toBe(host);manager.dispose();});
  it('希望を変更でき、他人の希望は公開しない',()=>{const {manager,room,sockets}=setup();success(manager.request(sockets[1],{action:'preference',preferredWardId:'26109'}));expect(serializePublicState(manager,room).players.every(p=>!('preferredWardId'in p))).toBe(true);expect(serializePrivateState(manager,room,manager.playerForSocket(sockets[1])!).preferredWardId).toBe('26109');});
  it('空nickname/余分なフィールド/不正区/壊れた設定を拒否する',()=>{
    const {manager,room}=setup();for(const nickname of ['', 'x'.repeat(33), '\n'])expect(manager.request(nickname,{action:'join',roomCode:room.code,nickname,preferredWardId:null}).ok).toBe(false);
    expect(manager.request('bad',{action:'join',roomCode:room.code,nickname:'x',preferredWardId:'unknown'}).ok).toBe(false);
    expect(manager.request('bad',{action:'leave',playerId:'another'}).ok).toBe(false);
  });
});
describe('秘密提出・Auto Hold・フェイズロック',()=>{
  it('確定時に自軍だけHold補完、他人にはreadyだけ、本人へ提出内容',()=>{
    const {manager,room,sockets,start}=setup();start();success(finalize(manager,room,sockets[0]));
    expect(manager.playerForSocket(sockets[0])!.submission.orders).toEqual([{type:'hold',unitId:'initial-fixture-26101-0'}]);
    expect(serializePublicState(manager,room).players.find(p=>p.wardId==='26101')).toMatchObject({status:'finalized',finalized:true});
    expect(JSON.stringify(serializePublicState(manager,room))).not.toContain('"type":"hold"');expect(JSON.stringify(serializePublicState(manager,room))).not.toContain('reconnectToken');
    expect(serializePrivateState(manager,room,manager.playerForSocket(sockets[1])!).orders).toEqual([]);
  });
  it('Move/Support秘密はdraftでもfinalizedでも本人だけ、公開serializerに内部追加項目も流入しない',()=>{
    const {manager,room,sockets,start}=setup();start();const order={type:'move' as const,unitId:'initial-fixture-26101-0',destination:'fixture-26101-1'};
    success(manager.request(sockets[0],{action:'orders',phaseKey:key(manager,room),orders:[order],finalize:false}));
    const own=manager.playerForSocket(sockets[0])!;Object.assign(own,{secretExtra:'never-broadcast'});
    expect(serializePrivateState(manager,room,own).orders).toEqual([order]);success(finalize(manager,room,sockets[0],[order]));
    const publicText=JSON.stringify(serializePublicState(manager,room));expect(publicText).not.toContain('"type":"move"');expect(publicText).not.toContain('never-broadcast');
    expect(serializePrivateState(manager,room,manager.playerForSocket(sockets[1])!).legalOrders['initial-fixture-26101-0']).toBeUndefined();
  });
  it('他軍・重複・非隣接Move・偽フェイズをHoldに置換せず拒否する',()=>{
    const {manager,room,sockets,start}=setup();start();
    expect(finalize(manager,room,sockets[0],[{type:'hold',unitId:'initial-fixture-26102-0'}]).ok).toBe(false);
    const bad={type:'move' as const,unitId:'initial-fixture-26101-0',destination:'fixture-26109-1'};
    expect(finalize(manager,room,sockets[0],[bad]).ok).toBe(false);expect(finalize(manager,room,sockets[0],[{type:'hold',unitId:bad.unitId},{type:'hold',unitId:bad.unitId}]).ok).toBe(false);
    expect(manager.request(sockets[0],{action:'orders',phaseKey:'stale',orders:[],finalize:true}).ok).toBe(false);expect(manager.playerForSocket(sockets[0])!.submission.finalized).toBe(false);
  });
  it('全員前に解除して再編集でき、最後の確定で1回だけ裁定する',()=>{
    const {manager,room,sockets,start}=setup();start();const oldKey=key(manager,room);success(finalize(manager,room,sockets[0]));success(manager.request(sockets[0],{action:'unready',phaseKey:oldKey}));
    success(finalize(manager,room,sockets[1]));success(finalize(manager,room,sockets[2]));expect(room.game!.movementResolutions).toBe(0);
    success(finalize(manager,room,sockets[0]));expect(room.game!.movementResolutions).toBe(1);expect(room.game!.state.season).toBe('autumn');expect(room.game!.lastResult!.movement!.orderResults).toHaveLength(3);
    expect(manager.request(sockets[0],{action:'unready',phaseKey:oldKey}).ok).toBe(false);
    expect(manager.request(sockets[0],{action:'orders',phaseKey:oldKey,orders:[],finalize:true}).ok).toBe(false);expect(room.game!.movementResolutions).toBe(1);
  });
  it('自軍がなくても生存プレイヤーは空命令書を明示確定し、勝手に次ターンへ進まない',()=>{
    const {manager,room,sockets,start}=setup();start();room.game!.state.board.units=room.game!.state.board.units.filter(u=>u.ownerWardId!=='26103');
    expect(serializePublicState(manager,room).players.find(p=>p.wardId==='26103')!.status).toBe('editing');success(finalize(manager,room,sockets[0]));success(finalize(manager,room,sockets[1]));expect(room.game!.state.season).toBe('spring');success(finalize(manager,room,sockets[2]));expect(room.game!.state.season).toBe('autumn');
  });
  it('全軍ゼロの設定でもOrdersで待機し、空の自動裁定ループに入らない',()=>{
    const {manager,room,sockets,start}=setup();start();room.game!.state.board.units=[];expect(room.game!.state.board.units).toEqual([]);expect(room.game!.movementResolutions).toBe(0);
    for(const socket of sockets)success(finalize(manager,room,socket));expect(room.game!.state.season).toBe('autumn');expect(room.game!.movementResolutions).toBe(1);
  });
});
describe('再接続と切断',()=>{
  it('正しいtokenで同じplayer/本人draft/固定目標へ復帰し、古いsocketは操作不可',()=>{
    const {manager,room,sockets,credentials,start}=setup();start();success(finalize(manager,room,sockets[0]));manager.disconnect(sockets[0]);
    success(manager.request('replacement',{action:'reconnect',...credentials[0]}));expect(manager.playerForSocket('replacement')!.playerId).toBe(credentials[0].playerId);expect(manager.playerForSocket('replacement')!.submission.finalized).toBe(true);
    expect(serializePrivateState(manager,room,manager.playerForSocket('replacement')!).orders).toHaveLength(1);expect(room.game!.state.victoryTargetSC).toBe(23);expect(manager.request(sockets[0],{action:'leave'}).ok).toBe(false);
  });
  it('不正token/別player/不存在ルームは拒否、credentialsは公開・private viewへ混入しない',()=>{
    const {manager,room,credentials,sockets}=setup();expect(manager.request('bad',{action:'reconnect',...credentials[0],reconnectToken:'0'.repeat(64)}).ok).toBe(false);
    expect(manager.request('bad',{action:'reconnect',...credentials[0],playerId:credentials[1].playerId}).ok).toBe(false);
    expect(manager.request('bad',{action:'reconnect',...credentials[0],roomCode:'AAAAAA'}).ok).toBe(false);
    for(const c of credentials) {expect(JSON.stringify(serializePublicState(manager,room))).not.toContain(c.reconnectToken);expect(JSON.stringify(serializePrivateState(manager,room,manager.playerForSocket(sockets[0])!))).not.toContain(c.reconnectToken);}
  });
  it('未確定の切断者を待ち、切断した確定済み提出は保持して裁定できる',()=>{
    const {manager,room,sockets,credentials,start}=setup();start();manager.disconnect(sockets[2]);success(finalize(manager,room,sockets[0]));success(finalize(manager,room,sockets[1]));expect(room.game!.movementResolutions).toBe(0);
    expect(serializePublicState(manager,room).players.find(p=>p.wardId==='26103')!.status).toBe('disconnected');
    success(manager.request('back',{action:'reconnect',...credentials[2]}));success(manager.request(sockets[0],{action:'unready',phaseKey:key(manager,room)}));success(finalize(manager,room,'back'));manager.disconnect('back');success(finalize(manager,room,sockets[0]));expect(room.game!.movementResolutions).toBe(1);
    // The disconnected player's next phase is unfinalized and blocks again.
    success(finalize(manager,room,sockets[0]));success(finalize(manager,room,sockets[1]));expect(room.game!.movementResolutions).toBe(1);
  });
});
describe('オンラインRetreat/Winter',()=>{
  it('排除軍の勢力だけrequired、本人だけ撤退draft、確定後SC更新・次フェイズへ',()=>{
    const {manager,room,sockets,start}=setup();start();const ids=room.game!.state.board.units.map(u=>u.regionId),support='fixture-26101-1';
    room.game!.state.board.units.push({unitId:'supporter',ownerWardId:'26101',regionId:support,type:'army'});
    const playable=[...ids,support,'fixture-26102-1','fixture-26103-1'];for(const id of playable)room.map.adjacency[id]=playable.filter(v=>v!==id);
    // Remove edges to other synthetic regions so the graph remains symmetric.
    for(const r of room.map.regions)if(!playable.includes(r.regionId)){r.enabled=false;delete room.map.adjacency[r.regionId];delete room.game!.state.board.regionControl[r.regionId];}
    success(finalize(manager,room,sockets[0],[{type:'move',unitId:'initial-fixture-26101-0',destination:ids[1]},{type:'support-move',unitId:'supporter',targetUnitId:'initial-fixture-26101-0',destination:ids[1]}]));success(finalize(manager,room,sockets[1]));success(finalize(manager,room,sockets[2]));
    expect(room.game!.state.phase).toBe('retreats');const publicView=serializePublicState(manager,room);expect(publicView.players.filter(p=>p.required).map(p=>p.wardId)).toEqual(['26102']);
    const destination='fixture-26102-1',phaseKey=key(manager,room);
    success(manager.request(sockets[1],{action:'retreats',phaseKey,orders:[{type:'retreat',unitId:'initial-fixture-26102-0',destination}],finalize:false}));
    expect(serializePrivateState(manager,room,manager.playerForSocket(sockets[0])!).retreatOrders).toEqual([]);expect(JSON.stringify(serializePublicState(manager,room))).not.toContain('"type":"retreat"');
    expect(manager.request(sockets[0],{action:'retreats',phaseKey,orders:[],finalize:true}).ok).toBe(false);
    success(manager.request(sockets[1],{action:'retreats',phaseKey,orders:[{type:'retreat',unitId:'initial-fixture-26102-0',destination}],finalize:true}));
    expect(room.game!.state.season).toBe('autumn');expect(room.game!.state.board.regionControl[destination].controllerWardId).toBe('26102');expect(room.game!.lastResult!.retreat?.outcomes[0].destination).toBe(destination);
  });
  it('Winterは必要解散/利用可能なBuildだけrequiredで、0Buildも明示確定が必要',()=>{
    const {manager,room,sockets,start}=setup();start();const state=room.game!.state;state.season='winter';state.phase='adjustments';
    state.board.units.find(u=>u.ownerWardId==='26101')!.regionId='fixture-26101-1';state.board.regionControl['fixture-26104-0'].supplyCenterOwnerWardId='26101';
    state.board.regionControl['fixture-26102-0'].supplyCenterOwnerWardId=null;
    expect(serializePublicState(manager,room).players.map(p=>p.required)).toEqual([true,true,false]);
    expect(manager.request(sockets[1],{action:'winter',phaseKey:key(manager,room),draft:{buildRegionIds:[],disbandUnitIds:[]},finalize:true}).ok).toBe(false);
    success(manager.request(sockets[1],{action:'winter',phaseKey:key(manager,room),draft:{buildRegionIds:[],disbandUnitIds:['initial-fixture-26102-0']},finalize:true}));
    expect(state.phase).toBe('adjustments');expect(serializePrivateState(manager,room,manager.playerForSocket(sockets[0])!).winterDraft.disbandUnitIds).toEqual([]);
    expect(JSON.stringify(serializePublicState(manager,room))).not.toContain('winterDraft');
    success(manager.request(sockets[0],{action:'winter',phaseKey:key(manager,room),draft:{buildRegionIds:[],disbandUnitIds:[]},finalize:true}));expect(room.game!.state.phase).toBe('finished');expect(room.game!.lastResult!.winter!.disbandedUnitIds).toContain('initial-fixture-26102-0');
  });
  it('合法Buildを一括適用し、他勢力の解散と過剰Buildを拒否する',()=>{
    const {manager,room,sockets,start}=setup();start();const state=room.game!.state;state.season='winter';state.phase='adjustments';state.board.units.find(u=>u.ownerWardId==='26101')!.regionId='fixture-26101-1';state.board.regionControl['fixture-26104-0'].supplyCenterOwnerWardId='26101';
    expect(manager.request(sockets[0],{action:'winter',phaseKey:key(manager,room),draft:{buildRegionIds:[],disbandUnitIds:['initial-fixture-26102-0']},finalize:true}).ok).toBe(false);
    success(manager.request(sockets[0],{action:'winter',phaseKey:key(manager,room),draft:{buildRegionIds:['fixture-26101-0'],disbandUnitIds:[]},finalize:true}));
    expect(room.game!.state.year).toBe(2);expect(room.game!.state.board.units.filter(u=>u.ownerWardId==='26101')).toHaveLength(2);expect(room.game!.state.victoryTargetSC).toBe(23);
  });
  it('Build枠があっても合法な空き地点がなければ不要',()=>{const {manager,room,sockets,start}=setup();start();room.game!.state.season='winter';room.game!.state.phase='adjustments';room.game!.state.board.regionControl['fixture-26104-0'].supplyCenterOwnerWardId='26101';expect(manager.required(room,manager.playerForSocket(sockets[0])!)).toBe(false);});
});

describe('ロビーのルール確認',()=>{
  it('本人だけが自分の確認を送信でき、全参加者へ確認状態を公開する',()=>{
    const {manager,room,sockets}=setup();
    expect(serializePublicState(manager,room).players.every(p=>!p.rulesRead)).toBe(true);
    success(manager.request(sockets[1],{action:'rules-read',read:true}));
    const players=serializePublicState(manager,room).players;
    expect(players[1].rulesRead).toBe(true);
    expect(players[0].rulesRead).toBe(false);
    expect(players[2].rulesRead).toBe(false);
    expect(manager.request('unjoined',{action:'rules-read',read:true}).ok).toBe(false);
    success(manager.request(sockets[1],{action:'rules-read',read:false}));
    expect(serializePublicState(manager,room).players[1].rulesRead).toBe(false);
  });
  it('再接続でも維持し、開始条件には影響せず開始後の変更は拒否する',()=>{
    const {manager,room,sockets,credentials,start}=setup();
    success(manager.request(sockets[1],{action:'rules-read',read:true}));
    manager.disconnect(sockets[1]);
    success(manager.request('reconnected',{action:'reconnect',...credentials[1]}));
    expect(serializePublicState(manager,room).players[1].rulesRead).toBe(true);
    start();
    expect(manager.request('reconnected',{action:'rules-read',read:false}).ok).toBe(false);
  });
});
