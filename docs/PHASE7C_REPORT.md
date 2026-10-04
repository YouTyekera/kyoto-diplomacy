# Phase 7C: Online Session Reliability 完了報告

実施日: 2026-10-04〜05。調査対象は作業開始時の `main`。オンライン参加・再接続と開始前のホスト維持を修正しました。GitHubへのpush、RenderへのDeploy、実公開URLでの試遊は未実施です。

## 1. 根本原因

従来の `useOnline.ts` はSocket.IOの `connect` で直ちに `connected=true` とし、保存したcredentialsによる `reconnect` は非同期で実行していました。接続管理側もtransportの接続だけで `online` としていました。一方、切断時には既存の公開状態・本人用状態が画面に残ります。

このため、画面にロビーが残り、transportが再接続しただけの段階でも開始ボタンが有効になり得ました。`request()` は `socket.connected` しか確認せず、RoomManagerが新socketを参加者のidentityへ復帰させる前のRoom操作を拒否できませんでした。サーバーの参加確認で返す「先にルームへ参加してください」と整合する経路です。旧socketの要求も同じサーバー側チェックで拒否されます。

さらに、開始前のホストの予期しない切断で即座にホストを移譲していたため、短い瞬断でホスト権限まで変わっていました。過去の実公開時の通信記録はないため、当時のパケット順序まで断定していません。今回は認証復帰要求だけを遅らせ、transportが使えるのにRoomへ未復帰という状態を実ブラウザで作って検証しました。

## 2. Client session state

- `transportConnected`: Socket.IOの通信接続。
- `roomSessionReady`: 現在の接続での参加復元完了。
- 保存credentialsがある場合、接続 → reconnect成功応答 → 同じ接続の公開状態・本人用状態の確認 → 操作解放、の順になります。roomCode、本人playerId、接続表示、公開/本人状態のphaseKeyの一致も確認します。
- 切断・手動再試行・再接続で接続世代を更新し、古い成功応答による操作解放やpending更新を防ぎます。
- 開始、シナリオ変更、規定年数、希望区、退出を復帰完了まで無効化します。対局中の命令入力にも同じ条件を渡します。
- `request()` でも二重に確認し、create/join以外を未復帰中に送信しません。「ルームへの再接続を確認しています。少しお待ちください。」を返します。
- 既存の盤面は残し、「最後に確認したルームの状態」「ルームへ再接続しています…」を明示します。transportの復帰だけで操作可能表示には戻りません。
- 認証が拒否された場合は操作を解放せず、保存した参加情報を消す導線を表示します。同じ無効なcredentialsで復帰を繰り返しません。通信タイムアウト・起動待ちの既存backoffは維持しています。

## 3. Host grace period

開始前のホストの予期しないsocket切断について、サーバーが切断を検出した時点から **15秒** の猶予を設けました。

| 状況 | 動作 |
| --- | --- |
| 15秒以内に正しいcredentialsで復帰 | timerを取り消し、元ホストを維持 |
| 期限を過ぎても未接続 | 接続中の参加者へ移譲し、最新状態を参加者へ配信 |
| ホストが明示的にleave | 従来どおり即移譲 |
| 猶予中のguest復帰・新規参加 | ホストの猶予を迂回して移譲しない |
| 全員未接続で期限終了 | 移譲先がいないため保持。後に参加者が復帰すれば移譲可能 |
| 期限終了後に元ホストが復帰 | すでに移譲済みのホストを取り戻さない |

連続切断時の二重timerと、旧socketの遅れたdisconnectによる新接続の無効化を防ぎます。サーバー終了時にはtimerを解放します。開始後のホスト扱いは変更していません。

`startErrors()` の **3〜11人・全参加者socket接続済み・preflight errorなし** は変更していません。ホスト猶予中は「ホストの再接続を待っています…」を表示し、ホスト/guestのどちらが切断中でも開始不可です。

## 4. 診断ログ

本番サーバーで `[online-session]` に続けて、次のイベントをJSONで出します。

`socket-disconnect` / `reconnect-success` / `reconnect-failed` / `host-grace-start` / `host-grace-cancel` / `host-transferred`

識別情報は公開roomCode、playerId先頭8文字、必要時のsocketId先頭8文字に限定しています。credentials、reconnectToken、request本体、ニックネームをこのログへ渡しません。実際のproduction設定のSocket.IO接続テストで全6イベントとトークン非出力を確認しました。

## 5. 今回の症状の再現テスト

実ブラウザの3クライアントで標準ロビーを作成し、開始可能になった直後にホストのゲーム用WebSocketを強制切断します。開発用HMRのWebSocketは切断対象から除外します。

復帰時はHTTP polling/WebSocketの両方に対応したテスト補助処理で **reconnect要求だけ** を保留します。polling全体を止めず、transportは他のメッセージを送信可能な状態に保ちます。この段階で再接続表示と全対象操作のdisabledを確認します。その後reconnectを送り、成功応答が返っても本人用状態を保留している間は解除されないことを確認します。本人用状態を渡した後に開始ボタンが有効になり、同じホストで3人対局を開始でき、「先にルームへ参加してください」が表示されないことを確認しました。

追加で、guest瞬断→復帰→開始、復帰拒否時のstale UIロックを実ブラウザで確認しました。production buildと実サーバー起動経路によるHTTPS/WSS構成でも同じホスト復帰テストを行っています。アプリへdebug endpointや切断用機能を追加していません。

単体テストでは15秒直前/期限時点、明示leave、連続切断のtimer、旧socket拒否、異なる本人/Room/phaseの拒否、古い応答の無効化を確認しました。サーバー統合テストでは実際に15秒待ち、非同期のホスト移譲が参加者へ配信されることも確認しています。

## 6. 検証結果

| コマンド | 結果 |
| --- | --- |
| `npm.cmd run lint` | 成功 |
| `npm.cmd run typecheck` | 成功 |
| `npm.cmd run test` | 28ファイル・369件成功 |
| `npm.cmd run build` | 成功 |
| `npm.cmd run test:browser` | 最終全実行で49件成功（7.5分） |
| `npm.cmd run test:production` | HTTPS/WSS構成の4件成功 |
| `npm.cmd run map:validate` | 成功。エディタ初期設定に対する従来の警告9件 |

ブラウザ検証は既存の3001番サーバーを避け、5191/3047番を使いました。buildの既存chunk size・Zod annotation警告は残ります。地図検証の初期設定は採用0地域で、標準JSONへ上書きしていません。

最初の全ブラウザ実行は47件成功・2件タイムアウトでした。既存のエディタ初期読込と試遊ログダウンロード待ちのケースをソース変更なしで個別再実行し成功、さらに全49件を再実行して成功しました。初回のproduction追加E2Eでは、テスト補助処理のドメイン名前解決と、認証遅延用POSTのContent-Lengthに不備がありました。補助処理を修正しました。ゲーム/音声/地図を変更してこれらの検証を通していません。

ゲーム/裁定コア、data（標準シナリオ・地図・設定）、公開画像/音源、Audio実装、公開トップ・OGP関連の279ファイルは作業前SHA-256と一致しました。正式標準JSONのSHA-256は `0890799a41e08e9049a1c6709b74437acdaf22b38022811561d5766665359652` のままです。過去フェーズのスクリーンショットは既存の内容を保持し、今回の記録は別ディレクトリへ保存します。

## 7. スクリーンショット・変更ファイル

- [ロビーの復帰待ち・操作ロック](screenshots/phase7c/host-restoring.png)
- [復帰後の3人開始](screenshots/phase7c/host-restored-start.png)
- [復帰拒否・stale UIのロック](screenshots/phase7c/reconnect-rejected.png)
- [HTTPS/WSSの復帰待ち](screenshots/phase7c-production/host-restoring.png)
- [HTTPS/WSSの復帰後開始](screenshots/phase7c-production/host-restored-start.png)

実装: `apps/web/src/useOnline.ts`、`online-session.ts`、`online-connection.ts`、`OnlineGame.tsx`、`packages/online-core/room-manager.ts`、`apps/server/server.ts`。

検証: `apps/web/src/online-session.test.ts`、`packages/online-core/phase7c.test.ts`、`online.test.ts`、`apps/server/production.test.ts`、`tests/session-browser-helper.ts`、`tests/browser/phase7c.spec.ts`、`tests/production/phase7c.spec.ts`。

## 8. 本番Renderでの確認方法

1. 修正を確認・commit・GitHubへpushし、**BackendとFrontendの両方**でRenderの **Manual Deploy → Deploy latest commit** を実行します。両サービスのDeploy対象commitを確認します。環境変数・起動コマンドの追加変更は不要です。
2. Backendの再Deployはメモリ上の進行中Roomを失うため、試遊前または既存対局終了後に行います。Frontendを通常の再読込で更新し、古いRoomの保存情報が残る場合は消して新規作成します。
3. ホストと参加者2人を別ブラウザ/端末で参加させ、開始可能になったことを確認します。ホストのDevToolsのNetworkで短時間OfflineにしてOnlineへ戻します。OS/ブラウザがWebSocket切断を検出するまで遅れる場合があるため、猶予の起点はBackendログの `host-grace-start` で確認します。
4. 切断・復帰中に、開始/シナリオ/規定年数/希望区/退出が無効になること、参加者側にホスト待ちが出ることを確認します。15秒以内の正常復帰では `reconnect-success` と `host-grace-cancel` が出て、元ホストのまま開始できることを確認します。
5. 新しいロビーでホストを15秒以上切断し、`host-transferred` と参加者側のホスト変更を確認します。切断した元ホストが残る間は開始不可です。復帰後に全員接続となってから新ホストで開始します。明示的退出の場合は即移譲になることも確認します。
6. guest瞬断・復帰後の開始、対局中の再読込・再接続も確認します。LogsへreconnectTokenやブラウザの保存credentialsを貼り付ける必要はありません。

ローカルの本番構成テストは成功していますが、Render実公開でのこの確認は利用者によるDeploy後の作業です。サーバー再起動によるRoom消失、長期の対局保存は今回解決する範囲ではありません。Phase 7Cで停止し、新ルール、Discord Activity、永続DBは追加していません。
