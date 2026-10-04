import { useState } from 'react';
import type { PublicRoomView } from '../../../packages/shared/online';
import { connectionScope, ConnectionScope } from './ConnectionScope';
import { copyText } from './clipboard';
import {currentOnlineTarget} from './online-target';
export function inviteLink(origin: string, roomCode: string) { const url = new URL('/', origin); url.searchParams.set('room', roomCode); return url.href; }
export function invitedRoom(search: string) { const room = new URLSearchParams(search).get('room')?.trim().toUpperCase() ?? ''; return /^[A-Z2-9]{6}$/.test(room) ? room : ''; }
export function RoomCode({ code, chip = false }: { code: string; chip?: boolean }) {
  const [copied, setCopied] = useState('');
  async function copy() { try { await copyText(code); setCopied('コピーしました'); } catch { setCopied('コピーできません。表示されたコードを選択してコピーしてください。'); } }
  return <span className={chip ? 'room-chip' : 'room-code'}><button aria-label={chip ? `ルームコード ${code} をコピー` : 'コードをコピー'} onClick={() => void copy()}><span>ルームコード </span><strong data-testid="room-code">{code}</strong>{!chip && <small> · コードをコピー</small>}</button>{copied && <span role="status">{copied}</span>}</span>;
}
export function RoomCard({ room, years, target }: { room: PublicRoomView; years: string | number; target: number | string }) {
  const [notice, setNotice] = useState('');
  async function copyInvite() {
    try { await copyText(inviteLink(window.location.origin, room.roomCode)); setNotice(currentOnlineTarget().publicMode?'招待リンクをコピーしました。友達へこのURLを共有してください。':connectionScope(window.location.hostname).mode === 'LOCAL' ? '招待リンクをコピーしました。このURLは同じPCからのみ利用できます。' : '招待リンクをコピーしました。接続範囲内の参加者へ伝えてください。'); }
    catch { setNotice(`コピーできません。招待リンク: ${inviteLink(window.location.origin, room.roomCode)}`); }
  }
  return <section className="room-card" aria-label="ルーム情報"><div className="room-card-heading"><RoomCode code={room.roomCode} /><button onClick={() => void copyInvite()}>招待リンクをコピー</button><ConnectionScope /></div>
    <div className="room-facts"><span>ホスト: {room.players.find(p => p.playerId === room.hostId)?.nickname}</span><span>{room.players.length} / 11人</span><span>規定年数: {years}年</span><span>勝利目標: {typeof target==='number'?`補給拠点 ${target}か所`:target}</span></div>
    <p className="scenario-summary" data-testid="scenario-summary"><strong>{room.scenario.scenarioName}</strong> · {room.scenario.fileName ?? '作成時の地図設定'} · #{room.scenario.scenarioHash.slice(0, 8)} · 採用 {room.scenario.enabledRegions}地域 / 補給拠点 {room.scenario.totalSC} / 初期軍 {room.scenario.totalStartingUnits}</p>
    {notice && <p role="status">{notice}</p>}
  </section>;
}
