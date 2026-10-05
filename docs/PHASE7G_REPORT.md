# Phase 7G: 地理装飾・作戦公開・裁定結果再生・移動ターン履歴

ゲームルールを変えず、オンライン対局の公開・再生・閲覧を実装しました。裁定関数、勝利判定、補給拠点更新、撤退、Build / Disband、イベント・装備処理、標準シナリオ、KML / MapConfigは変更していません。commit / push / Pi・Renderへのdeployは行っていません。

## 1. 京都の簡易地理レイヤー

`data/config/kyoto-geography.json` に、鴨川・桂川・京都駅・地下鉄烏丸線・地下鉄東西線の概略線を保存しました。`KyotoGeography.tsx` が既存の地理座標投影を使ってSVGを描きます。地形背景の上、地域塗りの下に置き、軍・補給拠点・命令線より後ろです。淡い川・破線の地下鉄・小さい駅表示はpointer-transparentで、クリック・隣接・通行・支援へ影響しません。京都のプレイヤー向け地図だけに表示し、独立したcomponentとして将来のON/OFFに対応しやすくしています。

公式の地理・路線情報を参考にした独自の簡略線であり、実測境界や交通経路ではありません。画像・素材は取得していません。

- [京都市交通局・地下鉄路線図](https://www.city.kyoto.lg.jp/kotsu/page/0000008995.html)
- [京都府・鴨川](https://www.pref.kyoto.jp/kamogawa/index.html)
- [京都府・桂川、鴨川流域](https://www.pref.kyoto.jp/suishitu/jyoujikanshi/katuragawa.html)

## 2. 全員確定から次フェイズまで

1. 最後の参加者が確定すると、従来の `adjudicateGameOrders()` を**一度だけ**呼び、全軍の同時裁定結果を独立したcopyとして保持します。
2. serverの現在盤面は移動前のままです。`playback.stage = reveal` と、装備instance IDを除いた公開命令・移動前の軍を全員へ配信します。この時点では結果snapshotを公開しません。未確定時の他者draftも公開しません。
3. 合成ほら貝の合図を1回鳴らし、「全員の命令が確定しました」と全Move / Support / Hold / 装備命令を表示します。ゲストは「ホストが裁定開始するのを待っています」となります。
4. ホストの「▶ 裁定開始」で確定済みsnapshotとserver側の再生時計を配信します。ここで裁定をやり直すことはありません。
5. 「≫ 早送り」は4倍速、「演出をスキップ」は同じ確定結果へ進みます。ホスト以外・旧演出IDからの操作はserverも拒否します。
6. 再生完了後に保持済みの結果を現在stateへ反映し、既存の撤退・補給拠点更新・次フェイズ処理へ進みます。演出中は命令編集・確定解除をserverとclientの両方で止めます。

通常再生の完了はserver timerが決め、背景タブやclientの描画停止に進行を依存させません。切断後に途中で戻ったclientも、現在の公開待機状態または再生位置を再取得します。再接続で同じ全員確定の合図を重ねて鳴らしません。timer経由の完了配信と秘密を含まない失敗ログも追加しました。

## 3. 確定結果の再生順

`packages/shared/playback.ts` は、公開命令の出発地・目的地・自転車経由地・設置対象・支援対象から表示用の依存graphを作ります。判定・強度計算・再裁定は行いません。

- Stage 1: 他の命令の地域・対象と交わらない成功Moveを勢力ごとにまとめ、1グループ700msで再生します。区名、移動線、対象地域を軽く強調します。
- Stage 2: 競合・占有軍への攻撃・支援・支援カット・失敗・排除・装備命令などを依存component単位でまとめ、1局面2400msで再生します。支援確認→進軍→結果の順で、関係する線と地域だけを強調します。関係のない地域を黒く暗転させません。
- Stage 3: 最後の1100msで確定配置を表示し、完了時にauthoritative盤面へ切り替えます。失敗Moveは元へ戻り、自転車の両区間、スタンドオフ、排除もcore結果から表示します。撤退が必要な軍には従来の表示を使います。

依存判定は安全側にまとめるため、同じ勢力の関連命令もStage 2になり得ます。reduced motionでは途中移動を減らし、確定位置へ切り替えます。演出位置をserverへの命令・裁定入力に使うことはありません。

全員公開・ホスト操作・共有時計による再生はオンライン対局が対象です。地理装飾は京都のローカル試遊にも表示します。ローカルの既存「移動を裁定」操作は維持しています。

## 4. 春・秋の履歴

各移動裁定直後の `TurnSnapshot` をserverメモリに追加します。春と秋がそれぞれ1ターンです。初期配置や冬だけの履歴は追加しません。

保存内容は、軍と領土・補給拠点所有者のboard、Ground Equipment、Barricade / Roadwork / Bus等のpublic events、年・季節、裁定時に公開された命令と結果です。snapshotは**移動裁定直後・撤退前**の記録であり、その後の撤退先や装備取得はこの記録へ追記しません。排除された軍の情報は公開裁定結果にも保持します。

inventory・予約・未公開draft・reconnect credentialsをhistoryへ保存・配信しません。schemaの明示allowlistを通し、clientへ渡したhistoryを変更してもserverの履歴や現在stateは変更されません。

「← 前ターン」「→ 次ターン」「現在に戻る」と、年・春秋を示す「履歴表示」を追加しました。命令線は「このターンの命令を見る」で表示でき、初期値はOFFです。履歴中の地図・イベント欄・地域の所有表示も選んだsnapshotから読みます。現在の私有装備・命令一覧は履歴に混ぜません。

履歴中は地図の左クリック・右クリック・keyboardから命令を出せず、確定・撤退・冬の入力もできません。カメラ操作と公開イベントの場所確認は可能です。現在のphase / board / server state / OptimisticOrdersを巻き戻さず、MapCanvasへ渡す閲覧用dataだけを切り替えます。通信待ちのdraftがある状態で履歴へ入り、現在へ戻っても同じdraftが残ることをE2Eで確認しました。

再読み込み・再接続では公開stateからhistoryを再取得します。DBは追加していません。Backend再起動・再deployでRoomと履歴は失われます。

## 5. 音響と既存音声の保護

ほら貝風の合図はWeb Audioで174Hzの基音と倍音、短い立ち上がり・減衰を合成します。外部音源・新しい依存ライブラリは使用せず、`public/audio`への書き込みも行っていません。

既存のSE ON/OFF・音量を使います。音量変更・OFFは合成音にも適用され、AudioContext未対応・autoplay拒否は無音で継続し、設定を書き換えません。「音量・設定」に合図の試聴も追加しました。march、support-success、standoff等の既存音とBGMも維持しています。オンラインの共有演出が完了した後にも結果SEが正しく発火するようにしました。

開始時に `apps/web/public/audio/` の11ファイル（ユーザー追加MP3 2本、既存WAV 7本、README 2本）の相対パス・サイズ・SHA-256を記録しました。全テスト・build終了後、11ファイルすべて存在し、サイズ・SHA-256が開始時と一致することを確認しました。最終照合結果は [PHASE7G_AUDIO_INTEGRITY.json](PHASE7G_AUDIO_INTEGRITY.json) に保存しています。`/audio/bgm/domestic.mp3`・`/audio/bgm/adjudication.mp3` の参照は維持しています。

## 6. 検証

| 検証 | 結果 |
|---|---|
| `npm.cmd run lint` | 成功 |
| `npm.cmd run typecheck` | 成功 |
| `npm.cmd run test` | 36ファイル・410件成功 |
| `npm.cmd run build -- --outDir ../../.reference-cache/phase7g-final-build-20261005` | 成功。既存のdist・音声を消さない専用出力先 |
| `npm.cmd run test:browser` | 全58件成功 |
| 最終パネル修正後の `test:browser -- tests/browser/phase5b.spec.ts tests/browser/phase5c.spec.ts tests/browser/phase7f.spec.ts tests/browser/phase7g.spec.ts` | 関連9件成功 |
| `npm.cmd run test:production` | 最終ソースのproduction buildとHTTPS / WSSテスト8件成功 |
| `npm.cmd run map:validate` | 成功。既存の9警告あり |

並行検証中に、既存のPhase 5A.1地図読込テスト1件が5秒の制限を超えました。他の検証終了後にunit一式を単独で再実行し、410件すべて通過しました。timeoutの設定や地図処理を変更して通したものではありません。

mapの警告は、編集用初期設定の採用地域が未設定であること、京都御苑の障害物との重なり・分割、原本の複数部分の地域です。標準シナリオ190地域 / 補給拠点72 / 初期軍59は既存のunit・browserでも検証しています。生成validation reportも内容は変わっていません。buildには500kB超のbundle警告が残っています。

追加unit検証は、独立Moveと衝突の分類、Supportの同じclusterへの所属、実際の再生時間割を逆順にした場合の最終位置一致、Stand-off / Dislodge / Support Cutのcore結果一致、skip / 通常完了 / 早送りのboard一致、春秋履歴の独立性・再接続、合成SEのOFF / 音量 / API欠落です。

3クライアントE2Eでは、公開前の位置保持・全命令同時公開・ゲストの待機・ホストだけの開始、Stage 1→2、skip後の全client配置一致、2秒通信遅延中のdraft保持、履歴のread-only・前後移動・現在復帰・reloadでの再取得を確認しました。HTTP開発serverと、production buildのHTTPS / WSS公開origin相当の両方で実行しています。閉じた過去結果パネルが同じ結果の再配信で再び開かないことも確認しました。

途中で見つけた履歴バーによるカメラボタン遮蔽、開発画面の結果欄重複、reduced motionの旧挙動、履歴に現在のイベントが混ざる表示、同じ結果の再配信で閉じたパネルが開く挙動は修正しました。旧回帰テストはホストの開始・skip操作を明示して進む形へ更新し、game ruleのassertionは維持しています。既存フェーズのスクリーンショットはテスト前の個別バックアップから戻し、今回の画像だけを追加しました。

## 7. スクリーンショット

1920×1080と1280×720で公開待機・履歴を保存し、1280×720で独立移動・衝突の演出も保存しています。保存画像を目視確認し、履歴のラベル・入力禁止、イベント欄、地理背景、カメラボタン・命令公開パネルの配置を確認しました。

| 開発環境 | 内容 |
|---|---|
| [orders-revealed-1920.png](screenshots/phase7g/orders-revealed-1920.png) / [1280.png](screenshots/phase7g/orders-revealed-1280.png) | 全命令公開、位置保持、ホスト開始、京都地理 |
| [peaceful-stage-1280.png](screenshots/phase7g/peaceful-stage-1280.png) | Stage 1 |
| [conflict-stage-1280.png](screenshots/phase7g/conflict-stage-1280.png) | Stage 2 |
| [history-1920.png](screenshots/phase7g/history-1920.png) / [1280.png](screenshots/phase7g/history-1280.png) | 履歴の表示・公開命令・入力禁止 |
| [proof.json](screenshots/phase7g/proof.json) | E2E確認項目 |

HTTPS / WSSのproduction版も `docs/screenshots/phase7g-production/` に同じ名前で保存しています。公開インターネット・Pi実機へdeployした画像ではありません。

## 8. 主な変更ファイル・運用上の注意

| ファイル | 変更 |
|---|---|
| `packages/shared/online.ts` / `playback.ts` | 厳格な公開schema、host操作、表示用graph・時計 |
| `packages/online-core/room-manager.ts` / `apps/server/server.ts` | 確定結果の保持、共有演出の完了・配信、public history |
| `OnlineGame.tsx` / `AdjudicationPresentation.tsx` / `MapCanvas.tsx` / `TurnHistory.tsx` | 公開待機、段階再生、readonly履歴 |
| `KyotoGeography.tsx` / `data/config/kyoto-geography.json` / `phase7g.css` | 装飾・レイヤー順、カメラボタンとトレイの干渉回避 |
| `audio/sfx-manager.ts` / `AudioProvider.tsx` / `GameFeel.tsx` | ローカル合成の合図、設定・結果SE |
| unit / browser / productionのテストとhelper、README / PLAYTESTING | 新フロー・履歴の検証と操作説明 |

FrontendとBackendの両方の更新が必要です。旧Frontendには新しいホスト操作がないため、片側だけの本番反映は行わず、同じ版を揃えてください。今回は実際の更新・公開を行っていません。

既存の `dist/audio` を含む出力を消さないため、buildは新しい専用出力先を使いました。最終の単独buildは `.reference-cache/phase7g-final-build-20261005/`、productionテストは既存helperが作る毎回新しい出力先です。既存の `dist` は今回更新していません。検証用buildをそのまま本番接続先へ流用せず、実際のBackend URL等の既存設定を使って手動反映時にbuildしてください。

残る課題は、地理装飾の細部・大きな依存局面での情報量・実機上の音色や演出テンポの好みです。地理線は概略で、ON/OFF UIはまだありません。履歴はサーバーメモリ内のみです。対局中のHost移譲ルールは変更していないため、ホスト不在の作戦公開待機はホスト自身の復帰を待ちます。Pi・スマホの実回線での体感確認は今回のローカルブラウザ検証とは別に必要です。
