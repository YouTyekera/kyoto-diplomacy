import {z} from 'zod';
import {credentialsSchema,type Credentials} from '../../../packages/shared/online';
export const historyKey='kyoto-online-identities-v1',activeIdentityKey='kyoto-online-active-identity-v2',legacyIdentityKey='kyoto-online-session-v1';
export const identityPrefix=historyKey+':';
const referenceSchema=credentialsSchema.pick({roomCode:true,playerId:true});
const savedSchema=credentialsSchema.extend({nickname:z.string().min(1).max(32),updatedAt:z.number().finite().nonnegative()});
export type SavedIdentity=z.infer<typeof savedSchema>;
export const identityCredentials=(identity:Credentials):Credentials=>({roomCode:identity.roomCode,playerId:identity.playerId,reconnectToken:identity.reconnectToken});
type StoragePort=Pick<Storage,'getItem'|'setItem'|'removeItem'>&Partial<Pick<Storage,'key'|'length'>>;
const same=(a:Pick<Credentials,'roomCode'|'playerId'>,b:Pick<Credentials,'roomCode'|'playerId'>)=>a.roomCode===b.roomCode&&a.playerId===b.playerId;
const slot=(identity:Pick<Credentials,'roomCode'|'playerId'>)=>`${identityPrefix}${identity.roomCode}:${identity.playerId}`;
/** Tokens are stored only in same-origin device storage, never in a URL or public view. */
export class OnlineIdentities {
 private memory:SavedIdentity[]=[];
 private localUnavailable=false;
 constructor(private local?:StoragePort,private tab?:StoragePort){}
 list():SavedIdentity[]{
  try{if(!this.localUnavailable&&this.local){
   const raw=this.local.getItem(historyKey);
   let legacy:unknown=null;
   try{if(raw)legacy=JSON.parse(raw);}catch{/* A damaged legacy array must not hide valid individual identities. */}
   const group=z.array(savedSchema).safeParse(legacy);
   if(this.local.key&&typeof this.local.length==='number'){
    if(group?.success){for(const entry of group.data)if(!this.local.getItem(slot(entry)))this.local.setItem(slot(entry),JSON.stringify(entry));this.local.removeItem(historyKey);}
    const values:SavedIdentity[]=[];
    for(let i=0;i<this.local.length;i++){const key=this.local.key(i);if(!key?.startsWith(identityPrefix))continue;try{const parsed=savedSchema.safeParse(JSON.parse(this.local.getItem(key)??'null'));if(parsed.success&&slot(parsed.data)===key)values.push(parsed.data);}catch{/* Ignore a damaged entry without losing other players. */}}
    this.memory=values;
   }else if(group?.success)this.memory=group.data;else if(!raw)this.memory=[];
  }}catch{this.localUnavailable=true;}
  return [...this.memory].sort((a,b)=>b.updatedAt-a.updatedAt);
 }
 private persist(entry:SavedIdentity){try{if(!this.local||this.localUnavailable)return false;if(this.local.key)this.local.setItem(slot(entry),JSON.stringify(entry));else this.local.setItem(historyKey,JSON.stringify(this.memory));return true;}catch{this.localUnavailable=true;return false;}}
 remember(credentials:Credentials,nickname:string){
  const entry=savedSchema.parse({...credentials,nickname,updatedAt:Date.now()});
  this.memory=[...this.list().filter(i=>!same(i,entry)),entry];
  // Each participant owns a separate key: concurrent tabs cannot overwrite a shared array.
  const persistent=this.persist(entry);
  try{this.tab?.setItem(activeIdentityKey,JSON.stringify({roomCode:entry.roomCode,playerId:entry.playerId}));if(persistent)this.tab?.removeItem(legacyIdentityKey);else this.tab?.setItem(legacyIdentityKey,JSON.stringify(credentials));}catch{/* Current-tab memory still works. */}
  return entry;
 }
 active(roomCode?:string):Credentials|null{
  try{
   const raw=this.tab?.getItem(activeIdentityKey),ref=raw?referenceSchema.safeParse(JSON.parse(raw)):null;
   const entry=ref?.success?this.list().find(i=>same(i,ref.data)):undefined;
   if(entry)return !roomCode||entry.roomCode===roomCode?identityCredentials(entry):null;
   const legacy=this.tab?.getItem(legacyIdentityKey),parsed=legacy?credentialsSchema.safeParse(JSON.parse(legacy)):null;
   if(parsed?.success){if(roomCode&&parsed.data.roomCode!==roomCode)return null;this.remember(parsed.data,this.list().find(i=>same(i,parsed.data))?.nickname??'以前の参加者');return parsed.data;}
  }catch{/* Corrupt or unavailable storage is not identity. */}
  return null;
 }
 clearActive(){try{this.tab?.removeItem(activeIdentityKey);this.tab?.removeItem(legacyIdentityKey);}catch{/* unavailable */}}
 remove(credentials:Pick<Credentials,'roomCode'|'playerId'>){const active=this.active();this.memory=this.list().filter(i=>!same(i,credentials));try{if(this.local&&!this.localUnavailable){if(this.local.key)this.local.removeItem(slot(credentials));else this.local.setItem(historyKey,JSON.stringify(this.memory));}}catch{this.localUnavailable=true;}if(active&&same(active,credentials))this.clearActive();}
}
export function browserIdentities(){let local:Storage|undefined,tab:Storage|undefined;try{local=window.localStorage;}catch{/* unavailable */}try{tab=window.sessionStorage;}catch{/* unavailable */}return new OnlineIdentities(local,tab);}
