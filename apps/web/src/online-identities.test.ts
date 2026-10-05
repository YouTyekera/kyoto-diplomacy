import {it,expect} from 'vitest';
import {OnlineIdentities,activeIdentityKey,historyKey,identityPrefix,legacyIdentityKey} from './online-identities';
import type {Credentials} from '../../../packages/shared/online';
class MemoryStorage{values=new Map<string,string>();get length(){return this.values.size;}key(index:number){return [...this.values.keys()][index]??null;}getItem(key:string){return this.values.get(key)??null;}setItem(key:string,value:string){this.values.set(key,value);}removeItem(key:string){this.values.delete(key);}}
const a:Credentials={roomCode:'ABC234',playerId:'host',reconnectToken:'a'.repeat(64)},b:Credentials={...a,playerId:'guest',reconnectToken:'b'.repeat(64)};
it('端末historyは複数identity、tabにはtokenを含まない参照、reloadでは同一identity',()=>{
 const local=new MemoryStorage(),tabA=new MemoryStorage(),tabB=new MemoryStorage(),host=new OnlineIdentities(local,tabA),guest=new OnlineIdentities(local,tabB);
 host.remember(a,'ホスト');guest.remember(b,'ゲスト');expect(host.list()).toHaveLength(2);expect(new OnlineIdentities(local,tabA).active()).toEqual(a);expect(guest.active()).toEqual(b);
 expect(JSON.parse(tabA.getItem(activeIdentityKey)!)).toEqual({roomCode:a.roomCode,playerId:a.playerId});expect(tabA.getItem(activeIdentityKey)).not.toContain(a.reconnectToken);expect(tabA.getItem(legacyIdentityKey)).toBeNull();
 const newTab=new OnlineIdentities(local,new MemoryStorage());expect(newTab.active()).toBeNull();expect(newTab.list().map(i=>i.nickname).sort()).toEqual(['ゲスト','ホスト']);
});
it('別Roomのinviteではこのtabのactive identityを自動使用しない',()=>{const store=new OnlineIdentities(new MemoryStorage(),new MemoryStorage());store.remember(a,'A');expect(store.active('DEF234')).toBeNull();expect(store.active('ABC234')).toEqual(a);});
it('7CのsessionStorage credentialsをhistoryへ移行し、nicknameは後から補完',()=>{
 const local=new MemoryStorage(),tab=new MemoryStorage();tab.setItem(legacyIdentityKey,JSON.stringify(a));const store=new OnlineIdentities(local,tab);expect(store.active()).toEqual(a);expect(store.list()[0].nickname).toBe('以前の参加者');store.remember(a,'A');expect(store.list()).toHaveLength(1);expect(store.list()[0].nickname).toBe('A');expect(tab.getItem(legacyIdentityKey)).toBeNull();
});
it('kick/leave削除は該当playerだけを削除し、同Roomの別tab/player履歴を壊さない',()=>{
 const local=new MemoryStorage(),tab=new MemoryStorage(),store=new OnlineIdentities(local,tab);store.remember(a,'A');store.remember(b,'B');store.remove(b);expect(store.active()).toBeNull();expect(store.list().map(i=>i.playerId)).toEqual(['host']);expect(new OnlineIdentities(local,new MemoryStorage()).list()).toHaveLength(1);
});
it('別tabへの移動ではactive参照だけを消し、復帰用履歴は維持',()=>{const store=new OnlineIdentities(new MemoryStorage(),new MemoryStorage());store.remember(a,'A');store.clearActive();expect(store.active()).toBeNull();expect(store.list()).toHaveLength(1);});
it('別tabの更新・破損entry・旧arrayの移行でも他identityを上書きしない',()=>{
 const local=new MemoryStorage(),tab=new MemoryStorage(),host=new OnlineIdentities(local,tab),guest=new OnlineIdentities(local,new MemoryStorage());
 local.setItem(historyKey,JSON.stringify([{...a,nickname:'旧A',updatedAt:1}]));expect(host.list()[0].nickname).toBe('旧A');expect(local.getItem(historyKey)).toBeNull();
 guest.remember(b,'B');const before=local.getItem(`${identityPrefix}${b.roomCode}:${b.playerId}`);host.remember(a,'新A');expect(local.getItem(`${identityPrefix}${b.roomCode}:${b.playerId}`)).toBe(before);
 local.setItem(`${identityPrefix}broken`,'broken');local.setItem(historyKey,'broken');expect(host.list()).toHaveLength(2);expect(host.active()).toEqual(a);host.remove(a);expect(guest.active()).toEqual(b);expect(guest.list().map(i=>i.playerId)).toEqual(['guest']);
});
it('storage制限/破損でも参加中のメモリとtab fallbackを保ち、偽のidentityを採用しない',()=>{
 const tab=new MemoryStorage(),local=new MemoryStorage();local.setItem(historyKey,'broken');const store=new OnlineIdentities(local,tab);expect(store.list()).toEqual([]);tab.setItem(activeIdentityKey,'broken');expect(store.active()).toBeNull();
 const blocked={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');},removeItem(){throw Error('blocked');}};
 const fallback=new OnlineIdentities(blocked,tab);fallback.remember(a,'A');expect(fallback.active()).toEqual(a);expect(new OnlineIdentities(blocked,tab).active()).toEqual(a);fallback.remove(a);expect(fallback.active()).toBeNull();
});
