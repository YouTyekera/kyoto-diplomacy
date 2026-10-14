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

## Phase 3

- 監査: 出現は非SC空地、取得は関連撤退解決後。候補と完全命令検証は同じ恒久辺・予約・safeRemoval条件を使用。設置はHoldとして防御し排除時失敗。成功時消費・pendingへ追加、次移動季節から4季節、毎撤退解決で期間減少。公開eventsと本人reservationsが復帰で復元。ルール不整合は確認されず、コアの設置ルールは変更なし。
- 原因: 装備なしはボタンが消え、不可理由がなく、地図クリックだけで即登録していた。通常プレイヤーの失敗表示も原因を省略。
- BottomActionBar: 装備なし・別軍予約・安全な辺なしの理由。地図または候補ボタンで選択→2地域と辺をプレビュー→明示登録。ホバー／フォーカスでも辺を強調。成功は裁定時、次季節から4季節・消費を説明。
- MapCanvas / App / OnlineGame: 地域・辺プレビューを接続。既存の封鎖と残り期間表示は維持。公開裁定で設置成功・失敗理由を表示。
- テスト: 全候補と完全検証の一致、橋・重複・予約の除外、本人予約の再接続保持を追加。
- 検証: 関連4ファイル48テスト成功、型チェック成功。UI統合はPhase 5。

## Phase 4

- 原因: AppからOnlineGameを再マウントすると、useOnlineがタブのactive参照を無条件で本人復帰に使用。終了画面を離れても同じ結果へ戻された。
- useOnline: 終了画面を離れる時はactive参照だけ解除。進行中のゲームのリロード・一時切断は従来どおり自動復帰。ルーム消失の認証拒否も履歴を削除せずactiveだけ解除。
- OnlineGame: 前のゲームへ戻る（参加履歴選択）と新しいゲームを作るを表示。新規選択時は旧招待roomパラメータと入力コードを解除し、認証なしで接続し直す。旧ルーム・履歴は保持。
- online-identities.test / phase5a.spec / rematch-missing-room.spec: 複数履歴、旧結果復帰、新規ルーム・再読込、旧招待解除、旧履歴保持、消失時の1回だけの自動復帰を検証。
- 検証: 参加履歴・session・createの17テスト成功、型チェック成功、再対戦ブラウザ2テスト成功（28.8秒）。
- Phase 3の新規テストで型推論がstringへ広がった箇所をEquipment[]で明示。機能変更なし。

## Phase 5

- 統合で発見: order-patchは全privateStateを再配信しないため、装備命令登録後に予約表示だけ古いままだった。本人のoptimistic orders（失敗時rollbackを含む）から注文フェイズの予約表示を算出し、追加通信なしでInventoryPanelと操作不可理由へ同期。
- ローカルの装備裁定結果でもバリケードの具体的な成功・失敗理由を表示。別勢力の装備命令がローカル自軍の予約理由にならないよう所有装備IDで照合。
- README / LobbyRulesに領土限定撤退、土地先行の支援、設置確認、再対戦入口を記載。既存の汎用PDFは変更せず画面の京都ルール案内で補足。
- phase5aの装備試験: 出現・取得→自転車使用・秘密予約・復帰→バリケード候補ホバー／フォーカス→選択段階は未登録→明示登録・復帰保持→設置裁定・消費・残り4季節・有効辺除外を検証。
- retreat-selection: 2軍の選択同期、所在地リング、合法候補が自軍支配の1地域のみ、明示位置確認、動き軽減、ズーム・ドラッグ。1280×720と1920×1080で実施。
- phase2bの旧領土条件のfixtureを新ルールへ更新。SC更新や秘密表示の確認は維持。
- タッチ対応の3人試験で、対象の位置を見るをtapし、未登録のまま位置が見えることを確認。390幅の既存確認も維持。
- ブラウザ試験中の修正: 結果表はinnerText同士で比較。シナリオのファイル設定はセッション準備完了で有効になるまで待つ。SCがポリゴンを覆う場合は実際のSCマーカーをhover。検証項目の削除・弱体化やtimeout延長はなし。

### 最終検証

| 検証 | 結果 |
|---|---|
| npm test | 50ファイル452テスト成功（64.94秒） |
| npm run typecheck | 成功 |
| npm run build | 成功（既存のZod注釈・500KB chunk警告あり） |
| npm run lint | 成功 |
| phase5a / retreat-selection / rematch-missing-room / lobby-years-commit / lobby-fast-entry | 9テスト成功（約1.2分） |
| phase2b | 6テスト成功（20.6秒） |
| phase5aの3人操作・タッチ追加後 | 1テスト成功（19.0秒） |
| 1280×720 / 1920×1080 | バリケード・撤退のスクリーンショットを目視確認、横はみ出しなし |
| git diff --check | 問題なし |

実京都データの6人試験: create ack 396ms、最初のpublicState受信395ms、preflight 0.0144ms、地図なしserialization 0.1551ms、接続6・再接続0、event-loop最大397ms。全テスト／ブラウザ並列実行下のローカル単回値で、修正前同条件の比較測定はしていない。

### 状態と制約

- Phase 0〜5実装・検証完了。標準シナリオ共有キャッシュ・create操作ID・接続回復の既存テストも全体試験で成功。
- 意図的なルール変更は領土限定撤退のみ。勝敗・移動支援・バリケード消費と4季節・safeRemovalは維持。
- 新しい秘密情報・UUID・認証トークンの診断ログ追加なし。本人の支援／撤退／装備プレビューはローカルUIだけ。
- 機能上の未解決問題は確認されていない。Renderおよびスマートフォン実機は未検証（タッチはブラウザエミュレーション）。PR・本番検証へ進める状態。
- mainへのマージ、強制履歴変更、Renderデプロイは未実施。

### Phaseコミット

| Phase | コミット |
|---|---|
| 1 | e259b7d |
| 2 | 0c392df |
| 3 | c838d18 |
| 4 | 4fa7c54 |
| 5 | 最終コミットでこの記録と検証修正を保存 |
