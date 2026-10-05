# Phase 7E.1: Identity Handshake Reliability

実施日: 2026-10-05。参加identityのackと状態配信の順序、preflightの重複計算を修正しました。ゲームルール、標準JSON、勝利条件、地図・MapConfig、Tailscale、ブランド・OGP・Audioは変更していません。Pi/Renderへの反映、GitHubへのcommit/push、実公開URLでの試遊は未実施です。

## 1. ServerにplayerがあるのにlocalStorageが空になる理由

従来のrequest handlerは `manager.request → publish(current/previous) → ack` の順でした。create/joinの成功時点で、サーバーにはplayerId/tokenとsocketの結合が確定します。一方、Frontendがcredentialsを永続保存するのは成功ackを受信した後です。

publishではpreflight・公開状態/Mapのschema処理・本人用状態の生成・Socket.IO配信を行います。この同期処理が長引いて10秒のack期限を超えると、Frontendの `emitWithAck` は失敗し、後からackが届いてもcredentialsを保存できません。player作成はすでに成功しており、サーバー側には残ります。この状態で同名の新規joinを試すと、7Eの重複防止が正しく拒否するため、本人は保存identityを持たないまま復帰できなくなります。

publishが例外で失敗する場合も、従来は成功credentialsを返す前にエラー応答になり、同じ不整合を作り得ました。

公開状態の生成では `preflight()` の後に `startErrors()` が再度preflightを呼び、Mapあり/なしの公開状態を別々に生成する場合は合計4回の計算になっていました。190地域の不変なgeometryをpresence更新のたびに検証する必要はありません。

## 2. Ack順序とpublish失敗の扱い

create/join/reconnectの成功時は、次の順に変更しました。

1. `manager.request()` がplayer作成またはtoken認証・socket再結合を完了。
2. 成功ackを直ちに送信。create/joinはcredentialsを含む。
3. `setImmediate` で次のイベントループへpublishを予約。
4. Frontendはack受信でcreate/joinのcredentialsをlocalStorageへ保存し、snapshotを保存条件にしない。
5. 予約したpublishでauthoritative public/private snapshotを配信。
6. Frontendが現在sessionとsnapshotの一致を確認して操作を解放。client/serverの処理は並行ですが、ackはsnapshotより先に送信します。

ackの関数を先に呼ぶだけでは、その直後の同期処理が通信I/Oを塞ぐ可能性があります。このためpublishを次のイベントループへ回しています。同じRoomの予約はまとめ、配信時点の最新状態を生成します。削除されたRoomは配信せず、終了時には予約を取り消します。request中に発生するホスト移譲通知からも、ackを迂回して同期publishが走らないよう予約方式にしました。

通常の命令・設定操作の配信/ack順序は維持しています。ackは一度だけ返します。成功ack後のpublish失敗を二度目のエラーackで上書きしません。

publish例外は `[server-error] publish failed` とroomCodeで診断できます。例外のmessage/stack、request、snapshot、credentialsをログに渡しません。tokenを含む例外を意図的に発生させたproduction設定の統合テストでも、token非出力と二重ackなしを確認しました。

publish失敗でsnapshotが届かない間、clientは保存identityを持ったまま操作をロックします。保存済みidentityで再読込・再接続すれば、再び同じplayerとしてsnapshotを要求できます。ack成功だけでRoom操作を許可する変更はありません。

## 3. Preflight最適化

検証を次の2層に分けました。検証内容と勝利目標計算は変更していません。

| 対象 | Cache/更新条件 |
| --- | --- |
| geometry、地域/隣接/初期軍/補給拠点の検証、区別集計、警告 | Roomのcompiled scenarioに保持。scenario/hash/Map/config/report参照の変更時に再検証 |
| 参加人数に応じた目標が補給拠点総数を超えないか | `scenario hash + player count + game settingsの値` をkeyに更新 |
| 3〜11人、全員socket接続済み | cacheせず、毎回現在のRoomで確認 |

人数・関連setting変更時は軽い判定を再計算し、不変なMap検証を再実行しません。scenario変更時は不変部分も更新します。拒否されたscenario変更では既存cacheを維持します。返した検証結果を変更して開始制約を消せないよう、cacheの配列・結果をfreezeしています。Room単位のWeakMapで保持し、古いRoomの履歴を無制限に蓄積しません。

`serializePublicState()` が計算したpreflightを `startErrors()` へ渡して重複をなくしました。publish内でも公開状態を一度だけ生成します。初めてMapを送るclient向けには、その公開状態へMapを付加します。配信用Mapのschema parse結果もcompiled Map参照ごとにcacheし、join/reconnectのたびに同じMapをparseし直しません。Map自体のJSON送信は初回・再接続・scenario差替えで引き続き必要です。

正式京都190地域で、1〜11人へのjoin、disconnect/reconnect、kick、leaveを通して、Roomの不変Map検証と準備処理はそれぞれ1回でした。初回のscenario読込・compileの検証は省略していません。ゲーム設定を変えたテストでは目標超過による開始拒否も維持しました。

## 4. ClientのroomSessionReady

Phase 7C/7Eの `OnlineSession` の判定は変更していません。認証ack、publicState、privateState、roomCode、本人playerId、phaseKey、本人の接続表示が現在sessionと一致するまで `roomSessionReady=false` です。古い接続世代のackや別人/別Room/別phaseのsnapshotでも解放しません。

新規参加のackが先に届いた場合は、snapshotを待つ間「ルームへ再接続しています…」を表示し、create/joinを含む参加操作を無効のままにします。snapshotが揃ってから接続表示を操作可能状態へ戻します。

reconnectのack期限は10秒のままです。ack認証後のsnapshot待ちは別に30秒設け、状態配信に11秒かかっても途中で接続を捨てないようにしました。30秒以内にsnapshotが揃わなければ既存のbackoff再試行へ戻り、操作は解放しません。create/joinの保存はsnapshot受信を待ちません。

## 5. Identity保存テスト

実ブラウザで以下を確認しました。

- 標準Room新規作成、guest join直後に端末履歴が1件存在。
- 同じタブのreloadで同じplayerIdへ復帰。
- Host + guest2人の人数が3人のままで、新しいplayerが増えない。
- 同じブラウザの新規タブで招待URLへ再訪すると「○○として復帰」が表示され、新規joinが最初の選択肢にならない。

さらに、ブラウザとは別プロセスのテストサーバーで、create/join/reconnect後のpublishをそれぞれ **11秒間、同期的に停止** しました。単なるclient側のsnapshot保留ではなく、サーバーのイベントループを止める試験です。

create/joinでは新規localStorage保存時刻が10秒以内であること、reconnectではack受信が10秒以内で保存identityが維持されることを確認します。3操作ともsnapshot受信は11秒以降となり、その間は復帰中表示・操作ロックを維持します。試験用の停止処理は `tests/` のfixtureだけにあり、本番アプリへdebug endpointや待ち時間設定は追加していません。

最終の全ブラウザ実行での計測値:

| 操作 | ack/identity保存の確認 | Snapshot復元 |
| --- | ---: | ---: |
| create | 1,103ms | 12,648ms |
| join | 43ms | 11,841ms |
| reconnect | 316ms（既存identity維持） | 11,840ms |

これらはローカルWindows上の検証値で、Pi/Funnel実公開の実測値ではありません。全ブラウザ実行の最新計測は [handshake-timings.json](screenshots/phase7e1/handshake-timings.json) に保存しています。tokenは計測記録に含めません。

## 6. 検証結果

| コマンド | 結果 |
| --- | --- |
| `npm.cmd run lint` | 成功 |
| `npm.cmd run typecheck` | 成功 |
| `npm.cmd run test` | 32ファイル・389件成功 |
| `npm.cmd run build` | 成功 |
| `npm.cmd run test:browser` | 全55件成功（7.0分） |
| `npm.cmd run test:production` | 本番ビルドとHTTPS/WSSの全6件成功 |
| `npm.cmd run map:validate` | 成功、従来の警告9件 |

buildの既存chunk size/Zod annotation警告は残ります。map:validateはエディタの未採用初期設定を検証するもので、正式標準JSONへ変更していません。既存の3001番サーバーを変更せず、ブラウザ試験は5191/3047番を使用しました。

本番ビルドのlocalhost固定URL残存検査も成功しました。production CORS・health・起動待ち/再試行、従来のHost復帰・全員presence・kick、右クリックMove・Support・命令確定・裁定・再読込も通過しています。Pi/Funnelや実Render URLへの接続ではなく、ローカルの本番HTTPS/WSS構成による検証です。

ゲーム/裁定コア、data（標準JSON・KML・MapConfig）、公開画像・音源、Audio実装、公開トップ・OGP、render.yamlなど280ファイルを作業前SHA-256と照合し、すべて同一でした。過去フェーズのスクリーンショット98枚も元の内容を保持し、今回の記録だけを別ディレクトリへ保存しています。

## 7. 変更ファイル

実装は次の4ファイルです。

- `apps/server/server.ts`: handshakeの早期ack、publish予約、秘密を含めない配信失敗ログ、配信用Map cache。
- `packages/online-core/scenario.ts`: 不変検証と人数/setting依存判定の分離。
- `packages/online-core/room-manager.ts`: preflight cache、startErrorsへの同じ結果の受け渡し。
- `apps/web/src/useOnline.ts`: ack後の復帰中表示、reconnectのsnapshot待ち時間分離。

追加テスト: `apps/server/phase7e1.test.ts`、`packages/online-core/phase7e1.test.ts`、`tests/handshake-fixture.ts`、`tests/handshake-browser-helper.ts`、browser/productionの `phase7e1.spec.ts`。既存 `tests/browser/server-fixture.ts` はテスト専用の11秒停止に対応しました。

スクリーンショット:

- [新しいタブの復帰選択](screenshots/phase7e1/invite-restore-choice.png)
- [identity保存後・11秒配信待ちの操作ロック](screenshots/phase7e1/identity-saved-before-snapshot.png)
- [HTTPS/WSSの招待URL再訪](screenshots/phase7e1-production/invite-restore-choice.png)

## 8. PiとRenderへの反映

**利用中のBackendとFrontendを両方、同じcommitへ更新してください。** Backendの更新で早期ack/cacheが反映され、Frontendの更新でsnapshot待ちの表示・待ち時間が反映されます。URL、CORS origin、PORT、Tailscale/Funnel経路を変える必要はありません。

今回の変更をGitHubへcommit/pushした後、対局がない時間に行います。BackendのRoom/Gameはメモリ保持のため、再起動・Deployで既存Roomが失われます。更新後は新しいRoomで確認します。すでにtokenを保存できなかった旧playerへ、nicknameだけで本人復帰させる機能は追加していません。既存ロビーを残したまま整理する場合は、ホストが該当playerを退出させ、本人が新規参加を明示的に選びます。

### Raspberry Pi

配置パス・service名はこの環境から確認できないため、山括弧部分を現在の実機の値へ置き換えます。配置先と起動方式の確認方法は [Phase 7E報告](PHASE7E_REPORT.md#8-raspberry-piへ更新する手順) にあります。

```bash
REPO="<現在Piで使っているリポジトリの絶対パス>"
cd "$REPO" || exit 1
git status --short
git pull --ff-only origin main
node --version
npm ci --include=dev
npm run build:server
npm run build
```

`git status --short` に独自変更がある場合は上書きせず確認してから進めます。Nodeは24系です。Frontendビルド時の `.env` / `.env.local` / `VITE_*` は従来の値を維持します。systemdのEnvironmentはSSH shellへ自動では引き継がれないため、従来のビルド時exportも同じ値で行ってください。

ユーザーsystemd serviceの場合:

```bash
BACKEND_SERVICE="<実際のBackend service名>.service"
systemctl --user restart "$BACKEND_SERVICE"
systemctl --user status "$BACKEND_SERVICE" --no-pager
journalctl --user -u "$BACKEND_SERVICE" -n 30 --no-pager
```

system serviceの場合:

```bash
BACKEND_SERVICE="<実際のBackend service名>.service"
sudo systemctl restart "$BACKEND_SERVICE"
systemctl status "$BACKEND_SERVICE" --no-pager
journalctl -u "$BACKEND_SERVICE" -n 30 --no-pager
```

PiでFrontendを配信している場合は、新しいdistを現在の配信方法で反映し、独立したFrontend serviceがあればそのserviceも再起動します。手動terminal起動では従来terminalをCtrl+Cで終了し、従来と同じ環境変数・host/port・起動コマンドで再開します。Backendの起動scriptは `npm run start:server` です。Funnel設定を変更するコマンドはありません。

### Render

実際に使用中のサービスだけを更新します。FrontendがRender、BackendがPiの場合は、RenderではFrontendを更新し、Backendは上記のPi手順で更新します。

1. DashboardでFrontendのStatic Siteを開き、DeploysページのManual Deploy → Deploy latest commit。
2. BackendもRenderで稼働している場合は、そのWeb ServiceのDeploysページでもManual Deploy → Deploy latest commit。
3. 両サービスの対象commit、Deploy成功、Backend `/health` を確認。
4. 現在のEnvironment値、build/start command、Auto-Deploy設定を維持。新たな環境変数やDBは不要。
5. 各参加者にブラウザを再読み込みしてもらい、新しいRoomでguest参加・reload・招待再訪を確認。

Manual Deployはサービスの連携ブランチの最新commitを使います。[Render公式の手動Deploy手順](https://render.com/docs/deploys#manual-deploys)

Renderの初回設定が必要な場合は既存の [DEPLOY_RENDER.md](DEPLOY_RENDER.md) を使用します。今回render.yamlや公開先の構成は変更していません。

### 実公開での保存確認

guest join後、DevToolsではtokenを表示せず次のように確認できます。

```javascript
Object.keys(localStorage)
  .filter(k => k.startsWith('kyoto-online-identities-v1:'))
  .map(k => {
    const {roomCode, playerId, nickname} = JSON.parse(localStorage.getItem(k));
    return {roomCode, playerId, nickname};
  });
```

同じタブをreloadして同じplayerIdへ復帰し、Hostの参加者数が増えないことを確認します。新しいタブから同じ招待URLを開き、「○○として復帰」が表示されることも確認します。保存先はFrontendのoriginごとなので、同じ公開URLを使用してください。

Pi/Renderの手動更新と実公開URLの試遊は利用者側の作業として残っています。Phase 7E.1で停止します。
