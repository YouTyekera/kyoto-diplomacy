import type { ReactNode } from 'react';
import { ConnectionScope } from './ConnectionScope';
import { currentOnlineTarget } from './online-target';

export const titleCopy='3〜11人で京都の街を奪い合う、交渉型オンライン戦略ゲーム。\n全員が同時に命令を出し、表面上の協力・裏切り・イベントを駆使して補給拠点の制覇を目指そう！';
export function LandingPage({online,local,settings,localDisabled,children}:{online:()=>void;local:()=>void;settings:()=>void;localDisabled:boolean;children:ReactNode}) {
  const publicMode=currentOnlineTarget().publicMode;
  return <main className="landing-page">
    <div className="landing-grid">
      <div className="landing-intro"><h1 aria-label="京都ま市ー"><ruby>京都ま市ー<rt>きょうとましー</rt></ruby></h1><p className="title-copy" data-testid="title-copy">{titleCopy}</p><p className="creator-credit">Presented by <a href="https://x.com/ReindeerSkyBean" target="_blank" rel="noopener noreferrer">ようちぇけら</a></p></div>
      <figure className="landing-hero"><img src={`${import.meta.env.BASE_URL}media/kyoto-board-hero.webp`} width="1600" height="900" fetchPriority="high" alt="京都ま市ーの標準シナリオ。京都の都市部を囲む山地と、11勢力の領土・補給拠点・陸軍が見える実盤面"/><figcaption>11人戦時の実際のマップ</figcaption></figure>
      <nav className="landing-actions" aria-label="対戦メニュー"><button className="primary" onClick={online}>オンライン対戦<span aria-hidden="true"> →</span></button><p>3～11人 · 標準シナリオを内蔵</p><ConnectionScope/><div className="landing-secondary"><button disabled={localDisabled} onClick={local}>ローカルで試す</button><button onClick={settings}>設定</button></div></nav>
    </div>
    {publicMode?<details className="developer-tools"><summary>開発ツール</summary>{children}</details>:<section className="developer-tools"><h2>開発ツール</h2>{children}</section>}
    <p className="source-note">© 京都市 · Dataset 00670 · CC BY 4.0</p>
  </main>;
}
