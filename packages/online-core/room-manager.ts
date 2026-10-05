import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { compileScenario,compileUploadedScenario,validateScenarioForOnlinePlay,type Scenario,type ScenarioDiagnostic } from './scenario';
import { startMatchLog,logTransition,phaseElapsed,recordMatch,summarizeMatch,exportMatchLog } from '../game-core/match-log';
import { conquestProgress } from '../game-core/end';
import type { MatchLog } from '../shared/match';
import { assignWards, createOnlineBoard, victoryTarget, defaultGameSettings, type Assignment } from './initial';
import { requestSchema, publicRoomSchema, privatePlayerSchema, type SessionEnded,type OnlineResponse, type Credentials, type PublicResult, type PublicRoomView, type PrivatePlayerView, type OnlineRequest } from '../shared/online';
import type { MapDefinition, RegionDataset, WardId } from '../shared/model';
import { type RetreatOrder } from '../rules-core';
import type { GameOrder, EventSettings } from '../shared/events';
import { resolveRetreats } from '../rules-core/retreat';
import { advanceGame, createGameSession, adjudicateGameOrders, adjudicateGameRetreats, adjudicateGameWinter, winterBudget, type GameResponse, type GameSessionState } from '../game-core';
import { validateGameOrders,legalGameOrders,effectiveMap,publicEvents,inventoryCounts } from '../game-core';

interface Submission { orders:GameOrder[];retreats:RetreatOrder[];winter:{buildRegionIds:string[];disbandUnitIds:string[]};finalized:boolean }
export interface PlayerSession { playerId:string;nickname:string;preferredWardId:WardId|null;reconnectToken:string;socketId:string|null;submission:Submission }
export interface OnlineGameSession extends Assignment { state:GameSessionState;seed:string;activePlayerCount:number;phaseSerial:number;locked:boolean;lastResult:PublicResult|null;movementResolutions:number;presentationSkips:Set<string>;matchLog:MatchLog }
export interface Room { code:string;hostId:string;map:MapDefinition;scenario:Scenario;datasetKind:RegionDataset['kind'];players:Map<string,PlayerSession>;game:OnlineGameSession|null;lobbyMaxYears?:number }
export interface SessionDiagnostic { event:'socket-disconnect'|'reconnect-success'|'reconnect-failed'|'host-grace-start'|'host-grace-cancel'|'host-transferred';roomCode?:string;player?:string;connection?:string }
export const hostReconnectGraceMs=60000;
export const duplicateNicknameMessage='同じニックネームの参加者がいます。以前参加していた場合は「復帰」を使用してください。';
export const normalizeNickname=(name:string)=>name.normalize('NFKC').trim().replace(/\s+/gu,' ').toLowerCase();
const blank=():Submission=>({orders:[],retreats:[],winter:{buildRegionIds:[],disbandUnitIds:[]},finalized:false});
const fail=(...errors:string[]):OnlineResponse=>({ok:false,errors});
const emptyWinter=()=>({buildRegionIds:[],disbandUnitIds:[]});
function requireResult(response:GameResponse):GameSessionState {if(!response.ok) throw new Error(response.errors.join('\n'));return response.result;}

/** Synchronous transactions: no await between phase check, finalization, lock and resolution. */
export class RoomManager {
  readonly rooms=new Map<string,Room>();
  private readonly identities=new Map<string,{roomCode:string;playerId:string}>();
  private readonly hostGrace=new Map<string,{playerId:string;deadline:number;timer:ReturnType<typeof setTimeout>}>();
  private readonly sessionEnds=new Set<(socketId:string,event:SessionEnded)=>void>();
  private readonly sessionListeners=new Set<(event:SessionDiagnostic)=>void>();
  private disposed=false;
  onSessionEvent(listener:(event:SessionDiagnostic)=>void){this.sessionListeners.add(listener);return ()=>{this.sessionListeners.delete(listener);};}
  onSessionEnd(listener:(socketId:string,event:SessionEnded)=>void){this.sessionEnds.add(listener);return()=>{this.sessionEnds.delete(listener);};}
  hostGraceDeadline(room:Room){return this.hostGrace.get(room.code)?.deadline??null;}
  private endSession(socketId:string,room:Room,playerId:string,reason:SessionEnded['reason']){for(const listener of this.sessionEnds)listener(socketId,{roomCode:room.code,playerId,reason});}
  private sessionEvent(event:SessionDiagnostic['event'],room?:Room,playerId?:string,socketId?:string){for(const listener of this.sessionListeners)listener({event,roomCode:room?.code,player:playerId?.slice(0,8),connection:socketId?.slice(0,8)});}
  private cancelHostGrace(room:Room){const grace=this.hostGrace.get(room.code);if(!grace)return;clearTimeout(grace.timer);this.hostGrace.delete(room.code);this.sessionEvent('host-grace-cancel',room,grace.playerId);}
  dispose(){this.disposed=true;for(const grace of this.hostGrace.values())clearTimeout(grace.timer);this.hostGrace.clear();this.sessionListeners.clear();this.sessionEnds.clear();}
  constructor(private datasets:Record<RegionDataset['kind'],RegionDataset>,private settings=defaultGameSettings,private eventOptions:{settings?:EventSettings;seedFactory?:()=>string;now?:()=>string;standardScenarioJson?:string}={}) {}
  private standardScenario(diagnostic?:(value:ScenarioDiagnostic)=>void) {
    const json=this.eventOptions.standardScenarioJson;
    if(!json)throw new Error('標準シナリオを読み込めません。サーバー管理者へお知らせください。');
    const loaded=compileUploadedScenario(this.datasets,'kyoto-kml',json,undefined,diagnostic);
    loaded.scenario.name='標準シナリオ';loaded.scenario.fileName='kyoto-standard.json';loaded.scenario.source='standard';
    return loaded;
  }
  private now(){return this.eventOptions.now?.()??new Date().toISOString();}
  configuredMaxYears(){return this.settings.maxYears;}
  preflight(room:Room){return validateScenarioForOnlinePlay(room.map,room.scenario.config,room.players.size,this.settings,room.scenario.report);}
  roomForSocket(socketId:string) {const identity=this.identities.get(socketId);return identity?this.rooms.get(identity.roomCode):undefined;}
  playerForSocket(socketId:string) {const room=this.roomForSocket(socketId), identity=this.identities.get(socketId);return identity&&room?.players.get(identity.playerId);}
  phaseKey(room:Room) {return room.game?`${room.code}:${room.game.phaseSerial}:${room.game.state.year}:${room.game.state.season}:${room.game.state.phase}`:null;}
  startErrors(room:Room) {
    const errors:string[]=[];
    if(room.players.size<3) errors.push('3人以上必要です');
    if(room.players.size>11) errors.push('参加上限は11人です');
    if([...room.players.values()].some(p=>!p.socketId)) errors.push('全参加者の接続を待っています');
    errors.push(...this.preflight(room).errors);
    return errors;
  }
  required(room:Room,player:PlayerSession) {
    const game=room.game;if(!game||game.state.phase==='finished') return false;
    const ward=game.playerWards[player.playerId],state=game.state;
    // Decisions require every living player to finalize an Orders sheet, including an empty one.
    if(state.phase==='orders') return true;
    if(state.phase==='retreats') return !!state.movement?.dislodgedUnits.some(d=>d.unit.ownerWardId===ward);
    if(state.phase==='adjustments') {const b=winterBudget(room.map,state,ward);return b.disbandCount>0||(b.buildCount>0&&b.buildRegionIds.length>0);}
    return false;
  }
  private addPlayer(room:Room,socketId:string,nickname:string,preferredWardId:WardId|null):Credentials {
    const playerId=randomUUID(),reconnectToken=randomBytes(32).toString('hex');
    room.players.set(playerId,{playerId,nickname,preferredWardId,reconnectToken,socketId,submission:blank()});
    this.identities.set(socketId,{roomCode:room.code,playerId});
    return {roomCode:room.code,playerId,reconnectToken};
  }
  request(socketId:string,input:unknown,diagnostic?:(value:ScenarioDiagnostic)=>void):OnlineResponse {
    const parsed=requestSchema.safeParse(input);
    if(!parsed.success) {if(input&&typeof input==='object'&&'action' in input&&input.action==='reconnect')this.sessionEvent('reconnect-failed',undefined,undefined,socketId);diagnostic?.({stage:'request-schema-failed'});return fail(...parsed.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`));}
    const request=parsed.data;
    if(request.action==='reconnect') {
      const room=this.rooms.get(request.roomCode),player=room?.players.get(request.playerId);
      if(!room||!player||!timingSafeEqual(Buffer.from(player.reconnectToken),Buffer.from(request.reconnectToken))) {this.sessionEvent('reconnect-failed',room,player?.playerId,socketId);return fail('復帰情報が一致しません。サーバー再起動時はルームを作り直してください');}
      const current=this.playerForSocket(socketId);if(current&&current!==player) {this.sessionEvent('reconnect-failed',room,current.playerId);return fail('別の参加者として接続中です');}
      const previousSocket=player.socketId;
      if(previousSocket) this.identities.delete(previousSocket);
      player.socketId=socketId;this.identities.set(socketId,{roomCode:room.code,playerId:player.playerId});
      if(room.hostId===player.playerId)this.cancelHostGrace(room);
      if(!room.game) this.transferHost(room);
      this.sessionEvent('reconnect-success',room,player.playerId);
      if(previousSocket&&previousSocket!==socketId)this.endSession(previousSocket,room,player.playerId,'replaced');
      return {ok:true};
    }
    if(request.action==='create'||request.action==='join') {
      if(this.identities.has(socketId)) return fail('既にルームへ参加しています');
      if(request.action==='join') {
        const room=this.rooms.get(request.roomCode);
        if(!room) return fail('ルームがありません');if(room.game) return fail('開始後は新規参加できません');if(room.players.size>=11) return fail('参加上限は11人です');
        if([...room.players.values()].some(p=>normalizeNickname(p.nickname)===normalizeNickname(request.nickname)))return fail(duplicateNicknameMessage);
        const credentials=this.addPlayer(room,socketId,request.nickname,request.preferredWardId);this.transferHost(room);
        return {ok:true,credentials};
      }
      let scenario:Scenario,datasetKind=request.datasetKind;
      try {
        if(request.scenario==='standard'){const loaded=this.standardScenario(diagnostic);scenario=loaded.scenario;datasetKind=loaded.datasetKind;}
        else scenario=compileScenario(this.datasets[datasetKind],request.config,false);
      }catch(error){return fail(error instanceof Error?error.message:'シナリオを読み込めません');}
      let code:string;do {code=Array.from(randomBytes(6),n=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[n%32]).join('');} while(this.rooms.has(code));
      const room:Room={code,hostId:'',map:scenario.map,scenario,datasetKind,players:new Map(),game:null};this.rooms.set(code,room);
      const credentials=this.addPlayer(room,socketId,request.nickname,request.preferredWardId);room.hostId=credentials.playerId;
      return {ok:true,credentials};
    }
    const room=this.roomForSocket(socketId),player=this.playerForSocket(socketId);
    if(!room||!player) return fail('先にルームへ参加してください');
    if(request.action==='kick'){
      if(room.game)return fail('開始後は参加者を退出させられません');
      if(room.hostId!==player.playerId)return fail('ホストだけが参加者を退出させられます');
      if(request.playerId===room.hostId)return fail('ホスト自身は退出させられません');
      const target=room.players.get(request.playerId);if(!target)return fail('参加者が見つかりません');
      room.players.delete(target.playerId);
      if(target.socketId){this.identities.delete(target.socketId);this.endSession(target.socketId,room,target.playerId,'kicked');}
      return {ok:true};
    }
    if(request.action==='scenario'||request.action==='standard-scenario') {
      if(room.game)return fail('開始後はシナリオを変更できません');if(room.hostId!==player.playerId)return fail('ホストだけが読み込めます');
      try {
        const loaded=request.action==='standard-scenario'?this.standardScenario(diagnostic):compileUploadedScenario(this.datasets,room.datasetKind,request.json,request.counts,diagnostic);
        // Complete preflight before replacing anything. Its existing start errors
        // remain visible in the lobby; no balance or start rule is changed.
        const preflight=validateScenarioForOnlinePlay(loaded.scenario.map,loaded.scenario.config,room.players.size,this.settings,loaded.scenario.report);
        diagnostic?.({stage:'room-preflight',counts:loaded.counts,compiledCounts:loaded.compiledCounts,datasetKind:loaded.datasetKind});
        if(preflight.enabledRegions!==loaded.compiledCounts.enabledRegions||preflight.totalSC!==loaded.compiledCounts.totalSC||preflight.totalStartingUnits!==loaded.compiledCounts.totalStartingUnits)
          return fail('アップロード設定とサーバーコンパイル結果が一致しません。');
        if(request.action==='scenario'){loaded.scenario.fileName=request.fileName;loaded.scenario.source='custom';}
        room.scenario=loaded.scenario;room.map=loaded.scenario.map;room.datasetKind=loaded.datasetKind;
        diagnostic?.({stage:'replaced',counts:loaded.counts,compiledCounts:loaded.compiledCounts,datasetKind:loaded.datasetKind});
        return {ok:true};
      }catch(error){return fail(error instanceof Error?error.message:'シナリオを読み込めません');}
    }
    if(request.action==='lobby-years') {
      if(room.game)return fail('開始後は規定年数を変更できません');
      if(room.hostId!==player.playerId)return fail('ホストだけが開始設定を変更できます');
      // Lobby display metadata only. Start still uses the existing explicit yearLimit request.
      room.lobbyMaxYears=request.yearLimit??this.settings.maxYears;return {ok:true};
    }
    if(request.action==='presentation-skipped') {
      const game=room.game;if(!game||game.state.presentation?.id!==request.presentationId)return fail('裁定結果が変わりました');
      const key=`${request.presentationId}:${player.playerId}`;
      if(!game.presentationSkips.has(key)){game.presentationSkips.add(key);game.matchLog=recordMatch(game.matchLog,room.map,game.state,this.now(),{type:'presentation-skipped'});}
      return {ok:true};
    }
    if(request.action==='export-log') {
      if(!room.game)return fail('開始後にログを保存できます');
      if(room.hostId!==player.playerId&&room.game.state.status!=='finished')return fail('進行中はホストだけが保存できます');
      return {ok:true,matchLog:exportMatchLog(room.game.matchLog)};
    }
    if(request.action==='leave') {
      if(room.game) return fail('開始後の退出は再接続を待つ切断として扱います');
      room.players.delete(player.playerId);this.identities.delete(socketId);
      if(room.hostId===player.playerId)this.cancelHostGrace(room);
      this.transferHost(room);if(!room.players.size) this.rooms.delete(room.code);return {ok:true};
    }
    if(request.action==='preference') {
      if(room.game) return fail('開始後は希望を変更できません');player.preferredWardId=request.preferredWardId;return {ok:true};
    }
    if(request.action==='start') {
      if(room.game) return fail('既に開始しています');if(room.hostId!==player.playerId) return fail('ホストだけが開始できます');
      const errors=this.startErrors(room);if(errors.length) return fail(...errors);
      const seed=this.eventOptions.seedFactory?.()??randomBytes(16).toString('hex'),allocation=assignWards([...room.players.values()],seed),participants=Object.values(allocation.playerWards);
      const maxYears=request.yearLimit??this.settings.maxYears;
      const state=createGameSession(room.map,createOnlineBoard(room.map,participants),participants,maxYears,victoryTarget(room.players.size,this.settings),{seed,settings:this.eventOptions.settings,requiredRivalInitialSupplyCentersForInstantWin:this.settings.requiredRivalInitialSupplyCentersForInstantWin});
      if(!state.ok) return fail(...state.errors);
      const matchLog=startMatchLog({gameId:randomUUID(),scenarioHash:room.scenario.hash,playerCount:room.players.size,wardAssignment:allocation.playerWards,players:[...room.players.values()].map(p=>({playerId:p.playerId,nickname:p.nickname,wardId:allocation.playerWards[p.playerId]})),inactiveWards:allocation.inactiveWards,rngSeed:seed,eventSettings:state.result.events.settings,victorySettings:{...this.settings,maxYears},victoryTargetSC:state.result.victoryTargetSC},room.map,state.result,this.now());
      room.game={...allocation,state:state.result,seed,activePlayerCount:room.players.size,phaseSerial:1,locked:false,lastResult:null,movementResolutions:0,presentationSkips:new Set(),matchLog};
      this.resolveReady(room);return {ok:true};
    }
    const game=room.game;
    if(!game||request.phaseKey!==this.phaseKey(room)||game.locked||game.state.phase==='finished') return fail('フェイズが変わりました。最新の盤面で入力してください');
    if(!this.required(room,player)) return fail('このフェイズの提出は不要です');
    if(request.action==='unready') {player.submission.finalized=false;return {ok:true};}
    if(player.submission.finalized) return fail('確定解除してから編集してください');
    const error=this.validateSubmission(room,player,request);
    if(error) return fail(...error);
    player.submission.finalized=request.finalize;
    if(request.finalize) {const timestamp=this.now();game.matchLog=recordMatch(game.matchLog,room.map,game.state,timestamp,{type:'player-finalized',playerId:player.playerId,elapsedSeconds:phaseElapsed(game.matchLog,game.state,timestamp),submittedOrderCount:request.action==='orders'?player.submission.orders.length:request.action==='retreats'?player.submission.retreats.length:player.submission.winter.buildRegionIds.length+player.submission.winter.disbandUnitIds.length});this.resolveReady(room);}
    return {ok:true};
  }
  private validateSubmission(room:Room,player:PlayerSession,request:Extract<OnlineRequest,{action:'orders'|'retreats'|'winter'}>):string[]|null {
    const game=room.game!,state=game.state,ward=game.playerWards[player.playerId];
    if(request.action==='orders') {
      if(state.phase!=='orders') return ['移動命令フェイズではありません'];
      const own=state.board.units.filter(u=>u.ownerWardId===ward);
      if(request.orders.some(o=>!own.some(u=>u.unitId===o.unitId))) return ['自軍の命令だけ編集できます'];
      const filled=state.board.units.map(u=>request.orders.find(o=>o.unitId===u.unitId)??{type:'hold' as const,unitId:u.unitId});
      if(new Set(request.orders.map(o=>o.unitId)).size!==request.orders.length) return ['命令が重複しています'];
      const checked=validateGameOrders(room.map,state,filled);
      if(!checked.ok) return checked.errors;
      player.submission.orders=structuredClone(request.finalize?filled.filter(o=>own.some(u=>u.unitId===o.unitId)):request.orders);
      const ownIds=new Set(own.map(u=>u.unitId));
      state.events={...state.events,reservations:[...state.events.reservations.filter(r=>!ownIds.has(r.unitId)),...player.submission.orders.flatMap(o=>o.type==='bicycle-move'||o.type==='deploy-barricade'?[{equipmentId:o.equipmentId,unitId:o.unitId,type:o.type==='bicycle-move'?'bicycle' as const:'barricade' as const}]:[])]};
      return null;
    }
    if(request.action==='retreats') {
      if(state.phase!=='retreats'||!state.movement) return ['撤退フェイズではありません'];
      const own=state.movement.dislodgedUnits.filter(d=>d.unit.ownerWardId===ward);
      if(request.orders.some(o=>!own.some(d=>d.unit.unitId===o.unitId))) return ['自軍の撤退だけ編集できます'];
      const supplemented=state.movement.dislodgedUnits.filter(d=>!own.includes(d)||(!request.finalize&&!request.orders.some(o=>o.unitId===d.unit.unitId))).map(d=>({type:'disband' as const,unitId:d.unit.unitId}));
      const checked=resolveRetreats(effectiveMap(room.map,state.events),state.movement,[...request.orders,...supplemented]);
      if(!checked.ok) return checked.errors.map(e=>e.message);
      player.submission.retreats=structuredClone(request.orders);return null;
    }
    if(state.phase!=='adjustments') return ['冬の増減員フェイズではありません'];
    const draft=request.draft,budget=winterBudget(room.map,state,ward);
    if(new Set(draft.buildRegionIds).size!==draft.buildRegionIds.length||new Set(draft.disbandUnitIds).size!==draft.disbandUnitIds.length) return ['冬の指定が重複しています'];
    if(draft.buildRegionIds.some(id=>!budget.buildRegionIds.includes(id))||draft.buildRegionIds.length>budget.buildCount) return ['増員数または空いた初期地点SCの指定が不正です'];
    if(draft.disbandUnitIds.some(id=>!state.board.units.some(u=>u.unitId===id&&u.ownerWardId===ward))) return ['自軍の解散だけ指定できます'];
    if(draft.disbandUnitIds.length>budget.disbandCount||(request.finalize&&draft.disbandUnitIds.length!==budget.disbandCount)) return [`必要解散数${budget.disbandCount}体を選んでください`];
    player.submission.winter=structuredClone(draft);return null;
  }
  private transferHost(room:Room) {
    if(this.hostGrace.has(room.code))return;
    if(room.players.get(room.hostId)?.socketId) return;
    const next=[...room.players.values()].filter(p=>p.socketId).sort((a,b)=>a.playerId.localeCompare(b.playerId))[0];
    if(next&&next.playerId!==room.hostId) {room.hostId=next.playerId;this.sessionEvent('host-transferred',room,next.playerId);}
  }
  disconnect(socketId:string) {
    const room=this.roomForSocket(socketId),player=this.playerForSocket(socketId);this.identities.delete(socketId);
    if(!room||!player||player.socketId!==socketId) return;
    player.socketId=null;this.sessionEvent('socket-disconnect',room,player.playerId);
    if(!room.game&&room.hostId===player.playerId&&!this.disposed&&!this.hostGrace.has(room.code)){
      const grace={playerId:player.playerId,deadline:Date.now()+hostReconnectGraceMs,timer:setTimeout(()=>{
        if(this.hostGrace.get(room.code)!==grace)return;
        this.hostGrace.delete(room.code);
        if(this.rooms.get(room.code)===room&&!room.game&&!room.players.get(grace.playerId)?.socketId)this.transferHost(room);
      },hostReconnectGraceMs)};
      grace.timer.unref();this.hostGrace.set(room.code,grace);this.sessionEvent('host-grace-start',room,player.playerId);
    }
  }
  /** Traverse only phases with no required input; each new Orders phase waits for players. */
  private resolveReady(room:Room) {
    const game=room.game!;
    while(game.state.phase!=='finished') {
      const required=[...room.players.values()].filter(p=>this.required(room,p));
      if(required.some(p=>!p.submission.finalized)) return;
      game.locked=true;
      try {
        const state=game.state,timestamp=this.now();
        game.matchLog=recordMatch(game.matchLog,room.map,state,timestamp,{type:'all-finalized',elapsedSeconds:phaseElapsed(game.matchLog,state,timestamp),submittedOrderCount:required.reduce((n,p)=>n+(state.phase==='orders'?p.submission.orders.length:state.phase==='retreats'?p.submission.retreats.length:p.submission.winter.buildRegionIds.length+p.submission.winter.disbandUnitIds.length),0)});
        const transition=(before:GameSessionState,after:GameSessionState,orders:GameOrder[]=[])=>{game.matchLog=logTransition(game.matchLog,room.map,before,after,timestamp,orders);return after;};
        if(state.phase==='orders') {
          const next=requireResult(adjudicateGameOrders(room.map,state,required.flatMap(p=>p.submission.orders)));
          game.lastResult={year:state.year,season:state.season,movement:next.movement,retreat:null,winter:null,scChanges:[]};
          game.state=transition(state,next,required.flatMap(p=>p.submission.orders));game.movementResolutions++;
        } else if(state.phase==='retreats') {
          const next=requireResult(adjudicateGameRetreats(room.map,state,required.flatMap(p=>p.submission.retreats)));
          if(game.lastResult) game.lastResult.retreat=next.retreatResult;
          transition(state,next);
          game.state=transition(next,requireResult(advanceGame(room.map,next)));
          game.state=transition(game.state,requireResult(advanceGame(room.map,game.state)));
          if(game.lastResult) game.lastResult.scChanges=game.state.scChanges;
        } else if(state.phase==='adjustments') {
          const next=requireResult(adjudicateGameWinter(room.map,state,{builds:required.flatMap(p=>p.submission.winter.buildRegionIds.map(regionId=>({regionId,ownerWardId:game.playerWards[p.playerId]}))),disbands:required.flatMap(p=>p.submission.winter.disbandUnitIds)}));
          // Keep movement/support/retreat log while adding the just resolved winter.
          game.lastResult={year:state.year,season:'winter',movement:game.lastResult?.movement??null,retreat:game.lastResult?.retreat??null,winter:next.winterResult,scChanges:game.lastResult?.scChanges??[]};
          transition(state,next);game.state=transition(next,requireResult(advanceGame(room.map,next)));
        } else throw new Error('未対応のオンラインフェイズです');
        game.phaseSerial++;for(const p of room.players.values()) p.submission=blank();
      } finally {game.locked=false;}
    }
  }
}

/** Explicit allowlist. Never serialize internal Room/Game/PlayerSession objects. */
export function serializePublicState(manager:RoomManager,room:Room,includeMap=true):PublicRoomView {
  const game=room.game,state=game?.state,preflight=manager.preflight(room);
  return publicRoomSchema.parse({roomCode:room.code,hostId:room.hostId,hostReconnectDeadline:manager.hostGraceDeadline(room),...(includeMap?{map:room.map}:{}),startErrors:game?[]:manager.startErrors(room),
    scenario:{scenarioId:room.scenario.id,scenarioName:room.scenario.name,scenarioHash:room.scenario.hash,fileName:room.scenario.fileName,source:room.scenario.source??(room.scenario.loaded?'custom':'editor'),loaded:room.scenario.loaded,enabledRegions:preflight.enabledRegions,totalSC:preflight.totalSC,totalStartingUnits:preflight.totalStartingUnits,errors:preflight.errors,warnings:preflight.warnings,maxYears:state?.maxYears??room.lobbyMaxYears??manager.configuredMaxYears()},
    players:[...room.players.values()].map(p=>{
      const wardId=game?.playerWards[p.playerId]??null,required=manager.required(room,p),finalized=p.submission.finalized;
      const eliminated=!!state?.end?.eliminated.some(e=>e.wardId===wardId);
      return {playerId:p.playerId,nickname:p.nickname,connected:!!p.socketId,host:p.playerId===room.hostId,wardId,required,finalized,eliminated,
        status:eliminated?'eliminated':!p.socketId?'disconnected':!required?'not-required':finalized?'finalized':'editing'};
    }),
    game:game&&state?{year:state.year,season:state.season,phase:state.phase,phaseKey:manager.phaseKey(room),board:state.board,seed:game.seed,
      status:state.status,maxYears:state.maxYears,endResult:state.endResult,summary:summarizeMatch(game.matchLog),
      playerWards:game.playerWards,inactiveWards:game.inactiveWards,activePlayerCount:game.activePlayerCount,victoryTargetSC:state.victoryTargetSC,presentation:state.presentation,requiredRivalInitialSupplyCentersForInstantWin:state.requiredRivalInitialSupplyCentersForInstantWin,rivalInitialSCByWard:Object.fromEntries(state.participants.map(w=>[w,conquestProgress(state,w).rivalInitialSC])),events:publicEvents(state.events),inventoryCounts:inventoryCounts(state.events,state.participants),end:state.end,lastResult:game.lastResult}:null});
}
export function serializePrivateState(manager:RoomManager,room:Room,player:PlayerSession):PrivatePlayerView {
  const game=room.game,wardId=game?.playerWards[player.playerId]??null,state=game?.state;
  return privatePlayerSchema.parse({playerId:player.playerId,preferredWardId:player.preferredWardId,wardId,phaseKey:manager.phaseKey(room),finalized:player.submission.finalized,
    orders:player.submission.orders,retreatOrders:player.submission.retreats,winterDraft:player.submission.winter??emptyWinter(),
    inventory:state?.events.inventory.filter(e=>e.ownerWardId===wardId)??[],reservations:state?.events.reservations.filter(r=>state.events.inventory.some(e=>e.equipmentId===r.equipmentId&&e.ownerWardId===wardId))??[],
    legalOrders:state?.phase==='orders'?Object.fromEntries(state.board.units.filter(u=>u.ownerWardId===wardId).map(u=>[u.unitId,legalGameOrders(room.map,state,u.unitId,player.submission.orders)])):{},
    retreatUnits:state?.phase==='retreats'?state.movement?.dislodgedUnits.filter(d=>d.unit.ownerWardId===wardId)??[]:[],
    winterBudget:state?.phase==='adjustments'&&wardId?winterBudget(room.map,state,wardId):null});
}
