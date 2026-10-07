import type { BgmContext, BgmTrack } from './bgm-manifest';

export interface MusicSettings { enabled: boolean; volume: number }
export const musicStorageKey = 'kyoto-music-v1';
export const defaultMusicSettings: MusicSettings = { enabled: true, volume: 5 };
export function readMusicSettings(storage: Pick<Storage, 'getItem'>): MusicSettings {
  try {
    const value = JSON.parse(storage.getItem(musicStorageKey) ?? 'null');
    if (typeof value?.enabled === 'boolean' && typeof value.volume === 'number' && Number.isFinite(value.volume))
      return { enabled: value.enabled, volume: Math.max(0, Math.min(100, value.volume)) };
  } catch { /* Storage can be unavailable in private/embedded browsing. */ }
  return { ...defaultMusicSettings };
}
export interface AudioPort {
  volume: number; loop: boolean; onerror: HTMLMediaElement['onerror'];
  play: () => Promise<void>; pause: () => void;
}
interface Voice { audio: AudioPort; track: BgmTrack; gain: number; target: number }

/** One manager survives all screens; seasons and command phases never select a new track. */
export class AudioManager {
  context: BgmContext = 'title';
  blocked = false;
  private unlocked = false;
  private active: Voice | null = null;
  private voices = new Set<Voice>();
  private cache = new Map<string,AudioPort>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private generation = 0;
  constructor(private manifest: Record<BgmContext, BgmTrack>, private settings: MusicSettings,
    private createAudio: (src: string) => AudioPort = src => new Audio(src), private changed: () => void = () => {}) {}

  setContext(context: BgmContext) {
    if (context === this.context) return;
    this.context = context;
    const track = this.manifest[context];
    if (this.active?.track.src && this.active.track.src === track.src) return;
    this.generation++;
    if (this.active) this.active.target = 0;
    this.active = null;
    this.start(); this.fade();
  }
  unlock() {
    if (this.unlocked && !this.blocked) return;
    this.unlocked = true; this.blocked = false;
    if (this.active) this.play(this.active); else this.start();
    this.changed();
  }
  setSettings(settings: MusicSettings) {
    const wasEnabled = this.settings.enabled;
    this.settings = settings;
    for (const voice of this.voices) this.volume(voice);
    if (!settings.enabled) for (const voice of this.voices) voice.audio.pause();
    else if (this.unlocked && !wasEnabled) { if (this.active) this.play(this.active); else this.start(); }
  }
  private start() {
    const track = this.manifest[this.context];
    if (!this.unlocked || !this.settings.enabled || !track.src) return;
    try {
      const existing=[...this.voices].find(v=>v.track.src===track.src);
      if(existing){existing.target=1;this.active=existing;this.blocked=false;this.changed();this.fade();return;}
      const audio = this.cache.get(track.src)??this.createAudio(track.src);
      this.cache.set(track.src,audio);
      const voice: Voice = { audio, track, gain: 0, target: 1 };
      audio.loop = track.loop; audio.volume = 0;
      audio.onerror = () => this.failed(voice);
      this.active = voice; this.voices.add(voice);
      this.play(voice); this.fade();
    } catch { this.blocked = true; this.changed(); }
  }
  private play(voice: Voice) {
    const generation = this.generation;
    try {
      void voice.audio.play().then(() => {
        // A previous screen may have completed its play promise after being removed.
        if (!this.voices.has(voice)) voice.audio.pause();
        else if (generation === this.generation && voice === this.active) { this.blocked = false; this.changed(); }
      }).catch(() => { if (voice === this.active) this.failed(voice); });
    } catch { this.failed(voice); }
  }
  private failed(voice: Voice) {
    this.cache.delete(voice.track.src);
    voice.audio.pause(); voice.audio.onerror = null; this.voices.delete(voice);
    if (this.active === voice) { this.active = null; this.blocked = true; this.changed(); }
  }
  private volume(voice: Voice) {
    voice.audio.volume = this.settings.enabled ? Math.max(0, Math.min(1, voice.track.defaultVolume * this.settings.volume / 100 * voice.gain)) : 0;
  }
  private fade() {
    if (this.timer) return;
    // 10 steps of 90ms: a 0.9 second crossfade, including fade to an empty slot.
    this.timer = setInterval(() => {
      let unfinished = false;
      for (const voice of this.voices) {
        voice.gain = voice.target > voice.gain ? Math.min(voice.target, voice.gain + 0.1) : Math.max(voice.target, voice.gain - 0.1);
        if (Math.abs(voice.gain - voice.target) < 0.001) voice.gain = voice.target;
        this.volume(voice);
        if (voice.target === 0 && voice.gain === 0) { voice.audio.pause(); voice.audio.onerror = null; this.voices.delete(voice); }
        else if (Math.abs(voice.gain - voice.target) > 0.001) unfinished = true;
      }
      if (!unfinished && this.timer) { clearInterval(this.timer); this.timer = null; }
    }, 90);
  }
  dispose() {
    this.generation++;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const voice of this.voices) { voice.audio.pause(); voice.audio.onerror = null; }
    this.voices.clear(); this.active = null;
    for(const audio of this.cache.values())audio.pause();this.cache.clear();
  }
}
