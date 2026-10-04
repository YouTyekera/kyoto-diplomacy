# Codex 初回実装プロンプト — 京都市版Diplomacy Phase 1

このリポジトリでは「京都市版Diplomacy」を開発します。

最初に、リポジトリ直下の `SPEC.md` を全文読んでください。
`SPEC.md` はゲーム仕様の正本です。

ゲームデザインはユーザーとChatGPTが決定します。
あなた（Codex）は実装担当です。

仕様に書かれていないゲームルールを独断で決めないでください。
ゲームデザイン上の判断が必要になった場合は、その機能を勝手に完成させず、最後の報告で「確認が必要な事項」として列挙してください。

ユーザーはCodex・Web開発とも初心者です。
ユーザーが手作業する量を最小限にし、必要な操作はWindows向けに具体的に説明してください。

## 今回のゴール

今回はPhase 1「地図基盤」だけを実装します。

Diplomacyの戦闘裁定、オンライン対戦、イベント効果、自転車移動はまだ実装しません。

今回完成させるのは、

京都市公式KML
→ 内部GeoJSON
→ Web画面で国勢統計区を表示
→ 都市部として使う地域を選択
→ 隣接関係を自動生成
→ 手動overrideで修正
→ 障害物を扱う
→ 地図データを検証
→ 設定を保存

という一連の仕組みです。

このPhaseが完了したら停止してください。
Phase 2へ勝手に進まないでください。

## 1. プロジェクト初期化

空のリポジトリであれば、必要なプロジェクトを初期化してください。

基本技術:
- TypeScript
- React
- Vite
- npm
- Vitest
- ESLint

将来Node.jsサーバーを追加しやすくしてください。

過度に複雑なモノレポ管理ツールは不要です。
npm workspacesを使う場合は初心者でも起動方法が理解できる構成にしてください。

推奨構成例:
- apps/web
- packages/map-core
- packages/map-tools
- packages/shared
- data/source/kyoto-2020-wgs84
- data/generated
- data/maps/kyoto-urban
- docs

必要に応じてより単純な構成へ変更して構いません。
その場合は理由をREADMEに書いてください。

## 2. 京都市公式KMLを入力として扱う

正本:
令和2年度国勢調査 国勢統計区・行政区の領域ポリゴンデータ
KML / WGS84
京都市オープンデータ Dataset 00670
License: CC BY 4.0

ゲームコードからGoogle Mapsをスクレイピングしないでください。

KML原本は `data/source/kyoto-2020-wgs84/` に置く前提にしてください。

ユーザーがKMLファイルを置けば、一つのコマンドでインポートできるCLIを作ってください。

例:
`npm run map:import`

KML原本そのものを書き換えないでください。

変換後データには、
- source file
- ward
- statistical area number
- statistical area name
- stable region id
- geometry
を保持してください。

KMLの実際のプロパティ構造を確認してからパーサーを書いてください。
存在しないフィールド名を推測でハードコードしないでください。

KMLがまだローカルに存在しない場合でも、
- プロジェクトを壊さない
- サンプルデータでUI確認可能
- READMEで配置場所を明示
という状態にしてください。

## 3. GeoJSON / 内部MapDefinition

KMLをWebゲームから扱いやすい形式へ変換してください。

内部形式はGeoJSONを利用して構いません。

静的な地図定義とゲーム中の状態は分けてください。

MapDefinition側には少なくとも:
- regionId
- wardId
- source area number
- name
- geometry
- enabled
- isSupplyCenter
- homeWardId
- startingUnit configuration
を保持できる型を用意してください。

現在所有者、現在ユニット、装備等はMapDefinitionに入れないでください。

JSON Schemaまたは同等のruntime validationを用意してください。

## 4. 地図描画

変換済みGeoJSONをWeb画面へ表示してください。

外部のGoogle Maps等の地図タイルは不要です。

SVGベースの描画を優先してください。
D3 geo等を利用して構いません。

必要な操作:
- pan
- zoom
- reset view
- hoverで地域名
- clickで選択
- 行政区ごとの色分け
- 採用地域 / 除外地域の見分け
- 補給拠点表示
- 障害物表示

見た目は現時点で豪華にする必要はありません。
「編集・検証しやすいこと」を優先してください。

## 5. 都市部採用・除外エディタ

全KML領域からゲームに使う地域を人間が選べるUIを作ってください。

地域をクリックし、
- 使用
- 除外
を切り替えられるようにしてください。

一括操作:
- 行政区単位で全選択
- 行政区単位で全解除

現在の設計意図:
- 左京区は「修学院第一」「松ヶ崎」付近より北側の山間部を使わない
- 右京区は「御室」「常盤野」「広沢」「嵐山」付近より北側の山間部を使わない

ただし、この文章から自動的にどの地域を削るか決定しないでください。
ユーザーが地図を確認してクリック選択します。

選択結果を設定JSONへ保存し、再読み込みできるようにしてください。

ブラウザから直接任意のローカルパスへ書込むことが難しい場合は、
- JSONをDownloadする
- JSONをImportする
方式で構いません。

## 6. 隣接関係の自動生成

採用地域同士の隣接グラフを自動生成してください。

要件:
- ポリゴンが一定以上の長さの境界を共有する場合を隣接候補とする。
- 一点だけ接触する地域は隣接にしない。
- MultiPolygonを考慮する。
- 座標誤差に対するtoleranceを設定可能にする。
- 計算結果は決定的であること。
- 隣接は対称であること。

地理演算にはTurf等の十分に検証されたライブラリを利用して構いません。

パフォーマンス上必要であればbbox等で候補を絞ってください。

「touchesだけ」で一点接触まで隣接扱いする実装にはしないでください。

## 7. 隣接overrideエディタ

自動生成結果を人間が修正可能にしてください。

地域Aを選択した状態で、
- 現在の隣接地域をハイライト
- 地域Bをクリックして隣接を追加
- 既存隣接を削除
できるUIを用意してください。

設定には可能なら
- adjacencyAdd
- adjacencyRemove
として差分保存してください。

override適用後の隣接関係がゲーム用の最終値です。

## 8. 補給拠点・初期配置エディタ

地域を選択して以下を設定できるようにしてください。

- Supply Center ON/OFF
- homeWardId
- starting unit ON/OFF
- starting unit owner ward

補給拠点は実在施設とは関係ありません。
土地そのものへ設定します。

6～7という初期軍数をコードに固定しないでください。

勢力ごとの現在の設定数をサイドパネルに表示してください。

## 9. 障害物

京都御苑を将来「侵入不能領域」として扱います。

今回のPhaseでは汎用的な障害物Polygon/MultiPolygonを扱える基盤を作ってください。

最低限:
- obstacle GeoJSONを読み込める
- 地図に重ねて表示できる
- region geometryとのintersectionを検出できる
- obstacleを差し引いた場合にregionが非連結になるケースを検出・警告できる

正確な京都御苑ポリゴンそのものを推測して作らないでください。
出典が未確定だからです。

サンプル障害物で動作テストしてください。

可能なら簡単なPolygon作成UIを追加してもよいですが、Phase 1を不必要に大きくする場合は必須ではありません。

## 10. マップ検証画面

以下を自動検証してください。

- duplicate region ids
- invalid references
- asymmetric adjacency
- isolated regions
- connected components
- adjacency to excluded regions
- invalid override
- starting unit on excluded region
- duplicate starting units
- obstacle intersection
- obstacleによる非連結region
- supply center counts by ward
- starting unit counts by ward
- enabled region counts by ward

さらに分析表示として:
- 各regionのdegree（隣接数）
- 行政区間で接続しているregion pair
- 各行政区が直接接する行政区数

バランスの「点数」や「良い/悪い」の自動評価は不要です。

## 11. テスト

最低限、次の自動テストを作ってください。

- stable id generation
- KML parser / converter
- point contact is NOT adjacency
- shared edge IS adjacency
- adjacency is symmetric
- adjacencyAdd
- adjacencyRemove
- excluded region handling
- MultiPolygon handling
- obstacle intersection detection
- disconnected geometry warning
- config validation

テスト用の小さい架空GeoJSON/KML fixtureを含めて構いません。

## 12. README

プログラミング初心者向けに日本語READMEを書いてください。

Windows 11 + PowerShell前提で、
- 必要なソフト
- Node.js確認方法
- npm install
- 開発サーバー起動
- 停止方法
- 京都市KMLを置く場所
- KML importコマンド
- マップエディタ起動方法
- 設定の保存方法
- test / typecheck / buildコマンド
- よくあるエラー

を省略せず記載してください。

コマンドはコピペ可能にしてください。

京都市KMLの出典とCC BY 4.0 attributionもREADMEまたはNOTICEへ記載してください。

## 13. 作業完了前に実行すること

必ず実行:
- install
- lint
- typecheck
- test
- production build

エラーがあれば修正してから完了報告してください。

KML原本が未配置で実データテストだけ実行できない場合は、
- サンプルfixtureのテスト結果
- 実KML配置後にユーザーが実行するコマンド
を分けて報告してください。

## 14. 完了報告

最後に日本語で以下を整理して報告してください。

1. 実装した内容
2. 作成・変更した主要ファイル
3. 実行したコマンド
4. テスト結果
5. 私が次に行う操作を番号付きで具体的に
6. ブラウザで確認すべきこと
7. 未実装事項
8. 仕様確認が必要な事項

ゲームデザインの提案は不要です。

Phase 1が終わったら停止し、Phase 2以降は実装しないでください。
