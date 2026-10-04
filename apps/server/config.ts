export interface ServerConfig { production: boolean; frontendOrigin?: string; port: number; host: string }
export function serverConfig(env:NodeJS.ProcessEnv=process.env):ServerConfig {
  const production=env.NODE_ENV==='production';
  const raw=production?env.PORT:env.PORT??env.ONLINE_PORT??'3001';
  const port=Number(raw);
  if(!raw||!/^\d+$/.test(raw)||port<1||port>65535)throw new Error('PORTに1～65535の整数を設定してください');
  let frontendOrigin:string|undefined;
  if(env.FRONTEND_ORIGIN){
    const url=new URL(env.FRONTEND_ORIGIN);
    if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/'||url.hostname==='localhost'||/^127\./.test(url.hostname))throw new Error('FRONTEND_ORIGINには公開FrontendのHTTPS originを設定してください');
    frontendOrigin=url.origin;
  }
  if(production&&!frontendOrigin)throw new Error('productionではFRONTEND_ORIGINが必要です');
  return {production,frontendOrigin,port,host:production?'0.0.0.0':env.ONLINE_HOST??'127.0.0.1'};
}
export function permittedOrigin(origin:string|undefined,config:Pick<ServerConfig,'production'|'frontendOrigin'>){
  if(config.production)return !!origin&&origin===config.frontendOrigin;
  if(!origin)return true; // Node clients / local test tools.
  try{
    const url=new URL(origin),host=url.hostname;
    return ['http:','https:'].includes(url.protocol)&&(host==='localhost'||host==='[::1]'||/^127\./.test(host)||/^10\./.test(host)||/^192\.168\./.test(host)||/^172\.(1[6-9]|2\d|3[01])\./.test(host));
  }catch{return false;}
}
