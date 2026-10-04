# Codex Phase 6A 実装プロンプト
## Board-first UI redesign / right-click move fix / lightweight audio placeholder readiness

作業前に確認:
1. `spec.md`
2. `docs/PHASE5C_REPORT.md`
3. `docs/PLAYTESTING.md` または最新試遊メモ
4. `PHASE5C_DECISIONS.md`
5. `UI_UX_GAME_FEEL_GUIDE.md`
6. `PHASE6A_DECISIONS.md`

最新仕様は `PHASE6A_DECISIONS.md`。
必要なら最初に `spec.md` へ反映してから実装。

今回は **ルール変更禁止**。
目的は
- 画面をゲームらしくする
- 地図を主役にする
- 右クリックMoveを確実に直す
- 情報量を整理する
こと。

## A. 最重要: 右クリックMoveの修正

現状、ユーザー環境で
「自軍選択後、右クリックで移動先を設定できない」
と報告されている。

必ず原因を調査し、修正すること。

確認項目:
- `contextmenu` 抑止が正しく入っているか
- selected unit stateが右クリック時に失われていないか
- overlay / drawer / panel / invisible layer が map click を奪っていないか
- phaseやwizard stateで不必要に右クリックMoveを無効化していないか
- support/bicycle/barricade操作中以外ではPC右クリックMoveが有効か
- browser E2Eテストで再現と修正を確認すること

必須E2E:
1. own unit を左クリック
2. legal destination を右クリック
3. Move命令が登録され、矢印またはsummaryが更新される
4. command dockにも反映
5. panel open/closed 両方で動く

## B. Board-first レイアウトへ再設計

現在の画面は「情報パネルが多く、開発ツール感が強い」と評価された。
プレイヤー向け対局画面を再設計すること。

目標:
- マップを大きくする
- 常時表示を減らす
- 左右パネルを軽く/折りたたみ可能にする
- HUDを薄くする
- 盤面を見て考えやすくする

### B1. Top HUD
残す:
- 年 / 季節 / フェイズ
- 自分の区
- SC進捗
- 軍数
- 入力状態
- ルームコード（簡潔）
- 音量 / 設定
- 戻る

削る/折りたたむ:
- 冗長な細かい状態文
- 常時不要な補足文

### B2. Left tray
「イベント・結果」系に絞る。
初期幅を小さくし、必要時に広げる。
内容:
- 公開イベント
- 地面の装備
- 持続効果
- 前回の裁定

### B3. Right tray
「参加者 / 地域情報」系に絞る。
初期幅を小さくし、必要時に広げる。
内容:
- ready状況
- 自分の命令数
- 選択地域の情報
- 選択地域のSC/支配情報

「シナリオ詳細」「無所属区一覧」はデフォルト折りたたみ。

### B4. Map area
できるだけ広く。
1920x1080 / 1366x768 / 1280x720 でも
盤面が最重要であること。

## C. 見た目の方向性

開発ツールっぽさを減らし、
「作戦盤 / モダンな地図ゲーム」の方向へ寄せる。

実装方針:
- 余白を増やす
- 罫線・枠線の主張を減らす
- panel background を軽く
- 文字サイズと階層を整理
- ボタン類を整理
- 盤面の色を主役にする

ただし、装飾過多や和柄過多にはしない。
プレイヤーが戦略思考しやすいことを優先。

## D. 地図視認性の改善

- Army pin をやや大きくする
- SCとArmyが重なっても判別しやすくする
- neutral / unowned SC は “空である” ことが直感的に分かるようにする
- ラベルは常時過剰表示しない
- hover/selected/zoomで強調
- 太い黒枠選択は使わない
- selectionはhalo, glow, subtle pulseで示す

## E. Command dock の簡素化

command dockは「今この軍に何をさせるか」だけを扱う。

表示要素:
- 選択軍
- 現在地
- 現在命令
- Hold
- Move
- Support
- Bicycle
- Barricade
- Cancel/Change

地図を邪魔しないこと。
情報を詰め込みすぎないこと。

## F. Region inspector

hoverまたはselected regionに対し、
簡潔な地域情報を出す小さなインスペクタを追加してよい。
例:
- 地域名
- 行政区
- 支配勢力
- SC有無 / 所有
- 軍の有無

ただし、常時巨大なパネルにしない。

## G. Audio

既存BGM運用は維持。
効果音は最小限の枠だけを使いやすくする。

対象:
- select
- order-confirm
- march
- support-success
- sc-capture
- standoff
- victory

実装:
- Codexは再生フックと安全なfallbackを整える
- 音源未配置でも落ちない
- 後から差し替えしやすい構造にする

必要なら placeholder 向けのREADMEも更新する。

## H. テスト

必須:
- right-click Move E2E
- left/right tray open/closeで盤面操作可能
- result drawer openでも次命令可能（既存回帰）
- 1280x720でも盤面圧迫が以前より減っている
- winner/nonwinner表示回帰
- missing audio files safe

保存スクリーンショット:
1. 通常盤面（1920）
2. 通常盤面（1280）
3. 左トレイ閉
4. 右トレイ閉
5. 自軍選択 + command dock
6. 右クリックMove登録後
7. hover/selected region inspector
8. 公開イベント表示
9. 勝者画面
10. 非勝者画面

## I. 完了報告

作成:
`docs/PHASE6A_REPORT.md`

必ず記載:
1. 右クリックMove不具合の原因と修正内容
2. レイアウト変更内容
3. 盤面サイズ改善
4. パネル折りたたみ
5. command dock整理
6. 視認性改善
7. Audio hook状態
8. テスト結果
9. 残課題

作業は Phase 6A で停止。
