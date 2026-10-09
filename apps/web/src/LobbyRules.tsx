import { useState } from 'react';
import type { OnlineRequest, OnlineResponse, PublicRoomView, PrivatePlayerView } from '../../../packages/shared/online';

// Keep this URL in sync with the checked-in static file in apps/web/public/rules/.
export const guideUrl = `${import.meta.env.BASE_URL}rules/${encodeURIComponent('ディプロマシールール説明.pdf')}`;

export function LobbyRules({ room, self, locked, request }: {
  room: PublicRoomView;
  self: PrivatePlayerView | null;
  locked: boolean;
  request: (value: OnlineRequest) => Promise<OnlineResponse>;
}) {
  const [open, setOpen] = useState(false);
  const me = room.players.find(p => p.playerId === self?.playerId);
  const readCount = room.players.filter(p => p.rulesRead).length;
  return <section className="lobby-rules" aria-label="遊び方の確認">
    <h3>はじめての京都ま市ー</h3>
    <p>待ち時間にルールを確認しよう！ 読み終わったら「読めたよ！」を押してホストに知らせられます。</p>
    <p className="lobby-rules-actions">
      <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open} aria-controls="lobby-guide-viewer">
        {open ? '説明を閉じる' : 'ルール説明を読む'}
      </button>
      <a href={guideUrl} target="_blank" rel="noopener noreferrer">別タブでPDFを開く</a>
    </p>
    {open && <div id="lobby-guide-viewer">
      <object data={guideUrl} type="application/pdf" className="lobby-guide-pdf" aria-label="京都ま市ールール説明PDF">
        <p>ブラウザ内でPDFを表示できません。<a href={guideUrl} target="_blank" rel="noopener noreferrer">別タブで開く</a>からお読みください。</p>
      </object>
    </div>}
    <p><button type="button" className={me?.rulesRead ? '' : 'primary'} disabled={locked || !self || !!me?.rulesRead}
      onClick={() => void request({ action: 'rules-read', read: true })}>{me?.rulesRead ? '✓ 読めたよ！' : '読めたよ！'}</button>
      <span className="lobby-read-count" role="status"> {readCount} / {room.players.length}人が確認済み</span></p>
    <small>これは自己申告です。全員の確認が済んでいなくてもホストはゲームを開始できます。</small>
  </section>;
}
