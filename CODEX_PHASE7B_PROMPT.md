# Codex向け指示文 — Phase 7B 公開トップ・標準シナリオ・用語統一

`spec.md`、`README.md`、`docs/PHASE6C_REPORT.md`、`docs/PHASE7A_REPORT.md`、現在の公開トップ画面、オンラインロビー、プレイヤー向け全文言、OGP/HTML設定を確認してください。

添付の `kyoto-standard.json` は、今後の **京都市版 Diplomacy の標準シナリオ** として扱ってください。
元ファイルの設定内容を勝手に変更・再生成せず、そのまま正式な標準設定としてリポジトリへ組み込んでください。

今回は Phase 7B として、以下をまとめて実装してください。
ゲームルール、裁定、勝利条件、イベント規則、公開通信方式は変更しないでください。

## 1. 標準シナリオを内蔵する

添付の `kyoto-standard.json` を、公開版で誰でも使える標準シナリオとしてリポジトリへ保存してください。

要件:
- ファイル名は公開用途として分かりやすい名前にする。例:
  `data/default-scenarios/kyoto-standard.json`
- 内容は添付JSONを正とし、地域のenabled、補給拠点、homeWardId、startingUnit、adjacency override、京都御苑障害物等を勝手に変更しない
- オンライン対戦では、ホストがJSONをアップロードしなくても標準シナリオでそのままルームを開始できる
- カスタムJSONを読み込む既存機能は残す
- UIでは
  `標準シナリオ`
  `カスタムJSONを読み込む`
  の違いが分かるようにする
- 初期状態では標準シナリオを選択済みにする
- 標準シナリオを使うだけなら、初見ユーザーにファイル選択を要求しない
- server authoritative / validation / compileの既存経路を通し、標準シナリオだけ特別に検証を省略しない

## 2. トップ画面の本文は下記を一字一句そのまま使用する

次の3行はユーザー確定文です。
言い換え、要約、句読点変更、語尾修正をしないでください。

「京都の街を分け合い、交渉し、裏をかき、補給拠点を奪い合う。
一手の読みと会話の駆け引きが、そのまま勝敗につながる。
本家ディプロマシーに運の要素を加えた京都発戦略ボードゲーム」

タイトルは引き続き
`京都市版 Diplomacy`
を使用してください。

不要な追加説明をタイトル直下へ増やさず、この3行を主コピーとして見せてください。

## 3. Frontendの `Army` 表記をすべて `陸軍` に統一する

プレイヤーから見えるFrontendでは、`Army` / `army` を表示しないでください。

置換対象の例:
- Army -> 陸軍
- Army数 -> 陸軍数
- 選択Army -> 選択中の陸軍
- Armyなし -> 陸軍なし

対象:
- トップ/ロビー
- HUD
- command dock
- tooltip
- 地域インスペクタ
- イベント説明
- 命令説明
- 撤退
- Build/Disband
- 結果画面
- 勝利条件/ヘルプ
- player-facing error/message
- aria-labelなどユーザーが読み上げで触れる文言

内部のTypeScript type、JSONの `"type": "army"`、schema、telemetry、server protocol、test fixture等は互換性のため変更しなくてよい。
**表示層だけを「陸軍」に統一すること。**

あわせて既に実施済みの
`SC` -> `補給拠点`
の用語統一を回帰確認してください。

## 4. トップ画面に実盤面のヒーロー画像を自動生成・配置する

ユーザーに画像準備を要求しないでください。
Codex側で、添付の標準シナリオを実際のアプリに読み込んだ状態から、PlaywrightまたはChromiumを使ってきれいな盤面スクリーンショットを作成してください。

### 画像の内容
- 添付標準シナリオを実際にロード
- 実際のゲーム用MapCanvasを使用
- 山地背景、勢力色、補給拠点、陸軍が見える
- 開発ツールを写さない
- デバッグ文言を写さない
- イベント/結果トレイ等は閉じる
- command dockも不要なら閉じる
- 盤面が一番きれいに見える作戦表示
- 京都の都市部が小さくなりすぎない
- 複数勢力の色が見える構図
- UIの生スクリーンショット感を減らしつつ、**実際のゲーム画面であること**
- 他作品の画像や外部素材を使わない

### ヒーロー用
16:9前後の横長画像として書き出す。
例:
`apps/web/public/media/kyoto-board-hero.webp`

トップ画面では:
- タイトル/コピーの近くに配置
- `object-fit: cover`
- 角丸は既存UIに合わせる
- 画像の上に大量の文字を重ねない
- オンライン対戦ボタンが画面下へ追いやられすぎない
- 1280px程度でもファーストビューの構成が破綻しない

可能ならPNG元画像も開発記録用に残し、Web配信はWebP等に最適化してよい。

## 5. OGP / Discord等のリンクプレビュー

公開URL:
`https://kyoto-diplomacy-web.onrender.com/`

をDiscord等へ貼った際にタイトル・説明・画像が出るようにしてください。

静的トップページ用OGPのみでよく、ルームごとの動的OGPは不要です。

設定:
- `<title>京都市版 Diplomacy</title>`
- `og:title = 京都市版 Diplomacy`
- `og:description` は下記を使用:
  `京都の街を分け合い、交渉し、裏をかき、補給拠点を奪い合う。読みと会話の駆け引きで勝敗が決まる、京都発戦略ボードゲーム。`
- `og:type = website`
- `og:url = https://kyoto-diplomacy-web.onrender.com/`
- `twitter:card = summary_large_image`

### OGP画像
ヒーロー画像と同じ実盤面をベースに、1200x630の専用画像をCodex側で作成してください。
例:
`apps/web/public/og/kyoto-diplomacy-og.png`

要件:
- 実盤面を主役にする
- 小さく表示されても京都市版Diplomacyだと分かる
- 必要ならタイトル文字だけ追加してよい
- 文章を大量に入れない
- 外部/他作品素材を使用しない
- 公開URLから直接200で取得可能
- `og:image` は絶対URLにする
- `og:image:width=1200`
- `og:image:height=630`
- `og:image:alt` も設定

可能なら `twitter:title` / `twitter:description` / `twitter:image` も同じ内容で設定してください。

## 6. 公開トップ画面の情報階層

公開版では主導線を明確にしてください。

優先順位:
1. 京都市版 Diplomacy
2. 確定した3行コピー
3. ヒーロー盤面画像
4. `オンライン対戦`
5. 必要に応じて簡単な補足
6. `ローカルで試す`
7. `設定`

`開発ツール` は公開版では主役にしないでください。
可能なら `VITE_PUBLIC_DEPLOYMENT=true` のときは折りたたむ、最下部に弱く置く、または開発用導線として視覚的優先度を下げてください。
機能自体を削除する必要はありません。

## 7. テスト

必須:
- 標準シナリオがファイルアップロードなしでonline lobbyから使用可能
- 標準シナリオが既存のvalidation/compileを通る
- カスタムJSON機能の回帰
- player-facing DOMに `Army` / `army` が残っていない
- player-facing DOMにSC略称が再発していない
- 確定3行コピーが完全一致
- hero imageが200
- OGP imageが200
- index.html / production HTMLにOGP metaが含まれる
- og:urlが公開Frontend URL
- og:imageが絶対HTTPS URL
- 1280x720 / 1920x1080トップ画面 screenshot
- mobile幅でも最低限破綻しない
- online room creation / standard scenario / 3 client startを回帰確認

実行:
```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
npm.cmd run test:browser
npm.cmd run test:production
npm.cmd run map:validate
```

## 8. 完了報告

`docs/PHASE7B_REPORT.md` を作成してください。

記載:
1. 添付JSONの配置先とhash
2. 標準シナリオの起動方法
3. カスタムJSONとの切替
4. 確定トップコピー
5. Army -> 陸軍 の置換範囲
6. ヒーロー画像をどの状態から撮影したか
7. ヒーロー画像/OGP画像のpathと寸法
8. OGP meta一覧
9. production buildでの確認
10. テスト結果
11. Renderへ反映するためにユーザー側で必要な操作

最後に、現在Renderはauto deployをOFFにしている想定なので、
**GitHubへpushしただけでは公開版は更新されない可能性がある**ことを明記し、
Frontend / BackendのどちらをManual Deployすべきかも報告してください。

Phase 7B完了後は停止してください。
新ルール、永続DB、Discord Activity化には進まないでください。
