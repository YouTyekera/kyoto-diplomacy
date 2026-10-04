# Codex Phase 3B 実装プロンプト
## dev:online起動改善 + 支配地域色の統一

作業開始前に以下を全文確認してください。

1. `spec.md`
2. `README.md`
3. `docs/PHASE3A_REPORT.md`
4. 過去のDECISIONSファイル
5. `PHASE3B_DECISIONS.md`

`PHASE3B_DECISIONS.md` が最新の仕様差分です。
既存仕様と矛盾する場合はこれを優先してください。

最初に `PHASE3B_DECISIONS.md` を `spec.md` へ反映し、正本を更新してください。

ゲームデザインはユーザーとChatGPTが行います。
今回、イベント・装備・自転車等へ勝手に進まないでください。

# 1. 地域fillの統一

現在、同じ勢力支配でもSC regionがnon-SC regionより濃く表示されます。
これを廃止してください。

Game stateを表示する全モード:
- Game Preview
- Rules Sandbox
- ローカル年間進行
- オンライン対戦

で、

`controllerWardId` が同じregionは、SCかどうかに関係なく完全に同じregion fill styleを使用してください。

SCは:
- 円形SC marker
- supply owner ring / mark

だけで識別します。

`isSupplyCenter` をregion fill opacity/saturation/brightnessの恒常差へ使わないでください。

編集モードでの採用/除外等の静的編集表現は壊さないでください。

Playwright screenshotを追加し、同じcontrollerの隣接SC/non-SCが同一fillであることを確認してください。

# 2. dev:onlineのポート処理改善

現在 `scripts/dev-online.mjs` は5173使用中にVite stack traceで終了します。

## 自動fallback

`WEB_PORT` が未指定:
- 5173から開始
- 使用中なら5174, 5175... 最大20候補程度
- 最初の空きポートを採用

`ONLINE_PORT` が未指定:
- 3001から開始
- 使用中なら3002, 3003... 同様

実際に選ばれたONLINE_PORTをVite proxy/backend接続設定へ正しく渡してください。

起動ログ例:
```text
[京都Diplomacy Online]
Web port 5173 is in use -> using 5174
Server: http://127.0.0.1:3001
Game:   http://127.0.0.1:5174/
Ctrl+C で終了
```

## explicit port

ユーザーが:
```powershell
$env:WEB_PORT='5180'
```
のように明示した場合、そのポートが使用中でも別ポートへ勝手に変更しないでください。

friendly error:
- 指定ポートが使用中
- 既存dev serverをCtrl+C
- または別portを設定
を表示。

raw stack traceだけで終わらせないでください。

## race

空きポート確認から子プロセスbindまでのraceが完全には避けられないため、spawn後にEADDRINUSEが発生した場合もfriendly messageへ変換する、または可能な範囲で再試行してください。

過度に複雑化しないでください。

# 3. START_ONLINE.cmd

リポジトリ直下にWindows用:
`START_ONLINE.cmd`
を追加してください。

要件:
```bat
cd /d "%~dp0"
```
で必ずrepo rootへ移動。

Node/npm確認後:
`npm.cmd run dev:online`

終了コードが非0ならpauseしてエラーを読めるようにする。

通常のCtrl+C終了でも不要に不安を煽るエラー表示はしないよう配慮してください。

このcmdに絶対パス `C:\Users\zikke\...` を書かないでください。
repoの移動にも耐えるよう `%~dp0` を使ってください。

# 4. README

オンライン起動節を初心者向けに更新。

最初に:
```powershell
Set-Location "C:\Users\zikke\Documents\kyoto-diplomacy"
npm.cmd run dev:online
```

を載せる。

説明:
- `C:\Windows\System32` でnpmを実行するとpackage.jsonがないのでENOENTになる
- 必ずrepo rootから実行
- または `START_ONLINE.cmd` をダブルクリック

5173使用中:
1. 以前の `npm.cmd run dev` のPowerShellを探してCtrl+Cが第一選択
2. 新dev-onlineは未指定なら自動fallbackする
3. 手動指定も可能

例:
```powershell
$env:WEB_PORT='5180'
$env:ONLINE_PORT='3011'
npm.cmd run dev:online
```

終了後:
```powershell
Remove-Item Env:WEB_PORT -ErrorAction SilentlyContinue
Remove-Item Env:ONLINE_PORT -ErrorAction SilentlyContinue
```

診断コマンドも追記:
```powershell
Get-NetTCPConnection -LocalPort 5173 -State Listen
```

# 5. テスト

既存テスト全維持。

追加:
- controller same + SC difference => same region fill
- SC marker remains
- hover/selected remains
- port helper finds free port
- 5173 occupied => fallback
- 3001 occupied => fallback
- explicit occupied WEB_PORT => failure/no fallback
- chosen ONLINE_PORT is reflected in web proxy/server environment

可能ならNode unit test用にport selection logicをpure function/moduleへ切り出してください。
実socket bindのintegration testも1ケース追加してよい。

# 6. 完了チェック

必ず:
```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
npm.cmd run test:browser
npm.cmd run map:validate
```

さらに手動/自動で:
- 5173を一時的に占有した状態で `dev:online`
- fallback URLが表示されアクセスできる
を確認してください。

# 7. 完了報告

`docs/PHASE3B_REPORT.md` を作成し、日本語で:

1. 地域色の変更
2. dev:online port fallback
3. explicit port時の挙動
4. START_ONLINE.cmd
5. README変更
6. tests/results
7. ユーザーが今すぐ起動する最短手順
8. known limitations

を記録。

Phase 3B完了後は停止し、イベント/装備へ進まないでください。
