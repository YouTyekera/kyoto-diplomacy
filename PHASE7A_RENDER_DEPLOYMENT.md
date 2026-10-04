# Phase 7A 公開Web化 方針 — Render Free

Status: Deployment plan
Date: 2026-10-04

## 1. 採用構成

現状の React/Vite + Node.js + Socket.IO を大きく書き換えず公開するため、
Renderを採用する。

構成:
- Frontend: Render Static Site (Free)
- Backend: Render Web Service (Free)
- Source: GitHub repository
- HTTPS/WSS: Render managed TLS
- Deployment config: repo root `render.yaml`

Discord ActivityはPhase 7A対象外。

## 2. この構成を選ぶ理由

- Static frontendは常時配信できる
- Node Web ServiceはSocket.IO/WebSocketをそのまま使える
- Free Web Serviceはアイドル時にsleepし、次のHTTP/WS接続でwakeする
- 友達へ通常のHTTPS URLを共有できる
- frontendをbackendと分離することで、backend cold start中も画面を表示して
  `サーバーを起動しています` と案内できる
- monorepoをRender Blueprintで再現可能にする

## 3. 無料枠の制約をUIで吸収

Backend free instanceはidle後sleepするため、
clientのOnline入口でbackend healthを確認する。

状態:
- connecting
- waking
- online
- retrying
- unavailable

初回wakeは時間がかかる可能性がある。
最大90秒程度はfriendly progress UIでretryし、
生のSocket errorを最初に見せない。

## 4. 本番server要件

- `process.env.PORT` を使用
- `0.0.0.0` bind
- `/health` 200
- production frontend originだけCORS allow
- localhost dev originもdevelopmentのみallow
- WebSocket / Socket.IO reconnectはexponential backoff
- graceful SIGTERM
- room codeに推測耐性を確保
- reconnect tokenをlog/exportへ出さない
- debug endpointsをproductionで公開しない

## 5. Frontend要件

- backend URLをbuild-time env (`VITE_ONLINE_SERVER_URL` 等) で設定
- productionは `https://...onrender.com`
- Socket.IOはHTTPS pageからWSSへ接続
- invite linkはfrontend public URLを使用
- productionでは `公開サーバー` と表示
- backend sleep中もfrontendは開く
- `サーバーを起動しています。初回はしばらくかかることがあります。`
  を表示
- reconnect progressをわかりやすくする

## 6. 安定性

長期間同じ状態で遊べるよう:
- package-lockを必ずcommit
- `npm ci`
- Node major versionをpin
- render.yamlへbuild/start/healthを明示
- 本番branchを固定
- 初回公開後は `autoDeployTrigger: off` または `checksPass` を選べるようにする

推奨:
安定版公開後は auto deploy を off にし、
明示的にdeployした時だけ更新する。

## 7. Room state

Phase 7Aでは既存どおりroom/game stateはメモリ保持でよい。

制約:
- backend restart/deploy/maintenanceで進行中roomは失われ得る
- active matchの永続復旧はPhase 7A対象外

将来必要なら外部の永続storeを追加する。
Render Free Postgresを長期保存用途に依存しない。

## 8. render.yaml

2 servicesをBlueprint管理:
- static frontend
- free Node web backend

実際のworkspace scriptsをpackage.jsonから調査し、
推測のbuild commandをハードコードしない。

## 9. Production verification

最低限:
- public frontend URL opens from another network
- create room
- invite link
- 3 separate clients join
- WebSocket stays connected during active game
- right-click Move
- support
- adjudication
- audio assets load
- backend sleep -> wake -> create a new room
- reload/reconnect
- no localhost URL in production bundle
- no secret tokens in logs
