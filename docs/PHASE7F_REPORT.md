# Phase 7F: Gameplay UX Polish

実施日: 2026-10-05。Phase 7Fの実装・検証を完了しました。

命令入力の即時表示、命令保存の順序保証、BGM設定の表示、勝利条件の説明を改善しました。軍の実際の位置、勝利判定、裁定、補給拠点所有権、脱落、イベント、装備、地図、MapConfig、標準シナリオ、Backend、Tailscale、Renderのサービス構成は変更していません。commit/push、Pi/Renderへのdeployは行っていません。

## 1. 命令入力ラグの原因

`useMapCommands.commit()` は `await choose(order)` の後に受付表示と `order-confirm` を実行していました。OnlineMatchの命令線・一覧・入力済み軍数も本人用snapshotの `self.orders` だけを参照し、命令保存中はglobal `online.pending` によって地図操作全体を止めていました。

そのため、合法なクリックでも通信往復とserverの状態配信を待ってから反応し、別の軍への入力まで待たされていました。複数入力をそのまま並行送信すると、古い `self.orders` を元にした命令書全体が新しい命令を消す問題もありました。

## 2. Optimistic UIの同期方式

client専用の `OptimisticOrders` と `useOptimisticOrders` を追加しました。確認済みのauthoritative命令と表示用draftを分け、入力時はdraftを同期的に更新します。MapCanvasの命令線、command dock、一覧、入力済み軍数は同じdraftを参照します。受付表示とSEも `await` より前に実行します。

`game.board.units` は引き続きserverの盤面を使用し、裁定前に軍を移動させません。draftは本人の画面内だけに保持し、他の参加者へ公開しません。

通信は命令書のsnapshotをFIFOキューへ積み、一つ前のackを待ってから次を送ります。表示を待たせるためのキューではありません。先行requestのsnapshotが届いても、後続のdraftを上書きしません。最後の保存が受理されると確認済み状態へ同期します。serverによる並べ替えや、確定時の未入力軍へのHold補完も受信snapshotから反映します。

右クリックMove、通常Move、Hold、Support Hold/Move、自転車、バリケード、命令変更による削除、開発用フォームも同じ保存キューを通します。serverの合法命令一覧と既存の検証を利用し、clientに新しい裁定や装備ルールを追加していません。

## 3. Rollback・連続入力・確定

- 保存中でも別の軍を続けて選択・入力できます。`useOnline` で全requestのpendingと操作を止めるpendingを分け、確定前のorders保存だけを地図全体のロックから外しました。ロビーのロックは維持しています。
- session復帰中、public/privateのphase不一致、確定処理中、確定済み、orders以外のphase、裁定演出中は入力を禁止します。
- 拒否時は最新の確認済み命令へ戻し、依存する後続保存と確定も取り消します。不正な命令線・受付表示を消し、既存のserverエラー表示を使用します。通信応答を確認できない場合もキューを進めず、安全側へ戻します。
- 「命令書を確定」は押した時点の最新draftをキュー末尾へ積み、先行保存がすべて成功してから、そのdraftを含む `finalize:true` を送ります。押した直後に追加入力を止め、「命令書を保存して確定しています…」を表示します。
- 切断・phase変更・画面終了で旧キューを無効化し、遅れて届いたackが新しいdraftを上書きしないよう世代を確認します。再接続時は既存のauthoritative session復元を利用します。

旧自転車E2Eは、確定クリック直後に保存キューを待たずreloadしていました。確定済みの表示を確認してからreloadするよう待ち条件を修正し、復元後の自転車命令・秘密性・裁定・封鎖の確認を維持しています。

未送信draftの永続保存は今回追加していません。保存・確定中にreloadや切断をすると、復帰後はserverが最後に確認した命令を表示します。

## 4. BGM設定と音声アセット保護

BGM設定の保存先 `kyoto-music-v1`、音量、Domestic/Adjudicationの参照パスは維持しています。既存AudioManagerは再生失敗を設定変更と分離しており、今回その動作を追加テストで確認しました。

音楽ボタンのON/OFFと `aria-pressed` は保存されたユーザー設定を示すよう変更しました。再生拒否・音源未配置の場合は「ON（再生待ち）」と表示し、ON設定をOFFのように見せません。再試行でもON/音量を維持します。Domestic → Adjudication → Domestic、およびreload後のON/音量をunit/browser/productionで検証しました。

コード編集前に、未追跡を含めた `apps/web/public/audio/` 全9ファイルの相対パス・サイズ・SHA-256を記録しました。記録は [PHASE7F_AUDIO_INVENTORY.json](PHASE7F_AUDIO_INVENTORY.json) です。7個のWAVと2個のREADMEが対象です。この作業環境の同ディレクトリにはMP3は配置されていません。`/audio/bgm/domestic.mp3` と `/audio/bgm/adjudication.mp3` の参照は変更していません。

既存音声の削除・上書き・fixture化、`audio:generate`、git clean/reset/restore、音声ディレクトリの再生成は行っていません。BGMの追加テストはメモリ上のAudio portとHTTP応答のテスト用変更を使用し、`public/audio` へfixtureを置きません。既存の実WAV確認も維持しています。ユーザーの実MP3によるPiでの聴音確認は未実施です。

通常buildは `emptyOutDir=true` により既存 `dist/audio` を削除・再生成する可能性があるため、自動承認レビューに拒否されました。安全な代替として、通常向けbuildを新規 `.reference-cache/phase7f-final-build-20261005` へ出力しました。既存 `dist` / `dist-public` にはbuildを出力していません。

production検証スクリプトも、毎回新規 `.reference-cache/production-build-*` を作り、そのbuildをTLS fixtureで配信するよう変更しました。既存音声を消して404条件を作ることはせず、productionの音声検査はユーザー音声ありの200と未配置の404の双方に対応します。生成された検証buildはESLintの対象外です。Render用のbuild/start設定は変更していません。

全テスト・build終了後に開始時の記録と再照合しました。全9ファイルが存在し、サイズ変更0件、SHA-256変更0件、消失0件でした。音声内容のバックアップや書き戻しは行っていません。

## 5. 勝利条件UIの変更前後

以前は即時勝利、敵初期拠点の数え方、冬の終了、脱落、順位の説明をすべて常時表示していました。通常表示を次の4項目へ整理しました。

1. 即時勝利: 補給拠点目標＋敵の初期補給拠点目標。春・秋の処理後に判定。
2. 対局終了: 脱落者が出た年、または規定年の終了。補給拠点最多の勢力が勝利。
3. 脱落: 冬終了時、補給拠点0か所、または通常地域0か所。
4. 同数なら共同勝利。

数値は引き続き現在の `victoryTargetSC`、`requiredRivalInitialSupplyCentersForInstantWin`、`maxYears` から表示します。3/4/11人と異なる規定年数・敵初期拠点必要数をテストしました。

「詳細ルール」は初期状態で閉じています。同じ相手の初期補給拠点を複数数えること、中立・無所属区の除外、目標数以上の条件、複数達成者の最多判定、移動・撤退後/冬の判定時点、通常地域の意味、冬終了では敵初期拠点数を問わないこと、同数順位を残しています。既存のnon-modalパネルを使用し、ゲームの勝利・脱落・順位ロジックは変更していません。

## 6. テスト結果

最終実行結果は以下のとおりです。通常browser E2Eは `E2E_WEB_PORT=5191`、`ONLINE_PORT=3047` を使用し、既存のローカルサーバーを停止・置換していません。

| 検証 | 結果 |
| --- | --- |
| `npm.cmd run lint` | 成功 |
| `npm.cmd run typecheck` | 成功 |
| `npm.cmd run test` | 34ファイル・403件成功 |
| `npm.cmd run build -- --outDir ../../.reference-cache/phase7f-final-build-20261005` | 成功。既存のbundleサイズ警告・依存ライブラリの注釈警告あり |
| `npm.cmd run test:browser` | 57件成功。右クリック/通常Move、Support、自転車/バリケード、裁定、撤退/冬、identity/presence/再接続を含む |
| `npm.cmd run test:production` | 7件成功。公開origin、HTTPS/WSS、復帰、資産URL、localhost固定参照なしを確認 |
| `npm.cmd run map:validate` | 成功。エディタ初期設定の既存warning 9件。標準シナリオは別途unit/E2Eで開始確認 |

追加した3クライアントE2Eは、実Socket.IOのorders送信を2秒遅延させます。自軍左クリック → 合法地域への実右クリック → 次の `requestAnimationFrame` で命令線1本・`order-confirm` 発火を確認します。その時点ではserverの命令は空です。続けて別軍の通常Move・Supportを入力し、命令線・一覧・入力済み軍数を確認します。送信された命令数が1 → 2 → 3 → 最新3命令の確定であること、裁定前の軍位置不変、他参加者への秘密性を検証します。

続いてserverに不一致phaseのrequestを送って実際に拒否させ、誤った命令線の除去・確認済みHoldへの復元・エラー表示を検証します。同じテストをproduction build / HTTPS / WSSでも実行します。高速な同一軍への変更、キュー取消、遅延ack無視、自転車/バリケードの共通同期はunitでも確認します。

最終実行の最初の描画フレームでは、通常browser約42.2ms、production約11.4msで命令線1本とSE発火を観測しました。いずれもクリック後最初の `requestAnimationFrame` の観測値で、2秒のserver送信遅延より前です。固定の16ms保証ではなく、次の描画フレームでの反応を検証しています。

## 7. スクリーンショット・検証記録

`docs/screenshots/phase7f/` とその `production/` に保存しています。

- `optimistic-move-support-1920.png`: Move/Support入力・確定、盤面の軍位置不変。
- `refused-rollback-1920.png`: server拒否後のrollbackとエラー。
- `victory-concise-1280.png`: 短い勝利条件と閉じた詳細ルール。
- `optimistic-proof.json`: 2秒の遅延、最初の描画フレーム、SE発火、送信順、最新draftの確定、BGM設定の検証記録。credentials/tokenは含みません。

1920×1080と1280×720を目視確認しました。全体回帰で再生成された過去フェーズのスクリーンショットは、作業開始時に記録した内容へ戻し、Phase 7Fの検証記録だけを新規保存しています。音声ファイルはこの処理の対象にしていません。

## 8. 変更ファイル

- `apps/web/src/optimistic-orders.ts` / `useOptimisticOrders.ts`: client draft、保存キュー、rollback、確定。
- `apps/web/src/OnlineGame.tsx` / `useOnline.ts` / `BottomActionBar.tsx`: 即時描画、入力ロック分離、受付表示・SE、保存/確定中の表示。
- `apps/web/src/VictoryConditions.tsx`: 短い説明と詳細の折りたたみ。
- `apps/web/src/audio/AudioProvider.tsx`: ON設定と再生待ちの区別。
- `apps/web/src/optimistic-orders.test.ts` / `phase7f.test.ts` / `audio/audio-manager.test.ts`: 追加unit検証。
- `tests/gameplay-browser-helper.ts` / `tests/session-browser-helper.ts` / browser・productionの `phase7f.spec.ts`: 3クライアント・遅延・拒否・BGM/勝利条件の検証。
- 既存browserの `phase4a.spec.ts` / `phase5a.spec.ts` / `phase6c.spec.ts`: 確定完了待ち・設定ON表示・新しい勝利条件文言へ更新。
- `scripts/test-production.mjs` / `tests/production/https-fixture.ts` / `tests/production/public.spec.ts` / `eslint.config.js`: 音声を保護する検証用buildと資産検査。
- 本報告、音声ハッシュ記録、Phase 7Fのスクリーンショット・検証記録。

Phase 7Fで停止します。GitHubへのcommit/push、Pi/Renderへのdeployは実施していません。
