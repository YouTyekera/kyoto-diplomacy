import { WARDS, type MapDefinition, type WardId } from '../shared/model';
import type { GameStatePreview } from '../shared/preview';
import gameSettings from '../../data/config/game-settings.json' with {type:'json'};
import { victorySettingsSchema } from '../shared/match';

export interface AssignmentPlayer { playerId:string; preferredWardId:WardId|null }
export interface Assignment { playerWards:Record<string,WardId>; inactiveWards:WardId[] }
export const defaultGameSettings = victorySettingsSchema.parse(gameSettings);
export function victoryTarget(count:number, settings:Pick<typeof defaultGameSettings,'baseVictoryTargetSC'|'referencePlayerCount'|'missingPlayerSCBonus'>=defaultGameSettings) {
  if(!Number.isSafeInteger(count)||count<3||count>11) throw new Error('正式ゲームは3～11人です');
  return settings.baseVictoryTargetSC+(settings.referencePlayerCount-count)*settings.missingPlayerSCBonus;
}
/** FNV-1a string seed + Mulberry32; deterministic across JS runtimes, not a security RNG. */
function seededRandom(seed:string) {
  let state=2166136261;
  for(const char of seed) state=Math.imul(state^char.charCodeAt(0),16777619);
  return () => {
    state=(state+0x6d2b79f5)|0;
    let value=Math.imul(state^(state>>>15),1|state);
    value^=value+Math.imul(value^(value>>>7),61|value);
    return ((value^(value>>>14))>>>0)/4294967296;
  };
}
export function assignWards(players:AssignmentPlayer[],seed:string):Assignment {
  if(players.length<3||players.length>11||new Set(players.map(p=>p.playerId)).size!==players.length) throw new Error('参加者は重複なしの3～11人です');
  const random=seededRandom(seed), wards=WARDS.map(w=>w.id).sort(), sorted=[...players].sort((a,b)=>a.playerId.localeCompare(b.playerId));
  const playerWards:Record<string,WardId>={};
  for(const ward of wards) {
    const requested=sorted.filter(p=>p.preferredWardId===ward);
    if(requested.length) playerWards[requested[requested.length===1?0:Math.floor(random()*requested.length)].playerId]=ward;
  }
  function shuffle<T>(values:T[]):T[] {
    for(let i=values.length-1;i>0;i--) {const j=Math.floor(random()*(i+1));[values[i],values[j]]=[values[j],values[i]];}
    return values;
  }
  const remaining=shuffle(sorted.filter(p=>!playerWards[p.playerId])), available=shuffle(wards.filter(w=>!Object.values(playerWards).includes(w)));
  remaining.forEach((p,i)=>{playerWards[p.playerId]=available[i];});
  return {playerWards,inactiveWards:wards.filter(w=>!Object.values(playerWards).includes(w)).sort()};
}
/** Formal start: independent of display Preview edits; geometry/adjacency are unchanged. */
export function createOnlineBoard(map:MapDefinition,activeWards:WardId[]):GameStatePreview {
  const active=new Set(activeWards), playable=map.regions.filter(r=>r.enabled&&r.playableGeometry);
  return {
    regionControl:Object.fromEntries(playable.map(r=>[r.regionId,{
      regionId:r.regionId,controllerWardId:active.has(r.wardId)?r.wardId:null,
      supplyCenterOwnerWardId:r.isSupplyCenter&&active.has(r.wardId)&&r.homeWardId===r.wardId?r.wardId:null,
    }])),
    units:playable.filter(r=>r.startingUnit&&active.has(r.startingUnit.ownerWardId)).map(r=>({
      unitId:`initial-${r.regionId}`,regionId:r.regionId,ownerWardId:r.startingUnit!.ownerWardId,type:'army' as const,
    })).sort((a,b)=>a.unitId.localeCompare(b.unitId)),
  };
}
