# Phase 7B 完了報告

実施日: 2026-10-04。実装指示は `CODEX_PHASE7B_PROMPT.md`。標準シナリオ・公開トップ・用語統一・実盤面画像・静的OGPを実装しました。Renderへのpush・Deployは行っていません。

## 1. 正式標準JSON

- 配置先: [data/default-scenarios/kyoto-standard.json](../data/default-scenarios/kyoto-standard.json)
- SHA-256: `0890799a41e08e9049a1c6709b74437acdaf22b38022811561d5766665359652`
- 添付原本と配置ファイルのbytes/hashは一致。enabled、補給拠点、homeWardId、startingUnit、隣接override、御苑障害物を変更・再生成していません。
- Gitの改行変換で原本が変わらないよう、`.gitattributes`でこのJSONだけ `-text` を指定しました。
- 227件の地域設定、採用190地域、補給拠点72か所、初期陸軍59体。既存compile/preflightの結果はエラー0・警告12です。[検証記録](screenshots/phase7b/standard-validation.json)に全件を保存しました。

警告は御苑と地域の重なり、差し引き後の分割、原本の複数部分、区ごとの配置数の差などです。標準設定を自動補正せず、ロビーの検証詳細へ表示します。添付JSONの全59体は全11区の初期配置数です。参加人数に応じた無所属区・軍の除外は従来の開始ルールに従います。

## 2. 標準での起動・カスタム切替

トップの「オンライン対戦」→ニックネーム・希望区→「ルームを作成」で、標準シナリオが選択済みになります。友達を招待し3～11人が参加した後、ファイルを選ばず「オンラインゲーム開始」を押せます。

標準の正本はBackendが起動時に読み込みます。クライアントのエディタ設定を標準として採用せず、既存のJSON/schema検証、Dataset照合、compile、preflightを通します。validationを省略する専用経路は作っていません。RenderのPORT/bind/CORS設定は維持しています。

独自設定はホストの「カスタムJSONを読み込む」で切り替えます。「標準シナリオ」を押すと正式標準へ戻ります。同じファイル名でもカスタムとして識別し、不正JSONの場合は直前のシナリオを保持します。ゲストの変更と開始後の変更は拒否します。地図エディタから入る開発用Onlineは、既存のエディタ設定による検証導線を維持しています。

## 3. トップ画面・確定コピー

タイトルは「京都市版 Diplomacy」。次の3行を文字列として完全一致させ、改行も保持しました。スマートフォンでは幅に応じた追加の折返しがあります。

```text
京都の街を分け合い、交渉し、裏をかき、補給拠点を奪い合う。
一手の読みと会話の駆け引きが、そのまま勝敗につながる。
本家ディプロマシーに運の要素を加えた京都発戦略ボードゲーム
```

デスクトップでは左にタイトル・コピー・主ボタン、右に盤面画像を配置。モバイルでは縦に並べます。「オンライン対戦」を主導線、「ローカルで試す」「設定」を補助導線にしました。公開版の開発ツールは最下部の閉じたdetailsです。1920×1080、1280×720、390×844で横方向のはみ出しがなく、オンライン対戦ボタンが初期画面内に収まることを確認しました。

## 4. 陸軍・補給拠点の用語

command dockの「選択中のArmy」とMapCanvas説明の「Armyピン」を日本語へ変更しました。player-facing message変換にArmy/army→陸軍を追加し、「選択Army」は「選択中の陸軍」とします。トップ・ロビー・盤面・dock・勝利条件等の実DOMとaria-label/title/altを検査しました。既存のSC→補給拠点変換も維持しています。

内部のTypeScript型、CSSクラス、JSON `type: army`、unitId、裁定ログの機械用項目、schemaのゲーム型は変更していません。撤退・冬の増減員・装備・結果などは既存ブラウザ回帰でも操作を確認しました。

## 5. 実盤面からの画像生成

[scripts/generate-board-media.mjs](../scripts/generate-board-media.mjs)が、実アプリの地図エディタへ正式JSONを読み込み、Game Previewを再生成し、開始前のローカル試遊MapCanvasを作戦表示で撮影します。撮影状態は全11勢力の初期配置表示で、59体の陸軍と72か所の補給拠点をDOMから確認しています。3人対局の開始後状態とは区別しています。

山地背景・勢力色・補給拠点・陸軍は実際のMapCanvasです。svg.mapだけを撮影し、開発パネル、結果トレイ、command dock、デバッグ文言は写していません。PNGからブラウザcanvasでWebPへ変換し、OGPは同じ盤面へタイトルだけを加えました。第三者の素材は使用していません。

| 画像 | 寸法・用途 |
| --- | --- |
| [apps/web/public/media/kyoto-board-hero.webp](../apps/web/public/media/kyoto-board-hero.webp) | 1600×900、トップ配信用 |
| [apps/web/public/og/kyoto-diplomacy-og.png](../apps/web/public/og/kyoto-diplomacy-og.png) | 1200×630、リンクプレビュー |
| [board-source.png](screenshots/phase7b/board-source.png) | 実MapCanvasの撮影原本 |
| [media-proof.json](screenshots/phase7b/media-proof.json) | 撮影状態・hash・件数・出力寸法 |

再生成時はローカル開発サーバーを起動し、`node scripts/generate-board-media.mjs http://127.0.0.1:5190` のようにそのURLを指定します。撮影処理はアプリの設定を読み込むだけで、正本JSONを書き換えません。

## 6. OGPと本番build

JavaScript実行を必要としない静的 `apps/web/index.html` に設定しました。

| meta | 値 |
| --- | --- |
| title / og:title / twitter:title | 京都市版 Diplomacy |
| description / og:description / twitter:description | 京都の街を分け合い、交渉し、裏をかき、補給拠点を奪い合う。読みと会話の駆け引きで勝敗が決まる、京都発戦略ボードゲーム。 |
| og:type | website |
| og:url | `https://kyoto-diplomacy-web.onrender.com/` |
| og:image / twitter:image | `https://kyoto-diplomacy-web.onrender.com/og/kyoto-diplomacy-og.png` |
| og:image:width / height | 1200 / 630 |
| og:image:alt | 京都市版 Diplomacyの標準シナリオ。勢力色・補給拠点・陸軍が見える京都の実盤面。 |
| twitter:card | summary_large_image |

公開用環境変数でbuildしたHTMLのmeta、ヒーロー/OGPのHTTPSでの200応答・実寸法、localhost固定参照がないことをローカルの本番構成で確認しました。指定したRender実URLへの今回の更新は未実施です。Discord等の実リンクプレビューはDeploy後の確認が必要です。

## 7. テスト結果

| コマンド | 結果 |
| --- | --- |
| `npm.cmd run lint` | 成功 |
| `npm.cmd run typecheck` | 成功 |
| `npm.cmd run test` | 26ファイル・354件成功 |
| `npm.cmd run build` | 成功 |
| `npm.cmd run test:browser` | 45件成功（6.4分）。既存3001を避け5191/3047で実行 |
| `npm.cmd run test:production` | 3件成功 |
| `npm.cmd run map:validate` | 成功。従来エディタ初期設定はエラー0・警告9 |

正式標準は別途既存compile/preflightでエラー0・警告12を確認しています。map:validateのエディタ初期設定を正式標準へ上書きしていません。ゲーム/裁定コア、KML、既存MapConfigとイベント・勝利・演出設定の253ファイルは作業前hashと一致しました。

HTTPS/WSSの3クライアント試験では、標準をアップロードせずルーム作成・招待・区割当・開始、自軍左クリック→合法地域右クリック→Move命令/矢印/dock、Support、確定・裁定、再読込・transport再接続まで確認しました。起動待ち→再試行→復帰、既存7種SEの本番asset pathも成功しています。

検証中に既存の音源404テストが失敗しました。補助処理がproduction bundleだけを書き換えており、Vite開発moduleではテスト用音源が未設定になることが原因でした。両形式を扱うテスト補助処理に修正しました。音声実装は変更していません。新規標準統合テストは実京都compile/preflight/startを含むため、並列負荷時の5秒timeoutを15秒にしました。production検証の新規assertionではSocket受信を待ち、仮公開ホストの画像確認にはChromium側のfetchを使用しています。

buildの既存chunk size警告とZod annotation警告は残っています。

## 8. 目視記録

以下のトップ3サイズ、OGP、標準盤面、Move/Support盤面を実際に開いて確認しました。

- [公開トップ1920×1080](screenshots/phase7b/public-top-1920.png)
- [公開トップ1280×720](screenshots/phase7b/public-top-1280.png)
- [公開トップ390×844](screenshots/phase7b/public-top-390.png)
- [標準シナリオ3人開始・勝利条件](screenshots/phase7b/standard-online.png)
- [本番構成の標準Move/Support1920×1080](screenshots/phase7b/public-standard-move-support-1920.png)
- [本番構成の標準Move/Support1280×720](screenshots/phase7b/public-standard-move-support-1280.png)
- [標準対局の再接続1280×720](screenshots/phase7b/public-standard-reconnected-1280.png)

## 9. Render反映と停止範囲

利用者側で必要な操作は [DEPLOY_RENDER.md](DEPLOY_RENDER.md) のPhase 7B更新手順に記載しました。

1. 変更コード、`.gitattributes`、標準JSON、public画像をcommitしGitHubへpushします。
2. **BackendでManual Deploy → Deploy latest commit**。内蔵標準JSONとリクエスト検証を反映します。
3. **FrontendでもManual Deploy → Deploy latest commit**。トップ・文言・画像・OGPをbuildします。
4. 公開トップ、画像2種の200、標準の3人開始・招待・カスタム切替、Discord等のプレビューを実URLで確認します。

**auto deployがOFFの場合、GitHubへpushしただけでは公開版は更新されない可能性があります。FrontendとBackendの両方を手動Deployしてください。** 新しい環境変数は不要です。Backend再起動・再deployでメモリ上のRoomが失われる可能性があるため、対局のない時間に更新します。

Phase 7Bで停止します。新ルール、裁定変更、永続DB、Discord Activity化、公開アカウント操作には進んでいません。
