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
  private audio:AudioPort|null=null;private generation=0;private sliding=false;
  private cues=new Map<SfxCue,AudioPort>();private unavailable=new Set<SfxCue>();private cueGeneration=0;
  constructor(private settings:SfxSettings,private createAudio:(src:string)=>AudioPort=src=>new Audio(src)){}
  setSliding(sliding:boolean){if(sliding===this.sliding)return;this.sliding=sliding;if(sliding)this.start();else this.stop();}
  setSettings(settings:SfxSettings){this.settings=settings;if(!settings.enabled){this.stop();this.stopCues();}else if(this.sliding&&!this.audio)this.start();if(this.audio)this.audio.volume=settings.volume/100*.45;for(const audio of this.cues.values())audio.volume=settings.volume/100*.45;}
  playCue(cue:SfxCue){
    if(!this.settings.enabled||this.unavailable.has(cue))return;
    const generation=this.cueGeneration;
    try{const audio=this.cues.get(cue)??this.createAudio(optionalSfxPaths[cue]);this.cues.set(cue,audio);audio.pause();if('currentTime'in audio)audio.currentTime=0;audio.loop=false;audio.volume=this.settings.volume/100*.45;
      const failed=()=>{audio.pause();audio.onerror=null;this.cues.delete(cue);this.unavailable.add(cue);};audio.onerror=failed;
      void audio.play().then(()=>{if(generation!==this.cueGeneration)audio.pause();}).catch(failed);
    }catch{this.unavailable.add(cue);}
  }
  private stopCues(){this.cueGeneration++;for(const audio of this.cues.values()){audio.pause();audio.onerror=null;}this.cues.clear();}
  private start(){if(this.audio||!this.settings.enabled)return;const generation=++this.generation;
    try{const audio=this.createAudio(sfxManifest.march.src);this.audio=audio;audio.loop=true;audio.volume=this.settings.volume/100*.45;audio.onerror=()=>{if(this.audio===audio)this.stop();};void audio.play().then(()=>{if(generation!==this.generation)audio.pause();}).catch(()=>{if(this.audio===audio)this.stop();});}catch{this.stop();}}
  stop(){this.generation++;if(this.audio){this.audio.pause();this.audio.onerror=null;}this.audio=null;}
  dispose(){this.sliding=false;this.stop();this.stopCues();}
}
