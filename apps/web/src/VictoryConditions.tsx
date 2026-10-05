import { useState } from 'react';

export interface VictorySettings {
  victoryTargetSC: number;
  requiredRivalInitialSupplyCentersForInstantWin: number;
  maxYears: number;
}
/** Read the frozen session values; this component never decides a winner. */
export function victoryDescriptions(game: VictorySettings) {
  return {
    instant: `補給拠点${game.victoryTargetSC}か所＋敵の初期補給拠点${game.requiredRivalInitialSupplyCentersForInstantWin}か所で勝利。`,
    years: `脱落者が出た年、または${game.maxYears}年目終了時に対局終了。補給拠点が最も多い勢力が勝利します。`,
  };
}
export function VictoryConditions({ game }: { game: VictorySettings }) {
  const [open, setOpen] = useState(false), text = victoryDescriptions(game);
  return <div className="victory-help">
    <button aria-expanded={open} aria-controls="victory-conditions" onClick={() => setOpen(v => !v)}>勝利条件</button>
    {open && <aside id="victory-conditions" className="victory-conditions" aria-label="この対局の勝利条件">
      <div className="tray-heading"><strong>この対局の勝利条件</strong><button aria-label="勝利条件を閉じる" onClick={() => setOpen(false)}>閉じる</button></div>
      <h3>即時勝利</h3><p>{text.instant}<br/>春・秋の処理後に判定します。</p>
      <h3>対局終了</h3><p>{text.years}</p>
      <h3>脱落</h3><p>冬終了時、補給拠点0か所、または通常地域0か所で脱落。</p>
      <h3>共同勝利</h3><p>同数なら共同勝利。</p>
      <details><summary>詳細ルール</summary>
        <p>即時勝利は、両方の目標数以上を所有した勢力が対象です。春・秋の移動と撤退が終わった後に判定し、同時に条件を満たした勢力のうち補給拠点が最多の勢力が勝利します。</p>
        <p>同じ相手の初期補給拠点を複数獲得しても数えます。初期中立・無所属区の拠点は、敵の初期補給拠点の条件には数えません。</p>
        <p>脱落と規定年数の判定は冬の処理後に行います。通常地域とは補給拠点以外の地域です。冬の終了判定では、敵の初期補給拠点の獲得数は問いません。</p>
        <p>勝者の補給拠点数が同じなら共同勝利です。順位も補給拠点数で決まり、同数は同順位になります。</p>
      </details>
    </aside>}
  </div>;
}
