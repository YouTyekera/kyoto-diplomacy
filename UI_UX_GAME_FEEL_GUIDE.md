# Kyoto Diplomacy — UI / UX / Game Feel Design Guide

Status: Phase 5C design reference
Date: 2026-10-03

この文書はゲームルールではなく、プレイヤー向けUI/UXと演出の設計原則を定める。

## 1. 基本方針

このゲームの主役は「地図を読む → 意図を作る → 命令する → 全員の意図が衝突した結果を見る」という循環である。

UIの目的は装飾を増やすことではなく、
1. 今何が起きているか分かる
2. 次に何をすればよいか分かる
3. 自分の操作結果が即座に返る
4. 裁定結果の意味が気持ちよく理解できる
5. 重要でない情報は盤面を邪魔しない
状態を作ること。

## 2. 情報階層

常時見えるもの:
- 年 / 季節 / フェイズ
- 自分の勢力
- SC進捗
- 軍数
- Ready状態
- 現在選択中の軍
- 現在の命令

必要時だけ出すもの:
- イベント詳細
- 支援wizard
- 二手先preview
- 前回裁定の詳細
- ルーム情報
- デバッグ情報

地図を最も大きな面積にする。

## 3. 状態は「色だけ」で伝えない

自軍:
- 勢力色
- own halo

選択:
- selection ring / glow

合法対象:
- primary highlight

二手先参考:
- secondary dashed highlight

SC:
- 中立/所有者ring

Ready:
- icon + text

色覚差や勢力色の近さがあっても読めるよう、形・線・アイコン・文言を併用する。

## 4. Motion hierarchy

細かな操作:
- hover: 80–120ms
- selection / order accepted: 120–220ms
- panel open/close: 160–240ms

中程度の状態変更:
- event reveal: 250–450ms
- phase banner: 300–600ms
- SC capture feedback: 450–800ms
- build/disband: 400–700ms

重大な結果:
- adjudication: Phase5Bの約3.4秒を基本
- match result: 600–1200ms程度のhero reveal

全要素をbounceさせない。
Motionは「何が変わったか」を説明するために使う。

## 5. Input feedback

クリック/右クリック/命令確定に対して同じフレーム～200ms以内に視覚反応を返す。

例:
- Army選択 -> halo強調 + bottom bar更新
- Move登録 -> arrow描画 + destination pulse + summary更新
- Support -> dashed line描画
- Hold -> unit下に小さいshield/hold mark
- order取消 -> arrow/lineを短くfade

toastだけに依存しない。盤面そのものが変化を示す。

## 6. Adjudication aftercare

裁定animationは結果理解のための演出。
animation終了後にプレイヤー操作を不要にブロックしない。

animation完了:
- authoritative boardを確定
- 次フェイズ操作を即解禁
- 前回結果はnon-modal drawerへ残す

結果drawerは閉じなくてもゲーム操作可能。

## 7. Game result language

大見出しとして `GAME OVER` を使用しない。

個人化:
- single winner: `勝利`
- shared winner: `共同勝利`
- non-winner: `第N位`
- eliminated: `脱落` + final rank

共通の小見出し:
`対局結果`

終了理由:
- `勝利条件達成`
- `脱落発生により終了`
- `規定年数終了`

## 8. Cartographic visual direction

方向性:
「現代的な作戦盤 / 地図UI」
を基本とする。

避ける:
- 装飾過多な和柄
- 地図を隠す巨大カード
- 全要素の強い影
- 過剰なgradient
- 小地域を覆う常時ラベル
- 勢力色とUI chromeの競合

使う:
- warm neutral background
- off-white surface
- ink-like dark text/border
- controlled accent
- subtle elevation
- 8px系spacing
- moderate radius

京都らしさはタイトル、見出し、アイコン、地図名などに軽く出す。
読みやすさより優先しない。

## 9. Result / phase continuity

裁定後にRetreatが必要:
- top action ribbonへ `撤退が必要です`
- 該当Armyをpulse
- 前回結果drawerは開閉可能
- drawerを閉じなくても撤退入力可能

裁定後にRetreat不要:
- 次のSC update/次Ordersへ自動進行
- `前回の裁定` chipから詳細を再表示可能

## 10. Positive game feel moments

以下に限定して小さなreward feedbackを与える。

- SC獲得
- 敵初期SC獲得
- Support成功
- Standoff成立
- 敵軍Dislodge
- Build
- Equipment pickup
- Instant-win progress更新

例:
- SC ring sweep
- HUD `+1 SC`
- subtle sound hook
- brief glow/pulse

毎Move成功を大げさに祝わない。

## 11. Accessibility

- `prefers-reduced-motion` 尊重
- keyboard Escapeでwizard解除
- focus visible
- icon-only buttonにはaria-label
- color-only state禁止
- animation skip
- 音声なしでも情報を失わない

## 12. Performance

SVG mapは地域数が多い。
UI polishで毎pointermove時に全regionを再renderしない。

- derived highlight Setをmemoize
- animation layerをseparate
- CSS transform/opacity中心
- layout-thrashingを避ける
- decorative blur/filterを大量のregionへ適用しない
