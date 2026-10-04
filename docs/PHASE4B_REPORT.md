# Phase 4B 完了報告

Date: 2026-10-03（日本時間）  
Status: Phase 4B完了。Phase 5 / Discord Activity / UI polishへ進まず停止。

spec、README、Phase 1 / 1.5 / 2A / 2B / 3A / 3B / 4Aの全完了報告、全DECISIONS、RULES_CORE / GAME_CORE / ONLINE_CORE / EVENTS_AND_EQUIPMENTを全文確認しました。コード実装より先にPHASE4B_DECISIONSの全文をspec第25節へ反映し、正本を0.9-draftへ更新しました。過去の記録は保持し、年数・同点・脱落年終了・順位は最新節を優先します。

## 1. シナリオ読込

Hostの開始前ロビーへ「京都シナリオJSONを読み込む」を追加しました。Phase 1エディタが保存するMapConfigをブラウザでparseした後、JSONをサーバーへ送り、厳格なruntime validationとサーバー自身のDatasetからのcompileを行います。クライアントのMapDefinitionを正本にしません。

サーバーはscenario id/name、MapConfig、compiled map、ValidationReport、設定と元Datasetを含むSHA-256を保持します。成功時だけ置換し、失敗時は以前のシナリオを保持します。非Host・開始後の変更を拒否します。ロビーに読込状態、採用地域数、SC総数、初期軍総数、ハッシュを公開します。配信キャッシュをroom code＋hashへ変更し、読込後は接続者全員へ新しい地図を送ります。

主要ファイル: `packages/online-core/scenario.ts`、`room-manager.ts`、`packages/shared/online.ts`、`apps/server/server.ts`、`apps/web/src/OnlineGame.tsx`。

京都00670の原本・元geometry・御苑境界は変更していません。京都初期設定は全227地域未採用・SC0・軍0を維持します。正式な採用範囲・配置を独断で作成していません。

## 2. Preflight

pure関数`validateScenarioForOnlinePlay`をサーバーから利用し、Start要求でも必ず検証します。3人でも全11区の採用地域・初期軍・正式初期所有SCを要求します。初期SCは従来の正式初期化どおり「地域の元行政区とhomeWardIdが一致するSC」を集計し、homeWardIdを現在支配やBuild規則へ使いません。

採用/SC/軍ゼロ、不正隣接、除外・侵入不能・非SCへの初期軍、重複軍、11区の設定不足、人数別目標がSC総数を超える場合、地図形式・検証エラーは開始不可です。

区ごとの数の差、連結成分、孤立・隣接数1、原本MultiPolygon、御苑分断、国境に接するSC/軍の個数はWarningとして表示します。Warningだけなら開始可能です。開始ボタンの近くでError / Warning件数と詳細を確認できます。地図を自動補正・採点しません。

## 3. maxYears・終了規則

`data/config/game-settings.json`へ既定`maxYears=5`と既存の人数別SC目標設定を集約しました。Hostの開始前指定も可能で、開始時に年数と勝利目標を固定します。ローカルもnull/省略なら既定5年を使います。旧`yearLimit`は互換用として保持します。

`packages/game-core/end.ts`の共通pure関数で次の優先順を実装しました。

1. 春・秋SC更新後に目標到達者がいれば即終了。到達者中の最多SCだけが勝利し、最高が同数なら同率勝者。
2. 冬清算後にSCゼロまたは現在支配する非SC地域ゼロの新規脱落があれば、その冬で終了。最終最多SCが勝利し、同数は同率勝者。
3. 上記がなければ第5年冬清算後に規定年数終了。同じ最多SC規則。

最終順位はSC降順の同順位。12/12/10は1/1/3位で、地域数・軍数によるタイブレークはありません。`status`、`maxYears`、`endResult`へ終了理由・年・季節・勝者一覧・順位・SC/全支配地域/軍数・脱落理由を保存します。旧`end`は互換情報として保持し、`tieUnresolved`はfalseです。

## 4. Game Over

共通`GameOver.tsx`をオンラインとローカルへ追加しました。GAME OVER、同率を含む勝者、終了理由・年/季節・目標、順位/player/ward/SC/支配地域/軍数を表示します。

試遊サマリーは命令フェイズ平均秒数、スタンドオフ・排除総数、4イベント発生数、自転車・バリケード取得/使用数、設置成功数です。実VC会話時間や面白さの自動評価ではありません。既存の地図・直前の裁定結果も閲覧可能です。フォント・美術・レイアウトの最終調整はしていません。

画像: [Game Over](../test-results/phase4b-game-over.png)。地図、終了理由、同率勝者を目視確認しました。順位表・サマリー・保存ボタンは既存sidebarのスクロールで確認できます。

## 5. Telemetry・Match Log

`packages/shared/match.ts`へ厳格schema、`packages/game-core/match-log.ts`へGameSessionと分離したログ層を追加しました。外部時刻を引数で渡すため、同じmetadata・入力・時刻なら決定的なtimelineになります。サーバーは実時刻、テストは注入時計を使います。

game start、phase start、各参加者確定、全員確定、裁定、撤退、SC更新、イベント生成、取得、封鎖設置/期限終了、冬増減員、脱落、game endを記録します。年・季節・フェイズ、提出数、秒数、SC/支配/軍/種類別装備数、スタンドオフ・排除・増減員数を保存します。内部で自動通過するSC更新も正しい季節として記録します。

下書き・予約は記録しません。最終提出命令は裁定後だけ保存し、未解決の確定命令もexportへ出しません。確定解除・再確定があれば確定時刻の記録は増えますが、下書き変更履歴は保存しません。平均Orders時間は各Orders開始から裁定完了までです。

Hostは進行中、終了後は全参加者が`match-log.json`をdownloadできます。game id、scenario hash、nickname/区割当、無所属区、seed、イベント/勝利設定snapshot、最終結果、timelineを含みます。復帰token・socket ID・下書き履歴・未解決予約は含めず、共有schemaで検証したコピーだけを返します。

## 6. オンライン動作

3独立ブラウザcontextでHostのJSON読込、不正JSON時の保持、全11区Preflight、warning付き開始、既定5年、2季節裁定から冬の終了を検証しました。全画面の同率順位を比較し、Hostのdownload JSONのschema・最終結果・秘密情報非混入を確認しました。終了後の再読込で同じ順位へ復帰します。

終了後のorders / retreats / winterをサーバーで拒否します。全員確定の同期裁定、未入力Hold、秘密命令、本人だけの予約、再接続、冬の手動Disbandを維持しました。自動裁定中にawaitを挟んでいません。

以前のオンラインfixtureは11区・SC総数の開始要件へ更新しました。非SCに置いていた初期軍をSCへ直したため、撤退回帰の攻撃側にも冬の0Build確定を追加しています。既存テストは削除していません。

## 7. ローカル共用

同じgame-coreの終了判定・順位・`summarizeMatch`を使います。Reactへ別の勝利規則を実装していません。ローカルでも既定5年、同率勝者、GAME OVER、試遊サマリーとログ保存を利用できます。初期状態へのresetはログも新しく開始します。命令編集・装備予約の下書きはログへ入れません。

ローカルは従来のPreviewをコピーする検証モードで、オンラインの11区Preflight・無所属抽選を適用しません。ローカルログのscenarioHashは`local:mapId`という識別値で、オンラインのSHA-256ではありません。静的設定・Previewはゲーム結果で更新せず、モード切替では年間状態を保持します。

## 8. テストと結果

| チェック | 結果 |
| --- | --- |
| npm.cmd run lint | 成功 |
| npm.cmd run typecheck | 成功（最終buildでも実行） |
| npm.cmd run test | 12ファイル・246件成功（既存225＋追加21） |
| npm.cmd run build | 成功、NOTICE/licensesを保持 |
| E2E_PREVIEW=1 npm.cmd run test:browser | 最終本番ビルドで24件すべて成功（既存23＋追加1） |
| npm.cmd run map:validate | エラー0・既存警告9、227地域・採用0・SC0・軍0 |
| START_ONLINE.cmd | 既存5173を維持して5174/3001へ起動、双方HTTP200、30秒超の継続を確認 |

起動確認後はCtrl+CとYで今回起動した5174/3001だけを停止しました。既存5173は停止後もHTTP200です。HTTP確認成功後の継続中に起動失敗メッセージは出ていません。

追加21件は保存MapConfig compile・hash、JSON/schema拒否、京都227原典＋保存fixture smoke、全11区不足、不正配置/隣接/重複、人数別SC総数不足、warningのみ開始、Host権限・原子置換、春秋勝利、同時達成の差/同率、1/1/3順位、5年全季節進行、脱落優先、終了後入力拒否、時間・privacy・export・最終結果一致、決定性・pickup、実バリケードの設置と4季後の期限終了を検証しています。

保存fixtureは`tests/fixtures/phase4b-kyoto-map-config.json`（44採用/33SC/11軍）です。ブラウザの早期終了検証では3希望区の非SCだけを無効化し、冬の非SCゼロ終了を起こします。ゲーム用の推奨配置ではありません。公式227KMLのSHA-256、御苑、旧JSON、裁定・装備・起動回帰も成功しています。

WindowsのNode/esbuild実行に必要な制限外実行を利用しました。追加依存はありません。既存のZodコメント除去警告、約534KB（gzip約163KB）のJS chunk警告、タブ破棄時のVite ws proxy ECONNABORTEDは残ります。ビルド・再接続・全ブラウザ操作は成功しています。

## 9. 初回試遊の操作

1. 地図エディタで人が全11区の採用・初期SC・SC上の軍を設定し、「設定JSONを保存」。3人なら総SC23以上を確認します。
2. START_ONLINE.cmdをダブルクリックし、表示されたONLINE GAME URLを開きます。
3. 「オンライン対戦」→nickname→「ルームを作成」。
4. Hostが「京都シナリオJSONを読み込む」で保存ファイルを選びます。
5. 他参加者が同じURLと6文字コードで参加します。同じPCなら通常の新規タブで3人分を開きます。
6. Error 0を確認し、Warning詳細を確認します。既定年数5年のままHostが開始します。
7. 秘密命令・撤退・冬調整を確定して進行します。撤退中は交渉禁止。
8. GAME OVERを確認し、「試遊ログをダウンロード」。サーバー停止前にMapConfigとログを保管します。

詳細・LAN・停止・資料の集め方は [PLAYTESTING.md](PLAYTESTING.md)、README第16/18節を参照してください。

## 10. 既知の制限

部屋・進行・ログはメモリのみで、サーバー再起動復旧はありません。ログはゲーム保存データのimportや自動リプレイではありません。未確定の切断者を強制処理せず、同じタブの復帰を待ちます。観戦・timer・AFK skip・AI・Discord Activity・インターネット配備は追加していません。複数物理PCのLANと11端末負荷は今回実測していません。

シナリオはHostが人の編集済みJSONを用意する必要があります。初期設定から試遊地図を自動作成しません。SC目標・非SCゼロ脱落・5年・イベント重みは試遊用の仮設定です。今回重み調整・新規イベント・UI polishへ進んでいません。

## 11. 初回の人間試遊で集める資料

使用MapConfigとmatch-log.json、ロビー検証詳細、全体地図とGAME OVER順位/サマリーの画像を保存してください。人数・時間・交渉方法、詰まったUI操作、SCや非SC地域の取り合い、最初の脱落時期、装備が交渉や進軍に与えた影響をメモします。

不具合は直前の操作・年/季節/フェイズ・起動画面のエラーを記録します。復帰tokenやsessionStorageは送らず、保存ログと地図設定をChatGPTへ渡します。ゲームの評価や次のバランス調整は人が判断します。Phase 4Bで停止します。
