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
- 検証: 型チェック成功、command-preview 1テスト成功、phase5a 3人ブラウザ試験成功（14.8秒、1280/1920/390幅）。

## Phase 2

- 原因: 候補生成と裁定が現在のcontrollerを検証していなかった。
- rules-core/retreatの共通候補判定へ、移動後のboard.regionControlを渡す。game-coreの生成・同時裁定、online-coreの秘密入力検証を統一。地理区・SC所有は使わない。領土盤面を持たない単体rules sandboxは従来の汎用判定を保持。
- OnlineGame / App / GameSessionPanel: 撤退選択を親と共有し、現在地リングと合法候補を同期。明示的な位置確認ボタンを追加。本人の秘密入力のみ使用。
- 旧ルールの撤退を前提にしていた5テストの盤面と期待を更新。同勢力の撤退衝突も新規テストで維持確認。
- 変更: rules-core/retreat.ts、game-core/equipment-orders.ts・session.ts・game.test.ts・events.test.ts、online-core/room-manager.ts、territorial-retreat.test.ts（game/online）、tests/gameplay-fixture.ts、App・OnlineGame・GameSessionPanel・BottomActionBar・MapCanvas。
- 検証: 関連5ファイル124テスト成功、型チェック成功。UI統合はPhase 5で確認。

## Phase 3〜5

未着手。
