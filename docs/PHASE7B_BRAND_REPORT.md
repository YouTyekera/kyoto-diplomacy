# Phase 7B 公開ブランド・OGP更新

実施日: 2026-10-04。公開Frontendの表示とOGPを更新しました。ゲームルール、オンライン通信、Backend、標準シナリオ、KML、mapId、ファイル名は変更していません。Backend・ルール・データ・ヒーロー画像の283ファイルは作業前のhashと一致しました。

## 表示と画像

トップのメインタイトルは `<ruby>京都ま市ー<rt>きょうとましー</rt></ruby>` です。ふりがなはタイトルの上に表示します。補助画面のブランド表記も「京都ま市ー」にしました。

トップ本文は以下の2行の原文・改行を保持しています。画面幅に応じて自然に折り返します。description、og:description、twitter:descriptionは、この2行を改変せず1行に連結しました。

```text
3〜11人で京都の街を奪い合う、交渉型オンライン戦略ゲーム。
全員が同時に命令を出し、表面上の協力・裏切り・イベントを駆使して補給拠点の制覇を目指そう！
```

説明直後、対戦ボタンの前に控えめな「Presented by ようちぇけら」を配置しました。作者リンクは `https://x.com/ReindeerSkyBean`、`target="_blank"`、`rel="noopener noreferrer"` です。

ブラウザtitle、og:title、twitter:title、OGPのalt、トップのaria-label/altを新ブランドへ統一しました。公開Frontendの実装・静的HTMLには「京都市版 Diplomacy」が残っていません。旧名称を禁止するテストと過去の開発報告は履歴として残します。

OGP画像は既存の実MapCanvas撮影PNGから1200×630で再生成し、タイトルを「京都ま市ー」にしました。盤面と既存ヒーローWebPは保持しています。再生成コマンドは `node scripts/generate-board-media.mjs --og-only`。OGPのURLとファイル名は従来どおりです。

## 検証

1920×1080、1280×720、390×844でトップとふりがなの位置、説明→クレジット→対戦ボタンの順序、横のはみ出し、作者リンク属性を確認しました。どのサイズでもオンライン対戦ボタンは初期画面内にあります。OGPのHTML、文言の完全一致、画像の200応答・実寸法を本番buildで確認し、画像内の新名称も目視しました。

11個の独立ブラウザcontextで標準対局を開始し、11勢力・陸軍59体・補給拠点72か所を確認しました。各陸軍の地域と所有勢力が正式JSONの初期配置に一致します。トップには「11人戦時の実際のマップ」の説明と従来の11勢力盤面画像を表示しています。

| コマンド | 結果 |
| --- | --- |
| `npm.cmd run lint` | 成功 |
| `npm.cmd run typecheck` | 成功 |
| `npm.cmd run test` | 26ファイル・355件成功 |
| `npm.cmd run build` | 成功 |
| `npm.cmd run test:browser` | 最終一括実行で46件成功（6.0分） |
| `npm.cmd run test:production` | 3件成功 |

初回のブラウザ一括実行では既存の3人対局・音楽継続テスト1件がtimeoutしました。演出が自然終了し「スキップ」ボタンが消える瞬間とクリックが競合したためです。単独再実行では成功し、テスト補助処理を修正し、最終の一括再実行では46件すべて成功しました。ゲームの演出・音声実装は変更していません。buildの既存chunk size・Zod annotation警告は残っています。

## 記録

- [公開トップ1920×1080](screenshots/phase7b-brand/public-top-1920.png)
- [公開トップ1280×720](screenshots/phase7b-brand/public-top-1280.png)
- [公開トップ390×844](screenshots/phase7b-brand/public-top-390.png)
- [標準11人対局](screenshots/phase7b-brand/standard-11-players.png)
- [更新したOGP画像](../apps/web/public/og/kyoto-diplomacy-og.png)

## 変更ファイル

公開表示・資産:

- `apps/web/src/LandingPage.tsx` — ruby、新説明、作者クレジット、画像alt。
- `apps/web/src/landing-page.css` — ふりがなとクレジットの控えめな装飾。
- `apps/web/src/App.tsx` — 補助画面のブランド表示1か所。
- `apps/web/index.html` — title、description、OGP、Twitter、alt。
- `scripts/generate-board-media.mjs` — 新名称と既存PNGからのOGP専用再生成。
- `apps/web/public/og/kyoto-diplomacy-og.png` — 再生成画像。

検証:

- `apps/web/src/phase7b.test.ts` — 原文、ruby、作者リンク、metadata。
- `tests/production/phase7b.spec.ts` — 3サイズ、作者リンク、caption、ruby、metadata、画像。
- `tests/browser/phase5a.spec.ts` — タイトル期待値とスキップ操作の競合対策。
- `tests/browser/phase7b-brand.spec.ts` — 11人標準対局と初期配置・トップ表示。
- 本報告と `docs/screenshots/phase7b-brand/` の記録画像。

## Render反映

**今回の変更はFrontendのみManual Deployすれば反映できます。Backendの再Deployは不要です。** GitHubへcommit/push後、Renderの `kyoto-diplomacy-web` で **Manual Deploy → Deploy latest commit** を実行してください。auto deployがOFFなら、pushだけでは更新されません。環境変数の追加・変更も不要です。

Deploy後は公開トップ、新タイトル、画像URL `https://kyoto-diplomacy-web.onrender.com/og/kyoto-diplomacy-og.png` を確認してください。画像URLが同じなので、Discord等の既存リンクプレビューにはキャッシュが残る可能性があります。今回の実公開反映・pushは行っていません。

更新後は停止します。追加のゲームルール、通信変更、公開操作には進みません。
