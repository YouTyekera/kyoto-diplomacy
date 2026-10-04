# Phase 7A 実装・検証報告

確認日: 2026-10-04。**公開Web対応の実装とローカル本番相当の検証は完了。GitHub push・Render Deploy・実公開URLの取得は未実施。** Phase 7Aで停止する。

## 実施順と範囲

指定されたspec、README、Phase 6B報告、最新PLAYTESTING、DECISIONS全13ファイル、Phase 6C決定、Phase 7A公開方針、両実装プロンプトを全文確認した。UI/UX Guideとオンライン構造の資料も確認した。最初に6C決定をspec第32節へ反映し、6C単体の6コマンド・全44件ブラウザ回帰・実画面確認・[PHASE6C_REPORT.md](PHASE6C_REPORT.md)を完了した。**その後にのみ**Phase 7A方針をspec第33節へ反映し、公開対応を実装した。

ゲーム/裁定/勝利/イベント/装備/MapConfig/KMLは変更していない。開始時のSHA-256と比較し、packages、data/source、data/maps、data/configの**285ファイルが一致**した。Backendの2既存ファイルは通信・設定・終了処理のみ変更し、設定モジュールと検証を追加した。DB・Discord Activity・新ルールを追加していない。

## 1. 構成と本番entry

React/Vite FrontendをRender Static Site / Free、Node/Socket.IO BackendをRender Web Service / Freeとして分離する。root packageは一つでworkspaceなし。Backendの起動は `npm run start:server` → `node --import tsx apps/server/main.ts`。build:serverは既存全体の型確認で、独自の未検証コンパイル形式へ置き換えていない。

`apps/server/config.ts`はproductionのPORT必須、1～65535の整数を検証し、0.0.0.0に固定する。FRONTEND_ORIGINは公開HTTPS origin必須で、wildcard・localhost・資格情報・path/query/hashを拒否する。developmentのlocalhost/LAN接続は開発モードだけ許可する。

GET `/health` は200 / `{"ok":true}`、no-store、Vary: Origin。Render自身のOriginなしprobeは利用可能。ブラウザからのhealthには許可Frontend originだけAccess-Control-Allow-Originを返す。別originは403、OPTIONSは204。

SIGINT/SIGTERMで新規受付を止め、Socket.IOとHTTPを閉じる。closeは冪等で、8秒後に残接続を切断する。Render側のshutdown待ちは15秒。実entryのPORTとhealthを起動確認し、Windows上で `process.emit('SIGTERM')` によりhandlerを呼んで終了code 0を確認した。Render/Linuxから実OS signalを送る配備確認は公開後に残る。

## 2. 本番URL・origin・秘密情報

Frontendはbuild時の `VITE_ONLINE_SERVER_URL` を使用する。`VITE_PUBLIC_DEPLOYMENT=true`または公開ホストのproduction buildでは公開モードとなり、接続先未設定/無効なら設定エラーを表示する。localhostへ自動代替しない。開発とローカルpreviewは現在のFrontend originをVite proxyへ接続する。healthの開発proxyも追加した。

公開画面は「公開サーバー」と表示し、招待リンクは `window.location.origin` の公開Frontend URLから生成する。Backend URLやlocalhostへ招待しない。実ブラウザのclipboardからコピー結果を読み取り、招待URLとして2人が参加した。

productionではSocket.IO CORSをexact originだけ許可し、**WS handshakeにもallowRequest検証**を行う。CORSだけに依存しない。Originなし/別origin/localhostのproduction WSと別origin pollingを拒否する。HTTP/WS用debug endpointを本番entryへ登録していない。予期しない例外の詳細をproduction ackへ露出しない。

既存のroom codeはcryptoの6文字・32種類（30 bit）、reconnect tokenはcrypto 32 bytesのまま。tokenをログや公開view/試遊ログへ出す処理を追加していない。シナリオ診断はrequest ID・段階・件数のみ。意図的な秘密文字列を含む不正uploadでもログにtokenが含まれないことを検証した。VITE変数に秘密値を設定しない手順と.envのignoreも追加した。

## 3. cold start・backoff・復帰

`online-connection.ts`はconnecting / waking / retrying / online / unavailableを管理する。healthのJSON ok:trueを確認してからSocketへ接続する。Render起動中のHTMLや503・通信失敗は吸収する。

「サーバーを起動しています。初回はしばらくかかることがあります。」を表示し、Frontend・ニックネーム入力・戻る操作は使える。Socketの生エラーをプレイヤーへ表示しない。待ち時間は1、2、4、5秒を基準にjitterを加え、約90秒でunavailableと再試行ボタンを表示する。user retryは新しい接続サイクルを開始する。unmount時の古い結果が新しい画面を上書きしない。

Socket.IO標準reconnectionを無効にして、health確認を含む一つのbackoff経路へ統一した。接続後に常時healthをpollせず、Freeの休止回避を目的とする定期アクセスはない。WSS切断後は再接続して、タブ内の参加情報で本人用状態を再取得する。再読込時に裁定演出を再実行しない。サーバー再起動などで復帰を拒否された場合はロビー入口へ戻し、保存参加情報を消して新規対局を作る説明を表示する。

再接続待ち・通信応答待ちの間は従来どおり命令入力をlockする。ネットワーク越しの実機確認では、Moveが受理された後に軍を切り替える必要がある。これを新しいゲームルールや自動命令へ変更していない。

## 4. Render設定と再現性

root [render.yaml](../render.yaml)に2サービス、Backend Free/Singapore、Frontend staticPublishPath dist、main branch、autoDeployTrigger 'off'、health、envを保存した。Static Siteに未対応のplan指定をしていない。

| 対象 | build | start |
| --- | --- | --- |
| Frontend | npm ci --include=dev && npm run build | Static Site: ./dist |
| Backend | npm ci --include=dev && npm run build:server | npm run start:server |

既存package-lock v3を維持し、依存の追加や更新はせず、root enginesを `>=24 <25`に合わせた。.node-versionは24。tsx/TypeScriptは既存devDependencyなのでproductionでも--include=devを明示する。実検証Nodeは24.16.0。`npm ci`の配備先新規インストール自体はRender作成後のbuildで確認する。

YAMLをjs-yamlでparseし、2サービスの種類・Free・branch・offの設定を確認した。公式Blueprint仕様を参照した。Render Dashboard/CLIでの配備プレビューと完全なplatform validationは未実施。ローカルの既存Ajvは公式2020-12 schemaに未対応なので、成功したとは扱わない。Deploy Blueprint前の画面でエラーがないことを利用者が確認する手順を保存した。

Service Auto-Deploy OFFに加え、**Blueprint SettingsのAuto Sync No**を案内した。Blueprint変更のpushによる自動構成反映も停止する。構成更新はManual Sync、コード公開はManual Deploy。数か月後の利用に必要なGitHub source、lock、env、公開URLを残す。

## 5. UIと6Cの回帰

公開接続のstatusを軽い帯として表示し、非接続中も盤面を保持する。シナリオuploadのエラーを入力箇所と全体の2箇所へ重複表示する症状を修正した。

1920×1080と1280×720の画像点検で、支援dockの「小川の小川 → 西陣」のような重複が残っていたため、「小川 → 西陣への移動を支援」へ修正した。ルールや選択手順は変更していない。

画面付きChromiumでも公開設定のHTTPS/WSS・3人参加・自軍左クリック→合法地域右クリックを確認した。両解像度で本人用Move、矢印1本、dock「移動 → 西陣」を確認し、受理後に軍を切り替えてSupportと自然な説明を確認した。独立した確認記録にtokenを含めていない。6Bの山地、色味、WAV、補給拠点選択リング、6Cの小さい中立拠点・hit target・最大ズーム・勝利条件を維持した。

## 6. テスト

| 検証 | 結果 |
| --- | --- |
| npm.cmd run lint | 成功 |
| npm.cmd run typecheck | 成功 |
| npm.cmd run test | 24ファイル・339件成功 |
| npm.cmd run build | 成功（通常distと公開設定dist-public） |
| npm.cmd run test:browser | 全44件成功（4.2分）。最終の支援文言は公開版統合と実画面でも確認 |
| npm.cmd run map:validate | Error 0 / Warning 9、227地域・標準採用0を維持 |
| npm.cmd run test:production | 公開build内の固定localhost URLなし、HTTPS/WSS追加2件成功（15.4秒） |
| 本番entryの終了 | PORT/0.0.0.0、health 200、SIGTERM handler終了code 0 |

公開統合は実production entryを起動し、別々のローカルHTTPS originから**本物のWSS upgrade**を行う。テスト専用の公開自己署名証明書を使い、証明書無視はテストのbrowser contextだけで行う。本番コードのTLS検証を無効化していない。

3クライアントで作成、clipboardの招待URL、参加、区割当、実マウスMove、Support、全確定、1回の裁定、本人再読込、WSSを閉じた後の再認証を確認した。7種類のSEは公開Frontendのasset pathで200とRIFFを確認。未配置BGM2パスは404でも対局・裁定・復帰が継続した。既存6B回帰で7 WAVの実再生・OFF・音量・欠損時の継続も成功した。外部音源を追加していない。

初回通常回帰は43件成功・1件失敗で、uploadエラーの重複表示を修正して44件へ復帰した。公開追加テストは、閉じた結果トレイ内のボタンを待つ手順で時間切れになり、トレイを開く実操作へ修正して成功した。テスト用HTTPS proxyの接続終了も整理した。最後にhelperのWindows shell呼出しをNode経由へ変更し、再完走を確認した。

既存build警告（約599KB JS / 500KB目安超過、Zod注釈）とmap警告9件は残る。Vite proxyの終了時ECONNABORTEDは既存の終了ログ。テスト専用の自己署名証明書に由来するChromium TLS診断は実Render TLS障害の証拠とは扱わない。

## 7. 保存画像・確認記録

[screenshots/phase7a](screenshots/phase7a)へ保存した。

- `public-move-support-1920.png` / `public-move-support-1280.png`: HTTPS/WSS統合でMove・Support・dock。
- `public-reconnected-1280.png`: 裁定後と本人復帰。
- `public-waking.png` / `public-unavailable.png`: 起動待ちと再試行。
- `manual-public-move-1920.png` / `manual-public-move-1280.png`: 画面付き独立確認の右クリックMove。
- `manual-public-support-1280.png`: 実画面のSupportと最終文言。
- `manual-operation-proof.json`: 両サイズのMove・矢印・dock、Supportの確認。tokenなし。

Phase 6C単体の9枚は[screenshots/phase6c](screenshots/phase6c)に保持した。

## 8. 制約・未実施・利用者の操作

**Render Backendの再起動・再deploy・休止・保守が発生すると、進行中のRoomは失われる可能性がある。** サーバーメモリのみで、tokenは同じプロセスへの本人復帰用。進行途中の対局を数か月保存する機能は実装していない。公開URLへ数か月後に戻って、新しいゲームを始める構成を優先した。

この環境には.gitがなく、GitHub repository/remoteやRenderアカウントへの配備を行っていない。**実公開URLなし、別インターネット回線での接続、実Free sleep/wake、Render managed TLS、Render上の初回npm ci/deployは未確認。** ローカル本番相当テストを実公開完了とは扱わない。

公開前に利用者が行う作業:

1. GitHub repository作成・Git本人設定・main commit/push。
2. Renderログイン・GitHub連携・Blueprintの2サービス作成。
3. 実Frontend/Backend URLを相互envへ設定し、Deploy。
4. Service Auto-Deploy OFFとBlueprint Auto Sync No。
5. health、公開HTTPS/WSS、3端末・別回線・実cold start・再接続・音量/SEを確認。
6. 承認したシナリオJSONをホストが読み込み、公開Frontend URLを友達へ共有。

画面上の具体的な手順は [DEPLOY_RENDER.md](DEPLOY_RENDER.md) に記載した。京都標準は採用0のままなので、テストfixtureを正式配置として自動公開していない。

残るUI課題は小さい画面/密集地帯の地名、音量の複数機器評価、応答待ち中の操作feedback。11人長時間・実Free稼働負荷は未検証。Phase 7Aの実装範囲で停止する。
