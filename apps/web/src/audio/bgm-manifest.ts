export type BgmContext = 'title' | 'lobby' | 'game' | 'result' | 'domestic' | 'adjudication';
export interface BgmTrack { id: string; src: string; loop: boolean; defaultVolume: number }
// Put your own audio in public/audio/bgm/, then set src to /audio/bgm/<filename>.
// Empty slots stay silent. No music files are bundled with this project.
export const bgmManifest: Record<BgmContext, BgmTrack> = {
  title: { id: 'title-main', src: '', loop: true, defaultVolume: 0.45 },
  lobby: { id: 'lobby-main', src: '', loop: true, defaultVolume: 0.45 },
  game: { id: 'game-main', src: '', loop: true, defaultVolume: 0.45 },
  result: { id: 'result-main', src: '', loop: true, defaultVolume: 0.45 },
  domestic: { id: 'domestic', src: '/audio/bgm/domestic.mp3', loop: true, defaultVolume: 0.45 },
  adjudication: { id: 'adjudication', src: '/audio/bgm/adjudication.mp3', loop: true, defaultVolume: 0.45 },
};
