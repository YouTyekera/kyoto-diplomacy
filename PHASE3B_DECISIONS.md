# Phase 3B 仕様差分 — 開発起動改善・盤面色の統一・オンラインUX安定化

Status: Phase 3B 実装前の決定事項
Date: 2026-10-03

この文書は既存の `spec.md`、Phase 1.5 / 2A / 2B / 3A の決定事項に対する追加・変更である。
矛盾する場合、この文書を優先する。
Codexは実装開始前にこの内容を `spec.md` へ反映すること。

## 1. 地域の塗り色

Phase 2B/3Aでは、通常地域とSupply Center地域を同一勢力内でも濃淡で区別していた。
実地図ではこの差が大きく、同じ勢力の支配領域が分断されて見えるため、この方針を撤回する。

### 新方針

- 地域のfillは `controllerWardId` のみによって決定する。
- 同一controllerであれば、Supply Centerか否かに関係なく同じfill色・同じopacityを使う。
- `isSupplyCenter` によってregion fillを濃く/薄くしない。
- Supply Centerの有無は円形SCマーカーだけで表現する。
- SC所有者はSCマーカーのring / inner markで `supplyCenterOwnerWardId` を表現する。
- `controllerWardId` と `supplyCenterOwnerWardId` が異なる場合も、region fillとSC ringの違いで判別できる。
- 中立/未支配regionは既存のneutral fillを使用する。
- hover/selectedによる一時的な強調は可。ただしSCだから恒常的に濃くしてはならない。

この方針は編集モード、Game Preview、Rules Sandbox、ローカル年間進行、オンライン対戦の「ゲーム状態表示」に共通適用する。
編集モードで採用/除外や静的設定を示すための別表現は維持してよい。

## 2. `dev:online` の起動エラー改善

現在 `npm.cmd run dev:online` は標準でWeb 5173 / Server 3001を使用する。
5173等が既に使用中の場合、Viteの低レベルエラーがそのまま表示され、初心者には原因と対処が分かりにくい。

### 2.1 リポジトリ外からの実行

`npm.cmd run ...` はpackage.jsonのあるリポジトリ直下で実行する必要がある。
npm自体はリポジトリ外からpackage scriptを実行できないため、この制約は消せない。

READMEのオンライン起動手順の最初に、必ず以下を明示する。

```powershell
Set-Location "C:\Users\zikke\Documents\kyoto-diplomacy"
npm.cmd run dev:online
```

`C:\Windows\System32` などで実行した場合のENOENTは、「package.jsonがないため」であることを初心者向けに説明する。

### 2.2 ワンクリック起動

リポジトリ直下にWindows用の起動ファイルを追加する。

例:
- `START_ONLINE.cmd`

要件:
- 自分自身が置かれているリポジトリ直下へ `cd /d "%~dp0"` する。
- `npm.cmd run dev:online` を実行する。
- エラー終了時は画面が閉じないようにする。
- Node/npmがない場合は分かりやすい日本語メッセージを出す。

これにより、ユーザーはExplorerから `START_ONLINE.cmd` をダブルクリックしても正しいworking directoryで起動できる。

### 2.3 使用中ポートの扱い

`scripts/dev-online.mjs` を改善する。

環境変数でポートを明示指定していない場合:
- Web標準候補 5173 が使用中なら、5174, 5175... と順に空きポートを探索する。
- Server標準候補 3001 が使用中なら、3002, 3003... と順に空きポートを探索する。
- 十分な上限（例: +20）まで探索する。
- 選択した実ポートを子プロセス/Vite proxyへ正しく渡す。
- 起動成功時に、実際に開くURLを大きく分かりやすく表示する。

例:
`5173 は使用中のため、Webは http://127.0.0.1:5174/ で起動しました。`

環境変数 `WEB_PORT` / `ONLINE_PORT` をユーザーが明示指定した場合:
- そのポートを勝手に変更しない。
- 使用中ならfriendly errorを出して終了する。
- どのPowerShellで古いサーバーを止めるか、または別ポートを指定する例を表示する。

### 2.4 ポート診断

任意だが推奨:
- 起動失敗時に `5173 is already in use` のstack traceだけを見せず、日本語の対処を出す。
- Windows向け確認例をREADMEに追加する。

```powershell
Get-NetTCPConnection -LocalPort 5173 -State Listen
```

プロセスを確認する例:
```powershell
Get-Process -Id (Get-NetTCPConnection -LocalPort 5173 -State Listen).OwningProcess
```

Codexがプロセスを勝手にkillしてはならない。
ユーザー自身が既存の開発サーバーPowerShellでCtrl+Cするのを第一選択とする。

## 3. 既存5173開発サーバーとの共存

`npm.cmd run dev` がすでに5173で起動中でも、`dev:online` が自動で別のWebポートへfallbackできるようにする。

ただし、同じブラウザでどのURLを開くべきか混乱しないよう:
- terminalにONLINE GAME URLを明示
- page title / headerにも「ONLINE」モードと接続先を確認できる表示を入れてよい

## 4. 回帰防止

以下をテストする。

- SC regionとnon-SC regionで同一controllerなら同じfill style
- SC marker自体は引き続き表示される
- SC owner ringは維持
- selected/hover highlightは維持
- dev-online port resolverが使用中標準ポートをskipする
- explicit WEB_PORT使用中なら勝手にfallbackしない
- chosen web/server portsがproxy/envへ一致して渡る

## 5. Phase 3Bの範囲

今回のPhase 3Bは、Phase 3Aのオンライン対戦基盤を安定して試遊するための小規模なUX/開発環境改善とする。

実装する:
- 地域fill統一
- `dev:online` 空きポート自動選択
- friendly startup messages
- START_ONLINE.cmd
- README改善
- 回帰テスト

実装しない:
- イベント
- 装備
- 自転車
- Discord Activity
- ターンタイマー
- ゲーム永続保存
