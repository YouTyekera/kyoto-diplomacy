import {afterEach,expect,it,vi} from 'vitest';
import {SfxManager} from './audio/sfx-manager';
afterEach(()=>vi.unstubAllGlobals());
it('合成ほら貝は3倍音・1回、SE OFF/音量/欠落Web Audioでゲームに例外を返さない',async()=>{
  const starts=vi.fn(),gains:{gain:{value:number;setValueAtTime:ReturnType<typeof vi.fn>;linearRampToValueAtTime:ReturnType<typeof vi.fn>;exponentialRampToValueAtTime:ReturnType<typeof vi.fn>};connect:ReturnType<typeof vi.fn>;disconnect:ReturnType<typeof vi.fn>}[]=[];
  class Context {state='running';currentTime=0;destination={};resume=vi.fn().mockResolvedValue(undefined);close=vi.fn().mockResolvedValue(undefined);createGain(){const node={gain:{value:1,setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn(),exponentialRampToValueAtTime:vi.fn()},connect:vi.fn(),disconnect:vi.fn()};gains.push(node);return node;}createOscillator(){return {type:'sine',frequency:{setValueAtTime:vi.fn(),exponentialRampToValueAtTime:vi.fn()},connect:vi.fn(),disconnect:vi.fn(),start:starts,stop:vi.fn(),onended:null};}}
  vi.stubGlobal('AudioContext',Context);const sfx=new SfxManager({enabled:true,volume:50});await sfx.playHorn();expect(starts).toHaveBeenCalledTimes(3);expect(gains[1].gain.value).toBe(.06);sfx.setSettings({enabled:true,volume:100});expect(gains[1].gain.value).toBe(.12);sfx.setSettings({enabled:false,volume:100});expect(gains[1].gain.value).toBe(0);await sfx.playHorn();expect(starts).toHaveBeenCalledTimes(3);sfx.dispose();
  vi.stubGlobal('AudioContext',undefined);const unavailable=new SfxManager({enabled:true,volume:50});await expect(unavailable.playHorn()).resolves.toBeUndefined();unavailable.dispose();
});
