import { describe,it,expect,vi } from 'vitest';
import { rightClickOrder,supportChoices } from './BottomActionBar';
import { moveFraction,presentationPosition } from './AdjudicationPresentation';
import type { ResolutionPresentation } from '../../../packages/game-core/model';
import { SfxManager,readSfxSettings } from './audio/sfx-manager';
import { AudioManager,type AudioPort } from './audio/audio-manager';
import { bgmManifest } from './audio/bgm-manifest';
import type { GameOrder } from '../../../packages/shared/events';
const moves:GameOrder[]=[{type:'move',unitId:'a',destination:'b'},{type:'support-hold',unitId:'a',targetUnitId:'c'},{type:'support-move',unitId:'a',targetUnitId:'c',destination:'b'}];
describe('Phase 5B input/presentation',()=>{
  it('右クリックは通常選択・合法候補のみ登録し、不正・確定・wizardでは変更しない',()=>{expect(rightClickOrder(moves,'b',null,false)).toBe(moves[0]);for(const action of ['support','support-move','bicycle-move','deploy-barricade'] as const)expect(rightClickOrder(moves,'b',action,false)).toBeUndefined();expect(rightClickOrder(moves,'invalid',null,false)).toBeUndefined();expect(rightClickOrder(moves,'b',null,true)).toBeUndefined();});
  it('支援候補は既存の合法Hold/Moveだけで、対象外の軍や行先を追加しない',()=>{expect(supportChoices(moves,'c')).toEqual(moves.slice(1));expect(supportChoices(moves,'foreign-invalid')).toEqual([]);});
  it('失敗Moveは40%まで進み戻り、成功Moveは最終位置に到達',()=>{expect(moveFraction(.5,false)).toBe(.4);expect(moveFraction(1,false)).toBe(0);expect(moveFraction(1,true)).toBe(1);});
  it('自転車第2区間失敗なら経由地に戻り、reduced motionは確定位置を表示',()=>{
    const snapshot={before:[{unitId:'u',regionId:'a'}],after:[{unitId:'u',regionId:'b'}],orders:[{unitId:'u',type:'bicycle-move',viaRegionId:'b',destination:'c'}],movement:{orderResults:[],equipmentResults:[{unitId:'u',firstLeg:{status:'success'},secondLeg:{status:'fail'}}],dislodgedUnits:[]}} as unknown as ResolutionPresentation;
    const point=(id:string)=>[id==='a'?0:id==='b'?10:20,0];
    expect(presentationPosition(snapshot,'u',1200,point)).toEqual([10,0]);expect(presentationPosition(snapshot,'u',1600,point)).toEqual([14,0]);expect(presentationPosition(snapshot,'u',2000,point)).toEqual([10,0]);expect(presentationPosition(snapshot,'u',700,point,true)).toEqual([10,0]);
  });
});
describe('Phase 5B grouped audio',()=>{
  it('slide中は1音声だけ、音量変更は再生成せずskip/endで停止',async()=>{
    const audios:AudioPort[]=[];const manager=new SfxManager({enabled:true,volume:70},()=>{const a={volume:0,loop:false,onerror:null,play:vi.fn().mockResolvedValue(undefined),pause:vi.fn()};audios.push(a);return a;});
    manager.setSliding(true);manager.setSliding(true);expect(audios).toHaveLength(1);expect(audios[0].loop).toBe(true);manager.setSettings({enabled:true,volume:100});expect(audios[0].volume).toBe(.45);manager.setSliding(false);await Promise.resolve();expect(audios[0].pause).toHaveBeenCalled();manager.dispose();
  });
  it('OFF・404・autoplay拒否・壊れた保存設定でも継続できる',async()=>{expect(readSfxSettings({getItem:()=>'{'})).toEqual({enabled:true,volume:70});const manager=new SfxManager({enabled:false,volume:70},()=>{throw Error('404');});manager.setSliding(true);manager.setSettings({enabled:true,volume:70});expect(()=>manager.dispose()).not.toThrow();const blocked=new SfxManager({enabled:true,volume:70},()=>({volume:0,loop:false,onerror:null,play:()=>Promise.reject(Error('NotAllowed')),pause:()=>{}}));blocked.setSliding(true);await Promise.resolve();blocked.dispose();});
  it('domestic同一フェイズの再生継続・裁定crossfade後も同じAudio位置へ復帰',async()=>{
    vi.useFakeTimers();const audios:(AudioPort&{currentTime:number})[]=[];
    const manager=new AudioManager(bgmManifest,{enabled:true,volume:70},()=>{const a={currentTime:91,volume:0,loop:false,onerror:null,play:vi.fn().mockResolvedValue(undefined),pause:vi.fn()};audios.push(a);return a;});
    manager.setContext('domestic');manager.unlock();manager.setContext('domestic');expect(audios).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1000);manager.setContext('adjudication');await vi.advanceTimersByTimeAsync(1000);manager.setContext('domestic');await vi.advanceTimersByTimeAsync(1000);expect(audios).toHaveLength(2);expect(audios[0].currentTime).toBe(91);manager.dispose();vi.useRealTimers();
  });
});
