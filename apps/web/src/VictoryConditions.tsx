import { useState } from 'react';

export interface VictorySettings {
  victoryTargetSC: number;
  requiredRivalInitialSupplyCentersForInstantWin: number;
  maxYears: number;
}
/** Read the frozen session values; this component never decides a winner. */
export function victoryDescriptions(game: VictorySettings) {
  return {
    instant: `補給拠点を${game.victoryTargetSC}か所以上所有し、他の参加者がゲーム開始時に所有していた補給拠点を${game.requiredRivalInitialSupplyCentersForInstantWin}か所以上所有すると勝利します。春・秋の移動と撤退が終わった後に判定します。`,
    years: `規定の${game.maxYears}年目の冬が終わると対局終了です。補給拠点を最も多く所有する勢力が勝利します。`,
  };
}
export function VictoryConditions({ game }: { game: VictorySettings }) {
  const [open, setOpen] = useState(false), text = victoryDescriptions(game);
  return <div className="victory-help">
    <button aria-expanded={open} aria-controls="victory-conditions" onClick={() => setOpen(v => !v)}>勝利条件</button>
    {open && <aside id="victory-conditions" className="victory-conditions" aria-label="この対局の勝利条件">
      <div className="tray-heading"><strong>この対局の勝利条件</strong><button aria-label="勝利条件を閉じる" onClick={() => setOpen(false)}>閉じる</button></div>
      <h3>即時勝利</h3><p>{text.instant}</p><p>同時に条件を満たした勢力のうち、補給拠点が最多の勢力が勝利します。同じ相手の初期補給拠点を複数獲得しても数えます。初期中立・無所属区の拠点は、この追加条件には数えません。</p>
      <h3>冬の脱落・規定年数</h3><p>冬の処理で新たな脱落者が出ると、その年で対局が終了します。補給拠点を最も多く所有する勢力が勝利します。</p><p>{text.years}</p>
      <h3>脱落条件</h3><p>冬の処理後、所有する補給拠点が0か所、または支配している補給拠点以外の地域が0か所になると脱落します。</p>
      <h3>共同勝利</h3><p>勝者の補給拠点数が同じなら共同勝利です。順位も補給拠点数で決まり、同数は同順位になります。冬の終了判定では、敵の初期補給拠点の獲得数は問いません。</p>
    </aside>}
  </div>;
}
