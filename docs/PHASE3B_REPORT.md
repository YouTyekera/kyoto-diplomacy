# Phase 3B 完了報告

Date: 2026-10-03（日本時間）  
Status: Phase 3B完了。イベント・装備・自転車・Discord Activityへ進んでいません。

spec、README、Phase 3A報告、Phase 1.5 / 2A / 2B / 3A / 3Bの全DECISIONSを全文確認しました。実装より先にPHASE3B_DECISIONSをspecへ反映し、正本を0.7-draftへ更新しました。過去のDECISIONS・完了報告は履歴として保持しています。

## 1. 地域色の変更

`packages/shared/display.ts` のゲーム表示用fillをcontrollerWardIdだけで決める処理へ変更しました。同じ支配勢力ならSC/非SCに同じ既存勢力色を使います。SCによる恒常的な濃淡・brightness・opacityの差を廃止しました。中立fillと静的編集の採用/除外表現を維持しています。

MapCanvasを共用するPreview・Rules Sandbox・ローカル年間進行・オンラインへ適用しました。ゲーム表示の区フィルターによるopacityも現在controllerを参照し、元行政区が違っても同じcontrollerなら揃います。静的編集の区フィルターは元行政区を参照します。

SCは明るい円、SC所有者はsupplyCenterOwnerWardIdの内側リングで示します。地域支配・SC所有・軍所有は別のままです。細い選択枠、hover、軍のpin、御苑障害物の表示を維持しました。従来の濃淡差を期待していた単体テストの1行だけを最新仕様の同色判定へ更新しました。

## 2. dev:onlineのport fallback

`scripts/online-startup.mjs` にポート確認・選択・子プロセス設定を分離しました。WEB_PORT未指定なら5173～5193、ONLINE_PORT未指定なら3001～3021を順に確認し、最初の空きを使います。ユーザーが明示した一方のポートを他方の自動選択で使うことも避けます。

実ポートを両方の子プロセスenvへ渡し、ViteのWeb引数とONLINE_PORTを読むproxy、バックエンドの待受ポートを一致させました。Viteとバックエンド両方の起動確認後に、Server URLと **ONLINE GAME URL**、Ctrl+Cの案内を表示します。オンライン画面のヘッダーにもONLINEと現在のWeb originを表示します。

確認からbindまでに別プロセスがポートを使った場合、子プロセスのEADDRINUSE/Viteの使用中エラーを日本語案内へ変換して終了します。この場合は自動再試行しません。停止対象は今回起動した子プロセスだけです。

## 3. explicit port時の挙動

WEB_PORT / ONLINE_PORTを明示した場合は別ポートへ変更しません。使用中・利用不可なら起動前に終了し、以前の開発サーバーのPowerShellでCtrl+Cする操作、別ポートの指定例、環境変数を消す操作を表示します。空欄・0・65535超・整数以外も明示エラーです。同じポートを両方へ指定する設定も拒否します。

単体テストでWeb/Server両方の使用中指定を検証しました。実際の5173占有中にWEB_PORT=5173で起動し、fallbackせず終了コード1と日本語の対処が出ることも確認しました。

## 4. START_ONLINE.cmd

リポジトリ直下にWindows用起動cmdを追加しました。`cd /d "%~dp0"` で自身のフォルダーへ移動し、Node/npmを確認して `call npm.cmd run dev:online` を実行します。ユーザー固有の絶対パスはありません。

エラー時はpauseで画面を残します。通常のCtrl+Cを起動エラーとして表示せず、代表的な中断終了コードも扱います。Windowsが「バッチ ジョブを終了しますか」と尋ねる場合はYとEnterです。環境によっては中断後にpauseが出るので、その場合は任意のキーで閉じられます。

実Windowsの検証でUTF-8の日本語をcmdに直接複数行置くと読み取りが崩れるケースが見つかりました。cmd本体はASCII・CRLFとし、日本語のNode/npm不足案内は `scripts/node-required.txt` をUTF-8で表示する構成にしました。System32から起動してもrepoへ移動すること、Node/npmのないPATHで日本語のインストール案内が正常に出ることを自動テストしました。

## 5. README変更

オンライン手順の最初にSet-Locationとnpm.cmdを記載しました。System32等のENOENTはpackage.jsonがないためであること、cmdのダブルクリック、自動選択時は表示された実URLを開くことを説明しました。

既存サーバーのPowerShellでCtrl+Cする操作を第一選択とし、共存する場合の自動fallback、5180/3011の手動指定、環境変数の解除、Get-NetTCPConnection / Get-Processによる確認を追加しました。LAN参加URLにも実際のWebポートを使います。URLが変わるとブラウザ保存設定・復帰情報も別扱いになることを記載しています。濃淡表示の旧説明も同色表示へ更新しました。

## 6. tests / results

| チェック | 結果 |
| --- | --- |
| npm.cmd run lint | 成功 |
| npm.cmd run typecheck | 成功 |
| npm.cmd run test | 172件成功（既存157 + 地域色3 + 起動12） |
| npm.cmd run build | 成功、NOTICE/licensesを含むdist生成 |
| npm.cmd run test:browser | 開発表示19シナリオ成功（既存18 + 追加1） |
| E2E_PREVIEW=1のtest:browser | 最終本番ビルドの19シナリオ成功 |
| npm.cmd run map:validate | エラー0・既存警告9、MapDefinition生成 |
| 標準ポート占有時の実起動 | Web5174 / Server3002へfallback、実URLを表示 |
| 代替URLの応答・接続 | Web / health / Socket.IO pollingすべてHTTP200、実ブラウザでサーバー接続確認 |
| 空き確認後のbind競合 | 検証用listenerで再現、日本語案内・終了コード1、子プロセス終了 |
| Windows起動cmd | System32から実起動成功、エラー/Node不足の自動検証成功 |
| 起動・停止 | Ctrl+C後、今回の5174 / 3002と検証用3001が終了、既存5173はHTTP200のまま |

単体テストは11勢力すべての同色、neutral、静的編集、標準候補skip、明示ポートの拒否、探索上限、env/CLIの一致、実socket占有、実cmd起動をカバーします。既存の裁定・秘密命令・再接続・年間進行・京都227原本のハッシュ検証も維持しました。

Playwrightは隣接する架空地域A（SC）/B（非SC）のcomputed fill・opacity・fillOpacity・filter一致、SC円と異なる所有者リング、元行政区をまたぐ同controllerのフィルター表示、全ローカル表示とhover/選択を検証しました。既存の京都オンライン3人シナリオにも同controllerのSC/非SC同色確認を追加しました。[同色表示スクリーンショット](../test-results/phase3b-unified-fill.png)を生成し、円形SC・所有者リング・選択枠を目視確認しました。

5173はすでにユーザーの開発サーバーが占有していたため、そのまま利用して共存を検証しました。3001だけ検証用HTTP listenerで一時占有し、3002への切替後もWeb proxyから実ゲームサーバーへ接続できました。検証用コード・listenerは作業終了時に撤去しています。他のプロセスを停止していません。

## 7. 今すぐ起動する最短手順

エクスプローラーでリポジトリを開き、**START_ONLINE.cmdをダブルクリック**します。表示された **ONLINE GAME URL** をブラウザで開き、「オンライン対戦」へ進みます。停止は起動した画面でCtrl+Cです。

PowerShellの場合は次です。

```powershell
Set-Location "C:\Users\zikke\Documents\kyoto-diplomacy"
npm.cmd run dev:online
```

URLのポートは空き状況で変わります。京都の採用地域・SC・初期軍は人が編集し、地図設定JSONを保存して利用してください。3人試遊の具体的操作はREADME第16節にあります。

## 8. known limitations

ポート確認とbindを原子的には実行できないため、競合時は案内して終了し、ユーザーが再実行します。自動探索は各標準候補から+20までです。リポジトリ外からnpm scriptを直接実行する制約はnpm自体のため残り、Set-Locationまたはcmdで対応します。LANの複数実機での試験は今回行っていません。

Windowsの本番previewで再読込・接続破棄時にViteのws proxy ECONNABORTEDログが出る場合があります。Phase 3Aでも確認された挙動で、今回も再接続を含む全シナリオは成功し、ページ実行エラーはありません。ビルド時のZod内部コメント警告は従来同様のコメント除去です。

ゲーム状態はサーバーメモリのみです。永続保存、タイマー、イベント、装備、自転車、Discord Activityは追加していません。京都初期設定は227地域未採用・SC0・初期軍0で、採用範囲やゲームデザインを独自に決定していません。KML原本・御苑境界・裁定規則も保持しています。**Phase 3Bで停止します。**
