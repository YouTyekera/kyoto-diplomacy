import { connectionText,type ConnectionState } from './online-connection';
export function ConnectionStatus({state,error,retry}:{state:ConnectionState;error?:string;retry:()=>void}){
  return <div className={`connection-state connection-${state}`} data-connection-state={state} role="status">
    <span>{error??connectionText[state]}</span>{state==='unavailable'&&!error&&<button onClick={retry}>接続を再試行</button>}
    {state!=='online'&&!error&&<small>この画面はそのまま開いてお待ちください。ルールや操作説明はトップ画面から確認できます。</small>}
  </div>;
}
