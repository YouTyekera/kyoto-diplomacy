import type { MapDefinition, WardId } from '../shared/model';
import type { GameStatePreview } from '../shared/preview';
import type { AdjudicationResult, RetreatResult, Unit } from '../rules-core';
import type { EventState, EquipmentResult } from '../shared/events';
import type { EndResult } from '../shared/match';

export interface GameMovement extends AdjudicationResult { equipmentResults:EquipmentResult[] }

export type Season = 'spring' | 'autumn' | 'winter';
export type GamePhase = 'orders' | 'retreats' | 'sc-update' | 'adjustments' | 'end-of-year' | 'finished';
export interface SCChange { regionId:string; previous:WardId|null; owner:WardId|null }
export interface Elimination { wardId:WardId; reasons:('zero-sc'|'zero-non-sc')[] }
export interface GameEnd {
  reason:'victory'|'elimination'|'year-limit'; finalYear:number;
  winnerWardId:WardId|null; candidateWardIds:WardId[]; tieUnresolved:boolean; eliminated:Elimination[];
}
export interface WinterOrders { builds:{ownerWardId:WardId;regionId:string}[]; disbands:string[] }
export interface WinterResult { builtUnits:Unit[]; disbandedUnitIds:string[] }
/** Annual local session; never stored in MapDefinition, map config or Preview JSON. */
export interface GameSessionState {
  version:1; year:number; season:Season; phase:GamePhase; status:'playing'|'finished'; endResult:EndResult|null; maxYears:number;
  board:GameStatePreview; participants:WardId[]; homeBuildRegionIds:Record<string,string[]>;
  yearLimit:number|null; nextUnitSerial:number; victoryTargetSC:number;
  initialSupplyOwners:Record<string,WardId|null>;
  requiredRivalInitialSupplyCentersForInstantWin:number;
  presentation:ResolutionPresentation|null;
  movement:GameMovement|null; retreatResolved:boolean; retreatResult:RetreatResult|null;
  events:EventState;
  scChanges:SCChange[]; winterResult:WinterResult|null; end:GameEnd|null;
}
export type ResolvedPublicOrder = import('../shared/events').GameOrder extends infer O ? O extends {equipmentId:string} ? Omit<O,'equipmentId'> : O : never;
export interface ResolutionPresentation {
  id:string; year:number; season:'spring'|'autumn';
  before:Unit[]; after:Unit[]; orders:ResolvedPublicOrder[]; movement:GameMovement;
}
export interface SessionBundle { map:MapDefinition; state:GameSessionState }
export type GameResponse<T=GameSessionState> = {ok:true;result:T}|{ok:false;errors:string[]};
