import type { AudioPort } from './audio-manager';
import { sfxManifest } from './sfx-manifest';
export interface SfxSettings { enabled:boolean;volume:number }
export const sfxStorageKey='kyoto-sfx-v1';
export const optionalSfxPaths={select:sfxManifest.select.src,'order-confirm':sfxManifest['order-confirm'].src,march:sfxManifest.march.src,'sc-capture':sfxManifest['sc-capture'].src,'support-success':sfxManifest['support-success'].src,standoff:sfxManifest.standoff.src,victory:sfxManifest.victory.src} as const;
export type SfxCue=keyof typeof optionalSfxPaths;
export function readSfxSettings(storage:Pick<Storage,'getItem'>):SfxSettings {
  try{const v=JSON.parse(storage.getItem(sfxStorageKey)??'null');if(typeof v?.enabled==='boolean'&&Number.isFinite(v.volume))return {enabled:v.enabled,volume:Math.max(0,Math.min(100,v.volume))};}catch{/* Silent fallback. */}
  return {enabled:true,volume:70};
}
/** One grouped loop per slide stage. Late play promises cannot resurrect a stopped sound. */
export class SfxManager {
  private horn:AudioContext|null=null;
  private hornOutput:GainNode|null=null;
  private audio:AudioPort|null=null;private generation=0;private sliding=false;
  private cues=new Map<SfxCue,AudioPort>();private unavailable=new Set<SfxCue>();private cueGeneration=0;
  constructor(private settings:SfxSettings,private createAudio:(src:string)=>AudioPort=src=>new Audio(src)){}
  setSliding(sliding:boolean){if(sliding===this.sliding)return;this.sliding=sliding;if(sliding)this.start();else this.stop();}
  setSettings(settings:SfxSettings){this.settings=settings;if(this.hornOutput)this.hornOutput.gain.value=settings.enabled?settings.volume/100*.12:0;if(!settings.enabled){this.stop();this.stopCues();}else if(this.sliding&&!this.audio)this.start();if(this.audio)this.audio.volume=settings.volume/100*.45;for(const audio of this.cues.values())audio.volume=settings.volume/100*.45;}
  unlock(){try{this.horn??=new AudioContext();void this.horn.resume().catch(()=>{});}catch{/* Web Audio is optional. */}}
  playCue(cue:SfxCue){
    if(!this.settings.enabled||this.unavailable.has(cue))return;
    const generation=this.cueGeneration;
    try{const audio=this.cues.get(cue)??this.createAudio(optionalSfxPaths[cue]);this.cues.set(cue,audio);audio.pause();if('currentTime'in audio)audio.currentTime=0;audio.loop=false;audio.volume=this.settings.volume/100*.45;
      const failed=()=>{audio.pause();audio.onerror=null;this.cues.delete(cue);this.unavailable.add(cue);};audio.onerror=failed;
      void audio.play().then(()=>{if(generation!==this.cueGeneration)audio.pause();}).catch(failed);
    }catch{this.unavailable.add(cue);}
  }
  /** Locally synthesized conch-like cue: no third-party media or writes to public/audio. */
  async playHorn(){
    if(!this.settings.enabled||this.settings.volume===0)return;
    try{
      const context=this.horn??new AudioContext();this.horn=context;await context.resume();
      if(!this.settings.enabled||context.state!=='running')return;
      const now=context.currentTime,gain=context.createGain();
      if(!this.hornOutput){this.hornOutput=context.createGain();this.hornOutput.connect(context.destination);}this.hornOutput.gain.value=this.settings.volume/100*.12;gain.connect(this.hornOutput);
      gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(1,now+.12);gain.gain.exponentialRampToValueAtTime(.0001,now+1.25);
      let remaining=3;
      for(const [frequency,weight]of [[174,1],[348,.3],[522,.12]]){const oscillator=context.createOscillator(),part=context.createGain();oscillator.type='sine';oscillator.frequency.setValueAtTime(frequency*.9,now);oscillator.frequency.exponentialRampToValueAtTime(frequency,now+.25);part.gain.value=weight;oscillator.connect(part);part.connect(gain);oscillator.start(now);oscillator.stop(now+1.3);oscillator.onended=()=>{oscillator.disconnect();part.disconnect();if(--remaining===0)gain.disconnect();};}
    }catch{/* Unsupported/blocked audio must never affect game state or user settings. */}
  }
  private stopCues(){this.cueGeneration++;for(const audio of this.cues.values()){audio.pause();audio.onerror=null;}this.cues.clear();}
  private start(){if(this.audio||!this.settings.enabled)return;const generation=++this.generation;
    try{const audio=this.createAudio(sfxManifest.march.src);this.audio=audio;audio.loop=true;audio.volume=this.settings.volume/100*.45;audio.onerror=()=>{if(this.audio===audio)this.stop();};void audio.play().then(()=>{if(generation!==this.generation)audio.pause();}).catch(()=>{if(this.audio===audio)this.stop();});}catch{this.stop();}}
  stop(){this.generation++;if(this.audio){this.audio.pause();this.audio.onerror=null;}this.audio=null;}
  dispose(){this.sliding=false;this.stop();this.stopCues();void this.horn?.close().catch(()=>{});this.horn=null;this.hornOutput=null;}
}
