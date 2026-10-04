import { describe, it, expect } from 'vitest';
import { connectionScope } from './ConnectionScope';
import { inviteLink, invitedRoom } from './RoomCard';
import { requestSchema } from '../../../packages/shared/online';
describe('player connection and invites', () => {
  it.each(['127.0.0.1', 'localhost', '[::1]', '127.0.0.2', 'test.localhost'])('%s はLOCAL', host => expect(connectionScope(host).mode).toBe('LOCAL'));
  it.each(['192.168.1.2', '10.0.0.1', '172.16.0.1', '172.31.255.1', '[fd12::1]'])('%s はLAN', host => expect(connectionScope(host).mode).toBe('LAN'));
  it.each(['example.com', '172.32.0.1', '192.168.0.999', '8.8.8.8'])('%s は公開と断定しない', host => expect(connectionScope(host).mode).toBe('NETWORK'));
  it('current originのportを保った招待と安全なprefill', () => {
    expect(inviteLink('http://127.0.0.1:5174', 'ABC234')).toBe('http://127.0.0.1:5174/?room=ABC234');
    expect(invitedRoom('?room=abc234')).toBe('ABC234'); expect(invitedRoom('?room=../evil')).toBe('');
  });
  it('ファイル名は任意の表示メタデータ、パスと制御文字は拒否', () => {
    expect(requestSchema.safeParse({ action: 'scenario', json: '{}', fileName: '京都.json' }).success).toBe(true);
    expect(requestSchema.safeParse({ action: 'scenario', json: '{}' }).success).toBe(true);
    for (const fileName of ['../secret.json', 'C:\\secret.json', 'bad\nname.json']) expect(requestSchema.safeParse({ action: 'scenario', json: '{}', fileName }).success).toBe(false);
  });
});
