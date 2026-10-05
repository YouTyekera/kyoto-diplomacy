import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { AudioManager, readMusicSettings, defaultMusicSettings, musicStorageKey, type MusicSettings } from './audio-manager';
import { bgmManifest, type BgmContext } from './bgm-manifest';
import { SfxManager,readSfxSettings,sfxStorageKey,type SfxSettings } from './sfx-manager';
import { sfxManifest } from './sfx-manifest';
import type { SfxCue } from './sfx-manager';

interface AudioState { manager: AudioManager; settings: MusicSettings; blocked: boolean; change: (settings: MusicSettings) => void; sfx:SfxManager;sfxSettings:SfxSettings;changeSfx:(value:SfxSettings)=>void }
const AudioContext = createContext<AudioState | null>(null);
export function AudioProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(() => { try { return readMusicSettings(localStorage); } catch { return defaultMusicSettings; } });
  const [, refresh] = useState(0);
  const [sfxSettings,setSfxSettings]=useState(()=>{try{return readSfxSettings(localStorage);}catch{return {enabled:true,volume:70};}});
  const [sfx]=useState(()=>new SfxManager(sfxSettings));
  const [manager] = useState(() => new AudioManager(bgmManifest, settings, undefined, () => refresh(v => v + 1)));
  useEffect(() => {
    // Trusted interaction only. A blocked playback can be retried with the music button.
    const unlock = (event: Event) => {
      if (!event.isTrusted) return;
      document.removeEventListener('pointerdown', unlock); document.removeEventListener('keydown', unlock);
      manager.unlock();
      sfx.unlock();
    };
    document.addEventListener('pointerdown', unlock, { once: true });
    document.addEventListener('keydown', unlock, { once: true });
    return () => { document.removeEventListener('pointerdown', unlock); document.removeEventListener('keydown', unlock); manager.dispose();sfx.dispose(); };
  }, [manager,sfx]);
  function change(value: MusicSettings) {
    const next = { enabled: value.enabled, volume: Math.max(0, Math.min(100, value.volume)) };
    setSettings(next); manager.setSettings(next);
    try { localStorage.setItem(musicStorageKey, JSON.stringify(next)); } catch { /* Settings still work without storage. */ }
  }
  function changeSfx(value:SfxSettings){const next={enabled:value.enabled,volume:Math.max(0,Math.min(100,value.volume))};setSfxSettings(next);sfx.setSettings(next);try{localStorage.setItem(sfxStorageKey,JSON.stringify(next));}catch{/* Settings still apply. */}}
  return <AudioContext.Provider value={{ manager, settings, change, blocked: manager.blocked,sfx,sfxSettings,changeSfx }}>{children}</AudioContext.Provider>;
}
export function useAudio() { const value = useContext(AudioContext); if (!value) throw new Error('AudioProvider is required'); return value; }
export function useBgm(context: BgmContext) {
  const { manager } = useAudio();
  useEffect(() => { manager.setContext(context); document.documentElement.dataset.bgmContext = context; }, [manager, context]);
}
export function AudioSettings({ compact = false }: { compact?: boolean }) {
  const { settings, change, manager, blocked,sfxSettings,changeSfx,sfx } = useAudio();
  const controls = <><button aria-label="BGM ON/OFF" aria-pressed={settings.enabled} onClick={() => { manager.unlock(); change({ ...settings, enabled: settings.enabled && blocked || !settings.enabled }); }}>音楽 {settings.enabled ? blocked ? 'ON（再生待ち）' : 'ON' : 'OFF'}</button>
    <label>BGM音量 {settings.volume}<input aria-label="BGM音量" type="range" min="0" max="100" value={settings.volume} onChange={e => change({ ...settings, volume: Number(e.target.value) })} /></label>
    <button aria-label="効果音 ON/OFF" aria-pressed={sfxSettings.enabled} onClick={()=>changeSfx({...sfxSettings,enabled:!sfxSettings.enabled})}>効果音 {sfxSettings.enabled?'ON':'OFF'}</button>
    <label>効果音音量 {sfxSettings.volume}<input aria-label="効果音音量" type="range" min="0" max="100" value={sfxSettings.volume} onChange={e=>changeSfx({...sfxSettings,volume:Number(e.target.value)})}/></label>
    <details className="sfx-preview"><summary>効果音を試す</summary><div className="sfx-preview-buttons">{(Object.keys(sfxManifest) as SfxCue[]).map(cue=><button key={cue} disabled={!sfxSettings.enabled||sfxSettings.volume===0} onClick={()=>sfx.playCue(cue)} aria-label={`効果音を試す: ${sfxManifest[cue].label}`}>{sfxManifest[cue].label}</button>)}</div></details>
    <button disabled={!sfxSettings.enabled||sfxSettings.volume===0} onClick={()=>void sfx.playHorn()}>全員確定の合図を試す</button>
    {!compact && <p className="hint">仮効果音を同梱しています。未設定の曲や再生できない音は無音で続行します。</p>}</>;
  return compact ? <details className="audio-settings"><summary>音量・設定</summary>{controls}</details> : <section className="audio-settings" aria-label="音楽設定">{controls}</section>;
}
