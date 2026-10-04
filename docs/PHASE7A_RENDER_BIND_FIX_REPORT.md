# Render Backend bind修正報告

確認日: 2026-10-04

## 原因と再現

変更前の `apps/server/config.ts` は、`NODE_ENV === 'production'` だけで本番実行を判定し、`RENDER` を参照していませんでした。`npm run start:server` は `node --import tsx apps/server/main.ts` を実行するだけで、`NODE_ENV` を設定しません。mainは共通の `serverConfig()` を呼び、そのhostとportをlistenへ渡していました。

変更前のコードへ `RENDER=true`、`PORT=10000`、公開HTTPSの `FRONTEND_ORIGIN` を渡して実行すると、以下を再現できました。

| NODE_ENV | 本番判定 | bind host |
| --- | --- | --- |
| production | true | 0.0.0.0 |
| development | false | 127.0.0.1 |
| 未設定 | false | 127.0.0.1 |

本番判定がfalseになると、`ONLINE_HOST`、または既定の `127.0.0.1` が選ばれます。`FRONTEND_ORIGIN` の変更自体はhost選択へ影響しません。`HOST` も元から参照していません。

この本番判定への依存が、確認できたコード上の根本原因です。同じコード・未指定のONLINE_HOSTで127.0.0.1の起動ログが出るには、NODE_ENVが厳密なproduction以外になる必要があります。ただし、失敗したRender Deployの実際の環境変数値・対象commitにはアクセスしていません。どの操作が値を変えたか、異なるcommitが実行されたかは断定していません。[Render公式資料](https://render.com/docs/environment-variables)ではNodeサービスのNODE_ENVは通常production、RENDERは文字列trueです。この既定値への依存をなくしました。

追加した回帰テストは、修正前には10件中6件が失敗しました。修正後は10件すべて通っています。

## 修正と環境変数の優先順位

`const isRender = env.RENDER === 'true'` を追加し、`isRender || env.NODE_ENV === 'production'` を本番判定にしました。

| 実行環境 | port | host | CORS |
| --- | --- | --- | --- |
| RENDER=true | PORT必須 | 0.0.0.0固定 | FRONTEND_ORIGINのみ許可 |
| Render外でNODE_ENV=production | PORT必須 | 0.0.0.0固定 | FRONTEND_ORIGINのみ許可 |
| その他のローカル開発 | PORT → ONLINE_PORT → 3001 | ONLINE_HOST → 127.0.0.1 | 従来のlocalhost/LAN許可 |

RenderではNODE_ENVが未設定・空・development・test・末尾空白付きでも、ONLINE_HOSTやHOSTがlocalhost指定でも、0.0.0.0から変わりません。ONLINE_PORTへfallbackせず、不正・未指定のPORTは起動時に拒否します。FRONTEND_ORIGINも本番と同じく必須です。ローカルのONLINE_HOSTによるLAN指定は維持し、HOSTはどの環境でも使用しません。

起動ログは `server.http.address()` の実際のbind host/portを表示します。別行で本番/開発モード、RENDER判定、NODE_ENVを記録します。環境変数全体、reconnect token、秘密情報を出力する変更はありません。

## 変更ファイル

- `apps/server/config.ts`: Renderフラグを優先した本番判定。
- `apps/server/main.ts`: 実bind先と設定モードの起動ログ。
- `apps/server/production.test.ts`: Render/NODE_ENVの組合せ、port必須、CORS、ローカル/LAN維持の回帰テスト。
- `playwright.production.config.ts`: 実際のstart:serverをRENDER=true・NODE_ENV=development・矛盾するhost/port指定で起動する検証設定。
- `docs/DEPLOY_RENDER.md`: bind設定の優先順位、ログ確認、再Deployの案内と古い未作成の記述を更新。
- `docs/PHASE7A_RENDER_BIND_FIX_REPORT.md`: 本報告。

package.json、render.yaml、ゲームルール、裁定、Frontend UIは変更していません。productionテストが生成する既存スクリーンショットも、実行前の内容へ戻しました。

## 検証結果

| コマンド | 結果 |
| --- | --- |
| npm.cmd run lint | 成功 |
| npm.cmd run typecheck | 成功 |
| npm.cmd run test | 24ファイル・347件成功 |
| npm.cmd run build | 成功 |
| npm.cmd run test:production | 公開buildのlocalhost固定参照なし・ブラウザ2件成功 |

productionテストは実際の `npm run start:server` を通り、Render相当の設定でHTTPS/WSS、3クライアントの招待・区割当・右クリックMove・Support・確定・裁定・再読込・再接続、Audio資産、起動待ち/再試行を確認しています。単体テストでは許可外originの拒否も確認しました。buildには既存のZod注釈と500kB超chunkの警告がありますが、全コマンドの終了コードは0です。

加えて実プロセスへ `RENDER=true`、`NODE_ENV=development`、`PORT=10000`、`ONLINE_PORT=3999`、`ONLINE_HOST=127.0.0.1`、`HOST=localhost` を設定して起動しました。

```text
京都Diplomacy online server: http://0.0.0.0:10000 (ルームはメモリ保持)
server configuration: mode=production, RENDER=true, NODE_ENV="development"
```

`http://127.0.0.1:10000/health` が `{"ok":true}` を返すことを確認し、検証用プロセスは終了しました。

## Render上で残る確認

この修正をGitHubへpushし、Backendで **Manual Deploy → Deploy latest commit** を実行してください。Deploy対象commitと起動ログの `0.0.0.0` / `mode=production` / `RENDER=true`、実公開URLの `/health` を確認してください。今回の作業ではpushやRenderの再Deployは実施していません。Backend更新でメモリ保持の進行中Roomは失われる可能性があります。
