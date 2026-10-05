# Phase 7E: Player Identity / Lobby Reliability / Kick

実施日: 2026-10-05。オンラインの本人復帰、開始前ロビーの接続表示、ホストによる退出を実装しました。ゲームルール、勝利条件、標準JSON、地図・MapConfig、Tailscale設定、RenderのFrontend構成、Audio・OGP・ブランドは変更していません。GitHubへのcommit/push、Raspberry Piの更新、実公開URLでの試遊は未実施です。

## 1. 重複playerと接続表示の根本原因

本人確認は従来から `playerId + reconnectToken` であり、nicknameではありません。新規joinは新しいplayerIdを作成します。復帰情報がsessionStorageだけにあったため、新規タブやブラウザ再起動後に同じ名前でjoinしても、切断した元playerへ復帰せず別playerになりました。同名の新規参加を拒否する処理もありませんでした。

開始前ホストの切断猶予は15秒でした。これは新規joinでの本人復帰を可能にする仕組みではなく、猶予を過ぎて権限が移った後に名前だけで再参加しても、元のidentityには戻れません。

また、切断前のpublicViewを表示し続ける間も、参加者一覧が古い `player.connected` を確定情報として表示していました。同じidentityを別タブで復帰するとサーバーが新socketへ結び直す一方、元タブには明確な参加終了通知がなく、古い画面から自分が接続中に見える経路もありました。

過去のPi試遊のパケット記録がないため、そのスマホで起きた通信順序は断定していません。今回、本人未復帰のtransportと古いロビーを実ブラウザで再現し、表示・操作を確認しました。

## 2. Identity保存・招待URLからの復帰

| 保存先 | 内容 |
| --- | --- |
| localStorage | `kyoto-online-identities-v1:<roomCode>:<playerId>` ごとに、roomCode / playerId / reconnectToken / nickname / updatedAt |
| sessionStorage | `kyoto-online-active-identity-v2` に、このタブが使うroomCode / playerIdの参照 |

参加者ごとに独立したlocalStorageキーを使います。複数タブが共有の配列を読み書きして、他の参加履歴を上書きすることを防ぎます。履歴は複数Room・複数playerを保持できます。同じブラウザの3タブで3人を試す用途も維持しました。

従来の `kyoto-online-session-v1` は読み込み時に移行します。localStorageを利用できない環境では現在タブのメモリと従来のsessionStorage形式にfallbackし、参加処理自体を落としません。この場合、新しいタブ・ブラウザ再起動をまたぐ復帰は保証できません。破損した保存項目はidentityとして採用しません。

招待されたRoomの保存identityが1件なら「○○として復帰」、複数なら「どの参加者として復帰しますか？」と選択肢を表示します。通常の新規joinフォームへ進むには「別の参加者として入る」を明示的に選びます。同じタブのreloadはそのタブのidentityへ自動復帰し、別Roomの招待に古いRoomのidentityを流用しません。

同じidentityを別タブで復帰すると、サーバーは元socketのidentityを無効にして `sessionEnded: replaced` を送り、元タブのactive参照・古いRoom表示を消します。復帰用の端末履歴は残し、元タブが自動復帰して新タブを追い出すことを防ぎます。

nicknameはNFKC正規化、前後空白除去、連続空白の統一、英字小文字化で重複を比較します。表示名や本人認証に使うID・tokenは置き換えません。切断者を含めた既存playerと同名の新規joinは、次の案内で拒否します。

> 同じニックネームの参加者がいます。以前参加していた場合は「復帰」を使用してください。

reconnectTokenは本人用の端末保存と復帰リクエストだけで扱い、URL、公開状態、参加終了event、診断ログには含めません。履歴は同じブラウザ・同じFrontend originに限定されます。別端末・別ブラウザ・別ドメインへの名前だけでの復帰は実装していません。

## 3. Host grace period

`hostReconnectGraceMs` を **60000ms** にしました。サーバーが予期しない切断を検出した時点から60秒待機します。

- 正しいplayerId/tokenで猶予内に復帰: timer取消、元ホストを維持。
- 明示的leave: 即ホスト移譲。
- 期限まで復帰しない: 接続中の参加者へ移譲し、全接続者へ最新状態を配信。
- 接続者がいない: 移譲先がないため保持し、後の復帰時に接続者へ移譲可能。
- 移譲済みの元ホストが復帰: 同じplayerとして復帰するが、権限は現在のホストに維持。

公開状態に秘密を含まない `hostReconnectDeadline` を追加しました。最新状態を確認済みの参加者へ「ホストの再接続を待っています…」と残り秒数を表示します。秒数は端末時計での目安です。判定はサーバーのtimerが行います。

3〜11人、全参加者socket接続済み、preflight errorなし、という開始条件は変更していません。ホスト移譲後も切断者がRoomに残っていれば開始不可です。timerの二重発火防止、取消、明示leave、古いsocketの要求拒否を既存テストと合わせて確認します。

## 4. Presence同期とstale UI

`transportConnected` と `roomSessionReady` の分離を維持します。復帰認証成功と、現在の接続での公開状態・本人用状態の確認が揃ってから操作を解放します。

`roomSessionReady=false` の参加者一覧は、全員を「確認中」と表示します。対局中の参加者トレイ・確定状況表示も古い接続/提出状態を確定表示しません。ロビー操作・対局命令のロックも維持しています。

サーバーのreconnect成功・disconnect後のpublishは全接続者を対象にしています。この経路を維持して3クライアントで検証しました。A自身とB/Cから見たAの接続状態が、復帰後はすべて「接続中」になります。切断中はA自身が「確認中」、B/Cはサーバーから確認した「切断」です。同じidentityを引き継がれた古いsocketのdisconnectで、新しいsocketのpresenceを切断へ戻しません。

## 5. Kick

開始前のみ、ホストが `{action:'kick',playerId}` を送信できます。非ホスト、ホスト自身、開始後、存在しないplayerはサーバーでも拒否します。接続・切断どちらの参加者も削除できます。

ホストの参加者一覧に「退出させる」を表示し、`「○○」をルームから退出させますか？` の確認dialogを経て送信します。復帰確認中はボタンを無効化します。

接続中の対象には `sessionEnded: kicked` を専用に送信します。対象clientは「ホストによりルームから退出しました。」を表示し、active参照、該当playerの端末履歴、public/privateの古いRoom表示を削除してオンライン入口へ戻ります。同じ端末で試している別playerの履歴は削除しません。参加応答が遅れ、credentialsが届く前にkick通知が届いた場合も、後着の応答で履歴やRoom表示を復活させません。

切断中の対象はサーバーrecordを削除します。後から古いcredentialsで復帰しても拒否し、新しいplayerを自動生成しません。その端末には送信できないため、後の復帰拒否画面で古い参加情報を消す導線を用意しています。新規joinは本人が明示的に行う操作です。

## 6. 検証

| コマンド | 結果 |
| --- | --- |
| `npm.cmd run lint` | 成功 |
| `npm.cmd run typecheck` | 成功 |
| `npm.cmd run test` | 30ファイル・382件成功 |
| `npm.cmd run build` | 成功 |
| `npm.cmd run test:browser` | 全53件成功（7.6分） |
| `npm.cmd run test:production` | 本番ビルドとHTTPS/WSSの全5件成功 |
| `npm.cmd run map:validate` | 成功。従来の警告9件 |

単体テストでは、複数identity・タブ参照・従来データ移行・破損/利用制限・他タブの履歴保持、重複nickname拒否、20秒復帰、60秒の境界、kick権限、旧token/旧socket拒否、旧版で存在した同名の切断playerのkickを確認しました。既存の裁定演出テストに同名guest2人のfixtureがあったため、参加者名だけを別々にしました。ゲームの裁定ソースは変更していません。

実ブラウザの3クライアントでは、Host reloadで同じIDへ復帰、実時間20秒の切断からホスト維持、実時間60秒経過後の移譲、新規タブの招待再訪、重複join拒否、390×844のguest瞬断と全員のpresence一致、接続中/切断中kick、古いRoomの消去、同一ブラウザの3タブ、ブラウザ再起動相当の履歴復元を確認しました。サーバー統合テストでも実際に60秒待ち、期限移譲の配信と診断ログのtoken非出力を確認しました。

本番ビルドのlocalhost固定URL残存検査、production CORS、health、起動待ち・再試行、3人の招待・割当・実右クリックMove・Support・命令確定・裁定・再読込も成功しました。ブラウザテストは既存3001番サーバーを変更せず、専用5191/3047番で実行しました。HTTPS/WSS試験はローカルの本番構成であり、Pi/Funnelの実公開URLを使った検証ではありません。

制限付き環境の `map:validate` はNodeの `uv_os_get_passwd` がENOMEMとなったため、同じコマンドを制限外で再実行して成功しました。地図の警告はエディタの未採用初期設定に対するもので、標準JSONへ上書きしていません。buildの既存chunk size/Zod annotation警告は残ります。

作業前のSHA-256と照合した280ファイル中、279ファイルは同一です。差分は上記の既存テストのfixture名だけです。ゲーム/裁定実装、data（標準JSON・KML・MapConfig）、公開画像・音源、Audio実装、公開トップ・OGP、render.yamlは同一でした。過去フェーズのスクリーンショット94枚も元の内容を保持し、今回の記録は別ディレクトリへ保存しました。

## 7. 変更ファイルとスクリーンショット

実装:

- `apps/web/src/online-identities.ts`: 端末履歴とタブ参照。
- `apps/web/src/useOnline.ts`: 復帰・参加終了・保存情報との同期。
- `apps/web/src/OnlineGame.tsx`: 復帰選択、確認中表示、ホスト残り時間、kick UI。
- `apps/web/src/App.tsx`: 新しいタブ参照によるreload時の入口判定。
- `packages/shared/online.ts`: kick、公開deadline、参加終了eventのschema。
- `packages/online-core/room-manager.ts`: 60秒猶予、重複防止、kick、元socketの参加終了。
- `apps/server/server.ts`: 対象socketへの参加終了通知。

テスト: 新規identity/7Eのunit・browser・productionテスト、既存7C/productionの60秒対応、`online-session.test.ts` のkickロック確認、`tests/session-browser-helper.ts` の遅延応答用補助、既存 `packages/game-core/phase5b.test.ts` のfixture名変更。

- [復帰後の3人presenceと退出ボタン](screenshots/phase7e/restored-presence.png)
- [390×844のkick後の入口](screenshots/phase7e/kicked-mobile.png)
- [HTTPS/WSSでの復帰後ロビー](screenshots/phase7e-production/restored-presence.png)
- [HTTPS/WSSでのkick後の入口](screenshots/phase7e-production/kicked-mobile.png)

## 8. Raspberry Piへ更新する手順

**BackendとFrontendの両方を同じ版へ更新し、参加者全員にブラウザの再読み込みを依頼してください。** Backendだけでは新しい復帰選択・確認中表示・kick通知処理は反映されません。サーバーのRoom/Gameはメモリ保持のため、Backend再起動で現在のRoomは失われます。対局終了後に更新し、新しいRoomで試遊してください。

この環境からPiの配置パス・起動方法・systemd service名は確認できていません。以下の山括弧部分は実機の値に置き換えます。Tailscale/Funnelの設定を変更するコマンドはありません。まず今回の変更をGitHubのmainへ反映した後、PiにSSHして実行します。

### 配置場所と起動方式の確認

```bash
find "$HOME" -maxdepth 4 -type d -name kyoto-diplomacy -print
systemctl --user list-units --type=service --all | grep -Ei 'kyoto|diplomacy'
systemctl list-units --type=service --all | grep -Ei 'kyoto|diplomacy'
```

serviceを使用している場合、次で実際の配置先を確認できます。system serviceの場合は `--user` を除きます。

```bash
systemctl --user show <実際のservice名>.service -p WorkingDirectory -p FragmentPath
```

### ソース取得・ビルド

作業ツリーが空であることを `git status --short` で確認します。Piに独自の変更がある場合は上書きせず、差分を確認してから進めてください。Nodeはリポジトリ指定の24系を使います。

```bash
REPO="<Piで確認したリポジトリの絶対パス>"
cd "$REPO" || exit 1
git status --short
git pull --ff-only origin main
node --version
npm ci --include=dev
npm run build:server
npm run build
```

`npm run build` は**現在Piで使用している `.env` / `.env.local` およびビルド時の `VITE_*` 値を維持して**実行します。起動serviceの環境変数はSSHのshellに自動では引き継がれません。従来のビルドでshellへexportしていた場合は、同じ値を設定してから実行してください。Backend URL・Frontend origin・PORT・bind・Funnel経路を今回のために変更する必要はありません。

### 既存の起動方法で再起動

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

Frontendにも独立したserviceがある場合は、`npm run build` 後にその実際のservice名で同じ再起動を行います。手動terminal起動の場合は既存terminalをCtrl+Cで止め、**従来と同じ環境変数・起動コマンド**で再開します。Backendの本番起動scriptは `npm run start:server`、Frontendの既存previewを使っている場合は従来のhost/port引数付き `npm run preview -- ...` です。新しいserviceや起動構成は作成していません。

FrontendをPi以外で配信している場合は、その配信先も同じcommitから既存手順で更新します。RenderのFrontend構成や環境変数は変更していません。

### 更新後の確認

実際のBackend portを指定してhealthを確認します。

```bash
BACKEND_PORT="<現在使用中のBackend port>"
curl --fail --silent --show-error "http://127.0.0.1:${BACKEND_PORT}/health"
git log -1 --oneline
```

新しい3人Roomを作り、Host reload→同じIDで復帰、20秒の切断→ホスト維持、新規タブの招待URL→「○○として復帰」、スマホの復帰→全員の接続表示一致、connected guestの退出を確認します。60秒超過のホスト移譲は、端末の回線を実際に切ってサーバーが切断を検出したログから測定してください。切断検出までの時間はSocket.IOのheartbeat次第です。

以前の同名重複playerは自動削除しません。必要ならホストが開始前に「退出させる」を使います。サーバー再起動で消えたRoomの保存履歴は復帰不能です。「保存した参加情報を消す」から明示的に整理します。ブラウザのタブを閉じただけでは新しい履歴を削除しません。

Piへの反映・実機確認は利用者側の作業として残っています。Phase 7Eで停止し、ルール追加やインフラ構成変更は行いません。
