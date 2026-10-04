import { describe,it,expect,vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GameOver,resultHeading,endReasonLabels } from './GameOver';
import { metricsSchema,type EndResult } from '../../../packages/shared/match';
import { SfxManager,optionalSfxPaths } from './audio/sfx-manager';
import type { AudioPort } from './audio/audio-manager';
import { pickupRegions,winterUnitFeedback } from './GameFeel';
import type { GroundEquipment } from '../../../packages/shared/events';
const result:EndResult={reason:'max-years',year:5,season:'winter',winners:['26102'],standings:[{wardId:'26102',rank:1,supplyCenters:23,controlledRegions:30,units:8},{wardId:'26104',rank:2,supplyCenters:15,controlledRegions:22,units:6},{wardId:'26111',rank:3,supplyCenters:0,controlledRegions:2,units:0}],eliminated:[{wardId:'26111',reasons:['zero-sc']}]};
const summary=metricsSchema.parse({averageOrdersSeconds:10,ordersPhases:2,standoffs:1,dislodgements:0,eventCounts:{bicycle:1,barricade:0,roadwork:0,bus:0},bicyclePickups:1,bicycleUses:0,barricadePickups:0,barricadeUses:0,barricadeDeployments:0});
describe('Phase 5C personalized results',()=>{
 it('本人が単独勝者なら勝利',()=>expect(resultHeading(result,'26102')).toBe('勝利'));
 it('共同勝者は共同勝利',()=>expect(resultHeading({...result,winners:['26102','26104']},'26104')).toBe('共同勝利'));
 it('非勝者はサーバーの順位をそのまま表示',()=>expect(resultHeading(result,'26104')).toBe('第2位'));
 it('脱落者にも最終順位がある',()=>expect(resultHeading(result,'26111')).toBe('第3位'));
 it('観戦・担当勢力不明は対局終了',()=>{expect(resultHeading(result)).toBe('対局終了');expect(resultHeading(result,'26101')).toBe('対局終了');});
 it('全員の統計・順位を保持しGAME OVER大見出しを含まない',()=>{const html=renderToStaticMarkup(createElement(GameOver,{result,summary,target:23,currentPlayerWardId:'26102',onDownload:()=>{}}));expect(html).toContain('勝利');expect(html).toContain('最終順位');expect(html).toContain('対局結果');expect(html).not.toContain('GAME OVER');expect(html).toContain('試遊ログをダウンロード');});
 it('終了理由を自然文にする',()=>expect(endReasonLabels).toEqual({'supply-target':'勝利条件達成','elimination-final-year':'脱落発生により終了','max-years':'規定年数終了'}));
});
describe('Phase 5C winter unit feedback',()=>{
 const unit={unitId:'army',type:'army' as const,ownerWardId:'26102' as const,regionId:'a'};
 it('撤退で軍が盤面に戻ってもBuild演出にはしない',()=>expect(winterUnitFeedback([],[unit])).toEqual({built:[],removed:[]}));
 it('戦闘で排除された軍を冬Disbandの演出にはしない',()=>expect(winterUnitFeedback([unit],[])).toEqual({built:[],removed:[]}));
 it('実際の冬結果にあるBuildとDisbandだけを表示する',()=>{const built={...unit,unitId:'new'};expect(winterUnitFeedback([unit],[built],{builtUnits:[built],disbandedUnitIds:[unit.unitId]})).toEqual({built:['new'],removed:[unit]});});
});
describe('Phase 5C optional sound slots',()=>{
 it('7slotはローカルWAVで外部音源を参照しない',()=>{expect(Object.keys(optionalSfxPaths)).toHaveLength(7);for(const src of Object.values(optionalSfxPaths))expect(src).toMatch(/^\/audio\/sfx\/.*\.wav$/);});
 it('未配置・再生拒否は無音となり同じ失敗を連続再試行しない',async()=>{const create=vi.fn(()=>({volume:0,loop:false,onerror:null,play:()=>Promise.reject(Error('404')),pause:vi.fn()}));const manager=new SfxManager({enabled:true,volume:70},create);manager.playCue('select');await Promise.resolve();await Promise.resolve();manager.playCue('select');expect(create).toHaveBeenCalledTimes(1);manager.dispose();});
 it('OFFとdisposeは効果音を停止し遅延playを復活させない',async()=>{let complete:()=>void=()=>{};const audio:AudioPort={volume:0,loop:false,onerror:null,play:()=>new Promise<void>(resolve=>{complete=resolve;}),pause:vi.fn()};const manager=new SfxManager({enabled:true,volume:70},()=>audio);manager.playCue('victory');manager.setSettings({enabled:false,volume:70});complete();await Promise.resolve();expect(audio.pause).toHaveBeenCalled();manager.dispose();});
});
describe('Phase 5C equipment pickup feedback',()=>{
 const ground:GroundEquipment[]=[{equipmentId:'own-bike',type:'bicycle',regionId:'a',spawnedYear:1,spawnedSeason:'spring'},{equipmentId:'enemy-bike',type:'bicycle',regionId:'b',spawnedYear:1,spawnedSeason:'spring'}];
 const units=[{unitId:'own',type:'army' as const,ownerWardId:'26102' as const,regionId:'a'},{unitId:'enemy',type:'army' as const,ownerWardId:'26104' as const,regionId:'b'},{unitId:'unrelated-move',type:'army' as const,ownerWardId:'26102' as const,regionId:'c'}];
 it('取得した公開装備の地点だけを表示し敵軍・他の移動軍を除く',()=>expect(pickupRegions(ground,[],units,'26102')).toEqual(['a']));
 it('地面に残っている装備には取得表示を付けない',()=>expect(pickupRegions(ground,ground,units,'26102')).toEqual([]));
 it('全勢力操作のローカルでは実際の両方の取得地点を表示する',()=>expect(pickupRegions(ground,[],units,null)).toEqual(['a','b']));
});

