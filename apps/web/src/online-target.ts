export function privateHostname(host:string){
  const name=host.toLowerCase().replace(/^\[|\]$/g,'');
  return name==='localhost'||name.endsWith('.localhost')||name==='::1'||/^127(?:\.\d{1,3}){3}$/.test(name)||/^10\./.test(name)||/^192\.168\./.test(name)||/^172\.(1[6-9]|2\d|3[01])\./.test(name)||/^(fc|fd)[0-9a-f]{2}:/.test(name);
}
export function onlineTarget(raw:string|undefined,publicMode:boolean,pageOrigin:string){
  if(!raw){return publicMode?{publicMode,error:'公開サーバーの接続先が未設定です。サイト管理者へお知らせください。',url:undefined}:{publicMode,error:undefined,url:pageOrigin};}
  try{
    const url=new URL(raw);
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'||url.search||url.hash||(publicMode&&(url.protocol!=='https:'||privateHostname(url.hostname))))throw Error('Invalid target');
    return {publicMode,error:undefined,url:url.origin};
  }catch{return {publicMode,error:'公開サーバーの接続設定を確認できません。サイト管理者へお知らせください。',url:undefined};}
}
export function currentOnlineTarget(){
  const publicMode=import.meta.env.VITE_PUBLIC_DEPLOYMENT==='true'||(import.meta.env.PROD&&!privateHostname(window.location.hostname));
  return onlineTarget(import.meta.env.VITE_ONLINE_SERVER_URL,publicMode,window.location.origin);
}
