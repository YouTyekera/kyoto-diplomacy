import type { TurnSnapshot } from '../../../packages/shared/online';
export function TurnHistory({history,index,onIndex,showOrders,onOrders}:{history:TurnSnapshot[];index:number|null;onIndex:(index:number|null)=>void;showOrders:boolean;onOrders:(value:boolean)=>void}){
  const snapshot=index===null?null:history[index];
  return <div className="turn-history" aria-label="移動ターンの履歴" data-history-id={snapshot?.id??'current'}>
    <button disabled={!history.length||index===0} onClick={()=>onIndex(index===null?history.length-1:index-1)}>← 前ターン</button>
    {snapshot&&<><strong role="status">履歴表示 · 第{snapshot.year}年 {snapshot.season==='spring'?'春':'秋'}・裁定後</strong><button onClick={()=>onIndex(index!+1<history.length?index!+1:null)}>→ 次ターン</button><button onClick={()=>onIndex(null)}>現在に戻る</button><label><input type="checkbox" checked={showOrders} onChange={e=>onOrders(e.target.checked)}/>このターンの命令を見る</label><small>閲覧専用 · 命令は入力できません</small></>}
  </div>;
}
