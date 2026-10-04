export type ConnectionState='connecting'|'waking'|'retrying'|'online'|'unavailable';
export const connectionText:Record<ConnectionState,string>={
  connecting:'サーバーへ接続しています…',
  waking:'サーバーを起動しています。初回はしばらくかかることがあります。',
  retrying:'サーバーへ再接続しています。接続が戻るまでお待ちください。',
  online:'サーバー接続中',
  unavailable:'サーバーに接続できませんでした。少し待ってから再試行してください。',
};
export function backoffMs(attempt:number,random=Math.random()){return Math.round(Math.min(1000*2**Math.min(attempt,3),5000)*(.75+random*.5));}
function pause(ms:number,signal:AbortSignal){return new Promise<void>((resolve,reject)=>{
  if(signal.aborted){reject(signal.reason);return;}
  const aborted=()=>{clearTimeout(timer);reject(signal.reason);};
  const timer=setTimeout(()=>{signal.removeEventListener('abort',aborted);resolve();},ms);
  signal.addEventListener('abort',aborted,{once:true});
});}
export async function probeHealth(url:string,signal:AbortSignal,fetcher:typeof fetch=fetch){
  try{
    const response=await fetcher(new URL('/health',url),{cache:'no-store',credentials:'omit',signal:AbortSignal.any([signal,AbortSignal.timeout(8000)])});
    return response.ok&&(await response.json()).ok===true;
  }catch{return false;}
}
/** Only probes during connection/recovery; never keeps a Free backend awake in the background. */
export class OnlineConnection {
  private controller:AbortController|undefined;
  constructor(private ports:{health:(signal:AbortSignal)=>Promise<boolean>;connect:(signal:AbortSignal)=>Promise<void>;disconnect:()=>void;state:(state:ConnectionState)=>void;budgetMs?:number}){}
  start(recovery=false){
    this.controller?.abort();
    const controller=new AbortController();this.controller=controller;
    const signal=controller.signal;
    this.ports.state(recovery?'retrying':'connecting');
    const deadline=setTimeout(()=>controller.abort(),this.ports.budgetMs??90000);
    signal.addEventListener('abort',()=>clearTimeout(deadline),{once:true});
    const run=async()=>{
      let attempt=0;
      try{
        while(!signal.aborted){
          const healthy=await this.ports.health(signal);
          if(signal.aborted)break;
          if(healthy){
            try{await this.ports.connect(signal);if(signal.aborted)break;clearTimeout(deadline);this.ports.state('online');return;}
            catch{if(signal.aborted)break;this.ports.state('retrying');}
          }else this.ports.state('waking');
          await pause(backoffMs(attempt++),signal);
        }
      }catch{/* Aborted timeout or unmount. */}
      clearTimeout(deadline);
      if(this.controller===controller){this.ports.disconnect();this.ports.state('unavailable');}
    };
    void run();
  }
  dispose(){const controller=this.controller;this.controller=undefined;controller?.abort();this.ports.disconnect();}
}
