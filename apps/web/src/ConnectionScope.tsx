export function connectionScope(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host === '::1' || /^127(?:\.\d{1,3}){3}$/.test(host)) return { mode: 'LOCAL', text: 'このPCのみ' };
  const parts = host.split('.').map(Number);
  const ipv4 = parts.length === 4 && parts.every(p => Number.isInteger(p) && p >= 0 && p <= 255) && /^[\d.]+$/.test(host);
  if ((ipv4 && (parts[0] === 10 || (parts[0] === 192 && parts[1] === 168) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31))) || /^(fc|fd)[0-9a-f]{2}:/.test(host)) return { mode: 'LAN', text: '同一LAN' };
  return { mode: 'NETWORK', text: 'ネットワーク（公開範囲は接続先の設定によります）' };
}
export function ConnectionScope() {
  if(currentOnlineTarget().publicMode)return <span className="connection-scope" data-testid="connection-scope">公開サーバー</span>;
  const scope = connectionScope(window.location.hostname);
  return <span className="connection-scope" data-testid="connection-scope">{scope.mode} / 接続範囲: {scope.text}</span>;
}
import {currentOnlineTarget} from './online-target';
