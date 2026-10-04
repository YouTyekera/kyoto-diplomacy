# Phase 1 完了報告

実施日: 2026-10-02（日本時間）

## 1. 実装した内容

リポジトリ直下の `spec.md` を全文読み、続いて `CODEX_FIRST_PROMPT.md` を全文確認し、Phase 1に限定して実装した。

- TypeScript / React / Vite / npm / Vitest / ESLintのプロジェクト初期化。
- 正本Dataset 00670の公式227国勢統計区KMLの取得、加工しない原本と取得元一覧の保存。
- 実際のDocument名・Placemark構造を確認したKMLパーサー。安定ID、行政区、番号、名称、原本情報、SHA-256、Polygon / MultiPolygon、穴を保持。複数Placemarkのポリゴンを統合。
- 内部地域JSONと標準GeoJSONへの一括変換CLI。
- SVG地図、ドラッグ移動、カーソル位置を基準としたホイールズーム、拡大縮小、全体リセット、行政区拡大、ホバー名称、クリック選択、行政区色分け、採用/除外表示、拠点・初期ユニット表示。
- 地域単位・行政区単位の採用/除外、検索、補給拠点・ホーム勢力・初期配置の編集。
- 共有境界長と許容距離による自動隣接、点接触除外、MultiPolygon対応、対称性、決定性、空間セルによる計算候補の絞り込み。
- 隣接overrideの追加・削除・取消と `adjacencyAdd` / `adjacencyRemove` 差分保存。
- 障害物GeoJSON読込・保存・表示・差し引き。交差、分断、完全消失の検証。元形状と移動可能形状を分離。
- ID、参照、非対称、孤立、連結成分、除外参照、override、初期配置、障害物の検証と客観的な集計。
- 設定JSON保存/読込、ブラウザ内自動保存、MapDefinition出力、検証レポート出力。計算用Web Worker。
- Dataset / Config / MapDefinitionのZod runtime validation。現在所有者等のゲーム中状態は静的地図へ含めない。
- 架空サンプルと障害物fixture。変換データ未配置時の表示、壊れたデータのエラー表示と復帰。
- 日本語初心者向けREADME、CC BY 4.0帰属表示、依存ライブラリのライセンス確認。

## 2. 主要ファイル

| ファイル | 役割 |
| --- | --- |
| `package.json` / `package-lock.json` | 実行コマンド、依存関係、固定バージョン |
| `vite.config.ts` / `tsconfig.json` / `eslint.config.js` | 開発、ビルド、型検査、lint |
| `packages/shared/model.ts` | 静的地図型とruntime validation |
| `packages/map-tools/kml.ts` | 公式00670実構造のKMLパーサー |
| `packages/map-tools/download.ts` / `import.ts` / `validate.ts` | 取得・変換・検証CLI |
| `packages/map-core/geometry.ts` / `adjacency.ts` / `compile.ts` / `validation.ts` | 障害物、隣接、地図生成、検証 |
| `packages/map-core/map.test.ts` / `fixtures/official-format.kml` | 自動テストと架空KML |
| `apps/web/src/App.tsx` / `MapCanvas.tsx` / `map.worker.ts` / `style.css` | 地図エディタ |
| `data/source/kyoto-2020-wgs84/` | 公式KML227件、取得元manifest |
| `data/generated/regions.json` / `regions.geojson` | 全227地域の変換データ |
| `data/maps/kyoto-urban/initial-config.json` | 未採用・未配置の初期設定 |
| `data/maps/sample-obstacle.geojson` | 架空障害物 |
| `tests/browser/editor.spec.ts` / `playwright.config.ts` | 実ブラウザ検証 |
| `README.md` / `NOTICE.md` | Windows操作手順、出典・ライセンス |

`spec.md` と `CODEX_FIRST_PROMPT.md` の内容は変更していない。利用者が削除した旧00631データは使用・復元していない。

## 3. 実行コマンド

```powershell
npm.cmd install --cache .npm-cache --no-audit --no-fund
npm.cmd run map:download
npm.cmd run map:import
npm.cmd run map:validate
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) ".playwright-browsers"
npm.cmd exec -- playwright install chromium
npm.cmd run test:browser
$env:E2E_PREVIEW = '1'
npm.cmd run test:browser
```

PowerShellの実行ポリシーは変更せず、`npm.ps1` ではなく `npm.cmd` を使った。Codexの制限環境ではネットワーク取得やNode.jsのユーザー情報取得が拒否されたため、許可された制限外実行でインストールと各チェックを完了した。

## 4. テスト結果

- lint: 成功。
- typecheck: 成功。
- Vitest: **21件成功**。要求された安定ID、KML、点接触、共有辺、対称隣接、追加/削除、除外、MultiPolygon、障害物交差、分断、設定検証を含む。
- 公式実データ: **227件**の番号・行政区・名称を取得元のタイトルと照合し、全原本のSHA-256と生成データを照合。
- 全227地域を**検証用にメモリ内だけで採用**した場合: 隣接 **627組**、連結成分 **1**、エラー **0**。この採用状態は保存していない。
- 原本由来のMultiPolygon警告: 南大内、安井、砂川。形状を黙って分割・結合する処理は追加していない。
- 初期設定: 採用0、拠点0、初期ユニット0。範囲未設定の警告と原本MultiPolygon警告を表示。
- Chromium: **3シナリオ成功**。公式地図編集、初期配置・ホーム勢力、override追加/削除/取消、設定保存読込、再読込復元、パンズーム、SVGクリック・ホバー・ホイール、障害物警告、404時サンプル表示、壊れた設定の保護、破損地図からの復帰。
- 同じ3シナリオは**開発サーバーと本番ビルドのpreviewの両方**で成功。テスト用サーバーはテスト終了時に停止。
- production build: 成功。Viteは依存Zod内の最適化コメントに警告を出すが、当該コメントを除去して正常に生成する。

## 5. 次の操作

1. VS Codeでターミナルを開き、リポジトリ直下にいることを確認する。
2. `npm.cmd run dev` を実行する（依存関係と公式KMLは取得済みなので、初回セットアップのやり直しは不要）。
3. ブラウザで **http://127.0.0.1:5173/** を開く。
4. 行政区を選び、「選択区を拡大」して採用範囲を確認する。
5. 採用/除外、補給拠点、ホーム勢力、初期配置を設定する。
6. 「検証」で問題を確認し、必要な隣接差分を編集する。
7. 「設定JSONを保存」でダウンロードする。必要なら `data/maps/kyoto-urban/` へコピーする。
8. 作業を終えるときは、起動したターミナルでCtrl + Cを押す。

詳しい手順とトラブル対応はREADMEに記載した。

## 6. ブラウザで確認すること

- 全227国勢統計区が表示され、灰色の未採用状態から編集できること。
- 行政区フィルター、検索、区単位の採用/除外、地域詳細が使えること。
- 地図のドラッグ移動、ホイール・ボタン拡大縮小、全体リセットが使えること。
- 隣接overrideモードでAを維持したままBを追加/削除できること。
- 拠点・初期ユニット設定と各勢力の集計が変わること。
- 設定JSONの保存→読込で編集内容が復元されること。
- 架空サンプルで分断障害物を追加すると、地図に表示され検証警告が出ること。

## 7. 未実装事項

- 任意項目の障害物手描き作成UI（GeoJSON読込で対応）。
- 正確な京都御苑ポリゴン（出典と入力形状が未確定）。
- Phase 2以降の裁定エンジン、ゲーム進行、オンライン同期、イベント、装備、自転車、勝利・終了判定。

## 8. 仕様確認が必要な事項

- 最終的な都市部採用範囲。
- 補給拠点数・配置、ホーム勢力、初期ユニット数・配置と拠点の対応。
- 京都御苑ポリゴンの正確な境界・出典・ライセンス。
- 原本から複数部分を持つ地域や、障害物で分断される地域の最終的な扱い（同一地域維持、論理地域分割、override等）。

これらは人が判断するため、ゲームデザインとして確定していない。**Phase 1で停止し、Phase 2へ進まない。**
