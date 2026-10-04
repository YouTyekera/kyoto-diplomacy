# Render Freeで公開する手順（Phase 7A）

確認日: 2026-10-04。**公開用コードは準備済みですが、GitHubへのpush、Renderでの作成・Deploy、実公開URLでの確認はまだ実施していません。** このフォルダーにはGit管理情報 `.git` もありません。以下は利用者が自分のアカウントで行う操作です。

Frontendは無料Static Site、Backendは無料Web Serviceです。DBを作成する必要はありません。サービス名から公開URLを推測せず、Render画面に表示された実際のURLをコピーしてください。

## 1. GitHubへpush

1. Node.js **24系**とGitをインストールします。PowerShellをリポジトリ直下で開きます。
2. GitHubにログインし、右上の「+」→「New repository」。名前は例として `kyoto-diplomacy`。PrivateでもRenderへアクセスを許可すれば利用できます。既存ファイルと衝突しないよう、GitHub側のREADME・.gitignore・Licenseの自動追加は選びません。「Create repository」を押します。
3. ローカルで次を実行します。`YOUR-ACCOUNT`は自分のアカウント名へ変更してください。すでにGit管理済みの場合は `git init` と `remote add` を重ねず、現在のoriginを確認します。

```powershell
cd C:\Users\zikke\Documents\kyoto-diplomacy
git init -b main
git status --short
git add .
git diff --cached --stat
git commit -m "Prepare Phase 6C and Render web deployment"
git remote add origin https://github.com/YOUR-ACCOUNT/kyoto-diplomacy.git
git push -u origin main
```

初めてGitを使う場合、commit前にGitが案内する `user.name` / `user.email` を設定します。push時はブラウザでGitHub本人認証を行います。GitHubパスワードをソースへ記入しません。

`.gitignore`でnode_modules、dist、テスト実行結果、キャッシュ、`.env`類を除外しています。`.env.example`は説明用に含めます。`package-lock.json`、`.node-version`、`render.yaml`、`apps`、`packages`、`data/generated/regions.json`、`data/config`、地図データ、public音源は必要です。テスト用証明書は公開されたローカル検証データで、本番TLSには使いません。

## 2. Renderへログイン

1. [Render Dashboard](https://dashboard.render.com/)へアクセスし、GitHub連携でログインします。
2. リポジトリ一覧が出ない場合、GitHubのRender連携設定からこのrepositoryへのアクセスを許可します。
3. 使用するworkspaceを選びます。この手順ではDB、ディスク、有料プランを追加しません。

## 3. Blueprintから2サービスを作成

1. Dashboardの **New → Blueprint** を選びます。
2. 上でpushしたrepositoryの **Connect** を押します。
3. Blueprint名は例として `kyoto-diplomacy`、Branchは **main**、Blueprint Pathは **render.yaml**。
4. 構成一覧に以下の2サービスだけがあることを確認します。Static SiteにはWeb Serviceのようなplan欄を指定しません。

| サービス | 種類 | build | start / 公開先 |
| --- | --- | --- | --- |
| kyoto-diplomacy-server | Node Web Service / Free / Singapore | `npm ci --include=dev && npm run build:server` | `npm run start:server` / `/health` |
| kyoto-diplomacy-web | Static Site / Free | `npm ci --include=dev && npm run build` | `./dist` |

Node majorはroot `.node-version`の24、package.jsonの `>=24 <25`。既存のNODE_VERSION / .nvmrc指定がある別サービスを再利用する場合、24系を上書きしていないか確認します。Backendのbuild:serverは型確認、start:serverはロックされたtsxを使ってTypeScript entryを実行します。そのためproductionでも `--include=dev` を省かないでください。workspaceはなくroot packageは一つです。

5. `sync: false` の2つの値を入力します。公開URLがまだ分からない場合、**初回だけ** Backendの `FRONTEND_ORIGIN=https://pending.invalid`、Frontendの `VITE_ONLINE_SERVER_URL=https://pending.invalid` を入力できます。接続は成立しませんが、作成後に実URLへ置き換えるための仮値です。
6. **Deploy Blueprint** を押します。作成後、各サービスを開き、サービス名の下に表示された `https://…onrender.com` URLをコピーします。名前の衝突時はsuffixが付くことがあります。

[公式Blueprint作成手順](https://render.com/docs/infrastructure-as-code)と[設定項目](https://render.com/docs/blueprint-spec)に基づきます。

## 4. 実際の環境変数を設定

Dashboardで各サービスの **Environment → Add Environment Variable / Edit** を開きます。

| 設定場所 | key | 値 |
| --- | --- | --- |
| Backend | NODE_ENV | `production`（Blueprint設定済み） |
| Backend | FRONTEND_ORIGIN | コピーしたFrontend URL。`https://…onrender.com`のoriginのみ |
| Frontend | VITE_PUBLIC_DEPLOYMENT | `true`（Blueprint設定済み） |
| Frontend | VITE_ONLINE_SERVER_URL | コピーしたBackend URL。`https://…onrender.com`のoriginのみ |

URLに `/health`、`/socket.io`、`?room=`を付けません。Backendは最後の `/` を正規化します。CORSはFrontendの**一つのorigin**だけを許可し、`*`、localhost、別のプレビューURLをproduction許可へ加えません。PORTはRenderが供給します。ONLINE_PORT / ONLINE_HOSTを本番で追加する必要はありません。秘密情報は `VITE_` 変数へ入れません。招待URLはアクセス中のFrontend originから作られます。

BackendはFRONTEND_ORIGIN未設定なら起動を拒否します。公開Frontendの接続設定が無効なら、localhostへ接続せず設定エラーを表示します。

## 5. Deployと公開URLの確認

1. BackendのEnvironment変更を保存し、必要に応じて **Manual Deploy → Deploy latest commit**。Logsに起動成功が出るまで待ちます。Health Check Pathは **/health**。
2. FrontendのEnvironment変更を保存し、**Manual Deploy → Deploy latest commit**。VITE変数はbuild時に埋め込むため、変えた後に再buildが必要です。
3. Backendの実URLに `/health` を付けてブラウザで開き、`{"ok":true}`を確認します。Backend rootの404は正常です。RenderがTLSを管理し、FrontendはHTTPS、Socket.IOはWSSへupgradeします。[公式WebSocket説明](https://render.com/docs/websocket)
4. Frontendの実URLを開きます。「公開サーバー」と表示されることを確認します。
5. Online入口で「サーバー接続中」まで待ちます。Backend休止後は「サーバーを起動しています。初回はしばらくかかることがあります。」と表示します。約90秒後も接続できなければ「接続を再試行」。Frontendは待ち時間中も表示されます。
6. 3人でルーム作成→招待リンク参加→希望区→シナリオJSON読込→開始。**標準京都設定は採用0地域**です。ホストは自分たちが承認した保存済みMapConfigを読み込んでください。検証用fixtureを確定ゲーム地図として自動採用する処理はありません。
7. 自軍左クリック→合法地域右クリック→移動命令/矢印/dock、Support、3人の命令確定、裁定を確認します。同じタブを再読込し、本人として復帰することを確認します。BGM/SEのON/OFFと音量も確認します。
8. Wi-Fi以外の回線や友達の端末からも招待URLを開いてください。この外部回線確認はローカルテストでは代替できません。

## 6. 勝手に本番を更新しない設定

`render.yaml`は両サービスの **autoDeployTrigger: off**、branch **main**です。各サービスの **Settings → Build & Deploy → Auto-Deploy** もOFF（画面上はOff / No）と確認してください。変更を公開する時だけManual Deployを使います。[公式Deploy説明](https://render.com/docs/deploys)

**Blueprint自体の自動同期は別設定**です。Blueprintの **Settings → Auto Sync → No** も設定します。これを残すとrender.yaml変更のpushでサービス構成が適用される場合があります。構成を更新したい時だけ **Manual Sync** を使います。[公式Auto Sync説明](https://render.com/docs/infrastructure-as-code#disabling-automatic-sync)

`checksPass`はCI合格時の自動公開であり、無関係のpushを完全に止める設定ではありません。今回はOFFを推奨します。Backendの更新は進行中の対局がない時間に行ってください。

## 7. Freeの休止とRoom保持の制約

**Render Backendの再起動・再deploy・休止・保守が発生すると、進行中のRoom/Gameは失われる可能性があります。** 状態はサーバーメモリのみです。本人用reconnect tokenは同じサーバープロセス内の復帰を認証するもので、対局の永続保存ではありません。部屋がなくなった場合は「保存した参加情報を消す」から新しく作ります。

Free Backendは無通信が続くと休止し、次のHTTP/WSSで起動します。アプリは接続開始時だけhealthを確認し、常時pingで休止を防止しません。[Free公式制約](https://render.com/docs/free)

数か月後にURLへ戻って**新しいゲームを開始**するため、コード・lock・環境変数をGitHub/Renderに残します。対局途中の数か月保存は実装していません。無料枠・サービス設定・アカウント状態はRender Dashboardでも確認します。

## 8. 接続できない時

| 症状 | 確認する場所 |
| --- | --- |
| 起動待ちの後に再試行になる | Backend `/health`、Logs、Freeサービス稼働状態、URL誤記 |
| healthは成功、Onlineだけ失敗 | FRONTEND_ORIGINがアドレスバーのoriginと完全一致しているか。Frontend VITE URLの再build |
| ローカル表示・LOCAL表示のまま | Frontend `VITE_PUBLIC_DEPLOYMENT=true` とDeploy済みcommit、古いcache |
| 招待が古いURL | 公開Frontendを開いてコピーし直す |
| 再読込でルームに復帰できない | Backend再起動の有無。失われたRoomは新しく作成 |
| SEが鳴らない | 音量/ON、ユーザー操作でのAudio unlock、`/audio/sfx/select.wav`の200。無音でもゲームは継続 |

## 利用者側に残る操作

- GitHub repository作成・本人認証・mainへのcommit/push。
- Renderログイン・GitHubアクセス許可・Blueprintの2サービス作成。
- 実際のFrontend/Backend URLをEnvironmentへ相互設定し、両方をDeploy。
- Service Auto-Deploy OFFとBlueprint Auto Sync Noの確認。
- 実公開HTTPS/WSS、3端末、別回線、実Free休止からの起動・再接続・音源を確認。
- 友達へ公開FrontendのURLを共有。進行中の対局がない時にだけBackend更新。

Codexはこれらのアカウント操作や実公開を完了したとは扱いません。
