import { WARDS } from '../../../packages/shared/model';
import type { EndResult,MatchSummary } from '../../../packages/shared/match';
import { wardColor } from '../../../packages/shared/display';

export function downloadMatchLog(value:unknown){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='match-log.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
const wardName=(id:string)=>WARDS.find(w=>w.id===id)?.name??id;
export const endReasonLabels={'supply-target':'勝利条件達成','elimination-final-year':'脱落発生により終了','max-years':'規定年数終了'};
export function resultHeading(result:EndResult,ward?:string|null){
  if(!ward)return '対局終了';
  if(result.winners.includes(ward as EndResult['winners'][number]))return result.winners.length===1?'勝利':'共同勝利';
  const standing=result.standings.find(r=>r.wardId===ward);return standing?`第${standing.rank}位`:'対局終了';
}
export function GameOver({result,summary,target,players=[],onDownload,pending=false,currentPlayerWardId}:{result:EndResult;summary:MatchSummary;target:number;players?:{nickname:string;wardId:string|null}[];onDownload:()=>void;pending?:boolean;currentPlayerWardId?:string|null}) {
  const winner=!!currentPlayerWardId&&result.winners.some(w=>w===currentPlayerWardId);
  const eliminated=result.eliminated.some(e=>e.wardId===currentPlayerWardId);
  return <section className={`game-result ${winner?'result-winner':'result-ranked'}`} aria-label="ゲーム終了結果" style={{'--result-accent':winner?wardColor(currentPlayerWardId):'var(--accent)'} as import('react').CSSProperties}>
    <div className="result-hero"><p className="eyebrow">対局結果</p>{winner&&<span className="result-trophy" aria-hidden="true"><svg viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 7h16v10c0 7-16 7-16 0ZM12 10H6v6c0 5 6 6 8 6M28 10h6v6c0 5-6 6-8 6M20 23v9M12 33h16"/></svg></span>}<h2>{resultHeading(result,currentPlayerWardId)}</h2>{eliminated&&<span className="status-chip">脱落 · 第{result.standings.find(r=>r.wardId===currentPlayerWardId)?.rank}位</span>}
    <p>{result.winners.map(wardName).join('、')}の勝利{result.winners.length>1?'（同率勝者）':''}</p>
    <p>{endReasonLabels[result.reason]} · 第{result.year}年 {result.season==='winter'?'冬':result.season==='spring'?'春':'秋'} · 勝利目標 {target}か所</p></div>
    {result.eliminated.map(e=><p key={e.wardId}>{wardName(e.wardId)}が脱落: {e.reasons.map(r=>r==='zero-sc'?'所有する補給拠点が0か所':'補給拠点以外の支配地域が0か所').join('、')}</p>)}
    <div className="table-scroll"><table aria-label="最終順位"><thead><tr><th>順位</th><th>プレイヤー</th><th>行政区</th><th>補給拠点</th><th>支配地域</th><th>軍</th></tr></thead><tbody>{result.standings.map(r=><tr key={r.wardId}><td>{r.rank}</td><td>{players.find(p=>p.wardId===r.wardId)?.nickname??'ローカル'}</td><th>{wardName(r.wardId)}</th><td>{r.supplyCenters}</td><td>{r.controlledRegions}</td><td>{r.units}</td></tr>)}</tbody></table></div>
    <h3>試遊サマリー</h3><p>現在地支援 {summary.supportHoldCount} / 移動支援 {summary.supportMoveCount} · 裁定演出スキップ {summary.adjudicationPresentationSkipped}</p><p>移動命令フェイズ平均 {summary.averageOrdersSeconds.toFixed(1)}秒（{summary.ordersPhases}回） · スタンドオフ {summary.standoffs} · 排除 {summary.dislodgements}</p>
    <p>イベント: 自転車 {summary.eventCounts.bicycle}、バリケード {summary.eventCounts.barricade}、道路工事 {summary.eventCounts.roadwork}、臨時バス {summary.eventCounts.bus}</p>
    <p>自転車: 取得 {summary.bicyclePickups} / 使用 {summary.bicycleUses} · バリケード: 取得 {summary.barricadePickups} / 使用 {summary.barricadeUses} / 設置成功 {summary.barricadeDeployments}</p>
    <p className="hint">命令入力開始から裁定までの時間を記録しています。実際の会話時間や面白さの評価ではありません。</p>
    <button disabled={pending} onClick={onDownload}>試遊ログをダウンロード</button>
  </section>;
}
