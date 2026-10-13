# ゲームプレイ改善の作業記録

基点: origin/main `9ffc0d77988eaec8f6b9a058f8e1db45ca7c12f5`。
ブランチ: `fix/gameplay-ux-retreat-barricade-rematch-20261013`。

## Phase 0

- 作業ツリーがクリーンであること、最新origin/mainをfetchして基点を確認。
- 既存の修正ブランチを保持して指定の新規ブランチを作成。

## Phase 1

- 原因: 支援候補のtargetUnitIdと地図表示が連動していなかった。
- BottomActionBar: ホバー／フォーカスから対象軍の現在地を識別。支援移動先を別色・破線で表示。
- MapCanvas: 固定ピクセル寸法の強調リング。低縮尺でも識別可能。動き軽減時は点滅停止。
- App / OnlineGame: ローカル・オンライン両方で接続。明示的な位置確認だけ既存の地図移動機構を使用。
- phase5a.spec.ts: 旧支援ボタン名を現在の土地先行操作に修正。ホバー・解除・フォーカス・対象変更・未確定・カメラ不変を検証。
- 検証: 実行後に追記。

## Phase 2〜5

未着手。
