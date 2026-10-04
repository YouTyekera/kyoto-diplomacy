# Phase 5C 仕様差分 — UI Polish / Non-blocking Results / Match Result / Game Feel

Status: Phase 5C 実装前
Date: 2026-10-03

この文書はPhase 5B完了後のプレイヤー向けUI/UX改善を定める。
ゲームルール・裁定結果は変更しない。

## 1. 裁定結果を閉じなくても次の操作を可能にする

Phase 5Bでは裁定演出・結果サマリー表示中に命令入力を停止し、
`結果を閉じる` で次の入力へ戻る。

Phase 5Cでは以下へ変更する。

### 1.1 Animation中
裁定animation中のみ盤面入力を停止してよい。
既定約3.4秒。Skip可。

### 1.2 Animation終了後
- authoritative final boardを確定
- server上の現在phaseに応じて操作を即解禁
- 結果を閉じる操作を進行条件にしない

結果情報はfullscreen/modalではなく
`前回の裁定` non-modal drawerへ移す。

Drawer:
- backdropなし
- map操作をブロックしない
- 開いたままでも命令・撤退・Buildが可能
- collapse可能
- collapsed chipから再表示可能
- client-local UI state
- 誰かが閉じた/閉じないことでserver進行は変わらない

Retreatが必要ならdrawerとは別にaction ribbon:
`撤退が必要です`
を表示する。

## 2. Match Result画面の文言

大見出し `GAME OVER` をプレイヤー向け画面から撤去する。

共通小見出し:
`対局結果`

current playerが単独winner:
`勝利`

current playerが共同winner:
`共同勝利`

current playerがwinnerでない:
`第N位`

eliminated:
必要なら `脱落` badge + 最終順位

終了理由も自然文:
- 勝利条件達成
- 脱落発生により終了
- 規定年数終了

全員に同じランキング・統計は表示するが、
hero headingだけcurrent playerに合わせる。

観戦/担当勢力不明:
`対局終了`

## 3. UI design systemを正式化

`UI_UX_GAME_FEEL_GUIDE.md`を参照正本として扱う。

design tokens:
- spacing
- radii
- typography scale
- surface/background
- text/muted
- border
- accent
- success/warning/danger
- shadows
- motion durations/easings

散在するmagic CSS値を段階的にtokenへ移す。

既存勢力色はgame dataとして維持。

## 4. Command UX polish

自軍選択時BottomActionBarを「command dock」として視覚的に整理。

表示:
- 選択Army
- 現在地域
- 現在命令
- Hold / Move / Support / Bicycle / Barricade
- Cancel / Change

選択時:
- Armyが短くlift/halo
- legal region reveal

order accepted:
- map arrow/line
- destination one-shot pulse
- dock summary即更新

Hold:
- 小さなhold/shield indicatorをArmy付近に表示してよい

すべて短く、animationによって操作を待たせない。

## 5. Phase transition

大きなmodalではなく、map中央上部へ短いbanner。

例:
`1902 春 — 命令`
`1902 秋 — 命令`
`1902 冬 — 軍備調整`

300～600ms程度で入退場。
その後TopBarの常時表示へ収束。

## 6. SC capture / Build / Equipment feedback

情報上重要な変化だけ軽い演出。

SC capture:
- SC ringがnew owner colorへtransition
- small `+1 SC` near own HUD（own player時）
- neutral -> ownedが視認可能

Enemy initial SC capture:
- progress indicatorをbrief pulse
- `敵初期SC 2 / 2`等

Build:
- Army pin fade/raise-in

Disband:
- fade/shrink

Equipment pickup:
- map marker -> inventory方向への簡易feedback
- card/inventory count pulse

演出はserver state変更後のpresentationでありルールを変えない。

## 7. Ready feedback

命令確定:
- button morph/text `確定済み`
- player listも即時status反映
- 自分の確定解除が可能な間は明示

all ready:
- 0.3～0.6sの短いtransition後、adjudication presentationへ
- 長いloading modal不要

## 8. Event cards polish

Phase5Bの地図focusを維持。

Card hierarchy:
- icon
- event name
- target names
- short effect
- 地図で見る

現在イベントとpersistent effectsを分けて表示。
期限のあるBarricadeは残り季節をchipで表示。

## 9. Map readability

地図が主役。

- side panel surfaceを少し透過/軽量化
- map label collisionを悪化させない
- selected / own / legal / secondary / event highlightのstyleを明確に区別
- thick black outline禁止を維持
- neutral SC UIを維持

小さなregionでoverlayが重なりすぎる場合、
hover/focus時だけ詳細ラベルを出す。

## 10. Result screen game feel

勝者:
- 600～1200msの控えめhero reveal
- winner faction color accent
- trophy/crown等の単純iconは可
- confettiはPhase5Cでは原則使わない

非勝者:
- neutral result presentation
- rankを最重要

共通:
- ranking
- end reason
- SC
- territory
- unit count
- match summary
- download log

## 11. Audio hooks

既存:
- domestic
- adjudication
- march

を維持する。

追加SFXはファイルがあれば使えるslotだけ準備してよい:
- select
- order-confirm
- sc-capture
- support-success
- standoff
- victory

第三者音源/ダミー音源は禁止。
未配置は無音。

SFXなしでも同じ情報を視覚的に得られること。

## 12. Accessibility / motion

- prefers-reduced-motion
- skip adjudication
- focus-visible
- Escape cancel
- non-color indicators
- UI motion never blocks essential interaction after state is known

## 13. 対象外

- rules changes
- victory condition changes
- new events
- Discord Activity
- public deployment
- mobile-first redesign
