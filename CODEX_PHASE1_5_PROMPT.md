# Codex Phase 1.5 実装プロンプト — 表示改善とGameState Preview

このリポジトリでは「京都市版Diplomacy」を開発しています。

## 最初に読むもの

作業開始前に、必ず以下を全文確認してください。

1. `SPEC.md`
2. `README.md`
3. `PHASE1_REPORT.md`（リポジトリに存在する場合）
4. `PHASE1_5_DECISIONS.md`

`PHASE1_5_DECISIONS.md` はPhase 1完了後に確定した仕様差分です。
既存SPECと矛盾する場合、この差分を優先してください。

最初に `PHASE1_5_DECISIONS.md` の決定事項を `SPEC.md` に反映し、
`SPEC.md` をゲーム仕様の正本として更新してください。

ゲームデザインはユーザーとChatGPTが行います。
Codexは実装担当です。
仕様にないゲームルールを独自に考案・実装しないでください。

---

# 今回の目的

Phase 1.5では、Phase 1で完成した地図エディタを壊さずに、

1. 「どの地域にどのユニットがいるか」が一目で分かる表示
2. 補給拠点と通常地域の視覚的な区別
3. 現在の支配勢力で地域を色分けできるGameState Preview
4. 将来のゲーム画面に流用できる地域内表示アンカー

を追加してください。

今回はゲームルールの裁定は実装しません。

Phase 1.5が完了したら停止してください。
Phase 2のDiplomacy裁定へ勝手に進まないでください。

---

# 1. 既存Phase 1を壊さない

Phase 1では以下が既に動作しています。

- 公式227国勢統計区KMLの読込
- GeoJSON変換
- SVG地図
- 採用/除外
- 補給拠点
- 初期配置
- 自動隣接
- adjacency override
- 障害物
- 検証
- 設定JSON保存/読込
- MapDefinition出力

既存の設定JSONとMapDefinitionを読み込める状態を維持してください。

既存フィールドを削除する場合はmigrationなしで破壊しないでください。

特に `homeWardId` は現在のゲームデザインでは使用しない方針ですが、
Phase 1.5では後方互換性のため保持してください。

- ゲーム画面の色分けには使わない
- 支配領域判定には使わない
- 撤退には使わない
- 脱落条件には使わない
- 勝利条件には使わない
- 通常UIでは非表示または互換用扱いにする

---

# 2. 「地理的中心点」ではなく見やすい表示アンカーを作る

現在、補給拠点や初期ユニットの記号が地域の中心付近へ機械的に置かれ、
細長い・凹型・MultiPolygon等の地域で見づらい位置になることがあります。

各採用地域について、ゲーム表示用の `displayAnchor` を計算してください。

要件:

- 必ず `playableGeometry` の内部に位置すること。
- 単純なcentroidだけに依存しないこと。
- 凹型ポリゴンでも視覚的に自然な内部点を選ぶこと。
- Polygon / MultiPolygonに対応すること。
- MultiPolygonでは原則として最大面積部分を優先してよいが、結果を決定的にすること。
- `polylabel`（pole of inaccessibility）または同等の安定したアルゴリズムを利用してよい。
- 外部ライブラリを追加する場合はライセンスを確認すること。
- 計算値は毎renderで再計算せず、MapDefinition生成時またはmemoizedな処理で扱うこと。

MapDefinition側に、必要なら以下を追加してください。

- `displayAnchor: [longitude, latitude]`

さらに人間が例外修正できるよう、

- `displayAnchorOverride`

を設定JSONへ追加できるようにしてください。

地図エディタ上で地域を選択し、
「表示位置をこの地点に設定」のような最小限の操作でoverrideできるようにしてください。

override点が当該 `playableGeometry` 外なら検証エラーまたは明確な警告にしてください。

---

# 3. 補給拠点・ユニットの表示レイアウト

本番想定では、同一地域に

- 補給拠点
- ユニット
- 地域名/選択表示
- 将来は装備

が重なります。

Phase 1.5では少なくとも補給拠点とユニットが重ならないレイアウトにしてください。

推奨:

- ユニット駒を `displayAnchor` の主役として表示
- 補給拠点はその周囲に小さなbadge/リングとして表示
- 補給拠点だけの地域では `displayAnchor` 付近にSC記号
- ユニットがいる場合はSC記号を少しoffsetする、またはユニット駒へSC badgeを添える

重要:
- 単なる「小さい丸」と「小さい三角」だけで本番画面を作らない
- どの地域に所属するユニットか分かること
- 地域をhover/選択したとき、その地域・ユニット・補給拠点が連動して強調されること
- ズームレベルが変わっても極端に読めなくならないこと
- 地域が非常に小さい場合でも隣の地域の駒と誤認しにくいこと

Phase 1.5では美術的に完成させる必要はありません。
可読性と構造を優先してください。

---

# 4. GameState Previewを追加

静的MapDefinitionとゲーム中状態を分離する既存方針を維持してください。

ゲームルールはまだ実装しませんが、
表示確認のために `GameStatePreview` または同等の型を追加してください。

最低限:

```ts
type RegionControl = {
  regionId: string
  controllerWardId: string | null
  supplyCenterOwnerWardId: string | null
}

type PreviewUnit = {
  unitId: string
  ownerWardId: string
  regionId: string
  type: 'army'
}

type GameStatePreview = {
  regionControl: Record<string, RegionControl>
  units: PreviewUnit[]
}
```

正確な型は既存コードに合わせて改善して構いません。

ただし、

- 地域の現在支配勢力
- 補給拠点の現在所有勢力
- 現在のユニット

を別々に保持してください。

`homeWardId` を現在の支配勢力として流用しないでください。

---

# 5. Previewの初期状態

「ゲームプレビュー」モードを追加してください。

これは実ゲームではなく表示確認専用です。

初期Previewを生成する際は:

- enabledな地域について、デフォルトではその地域の行政区を `controllerWardId` として設定してよい。
- 補給拠点について、ホーム設定が存在する既存データはPreview用初期所有者へ変換してよい。
- 初期ユニット設定からPreviewUnitを生成する。
- 中立補給拠点は `supplyCenterOwnerWardId = null`。
- disabled地域はPreviewに含めない。

これはあくまで表示テスト用の初期化であり、
実ゲームの開始処理として実装しないでください。

将来、11人未満で無所属区をランダム化する処理とは分離してください。

---

# 6. 現在支配勢力による色分け

ゲームプレビューでは、行政区の「元の所属」ではなく、
`controllerWardId` を主たる色分けとして使用してください。

見分け方:

- 通常支配地域: controllerの勢力色を淡く塗る
- 補給拠点地域: 同じ勢力色をより濃くする、内側リングを付ける、または明確なSC記号を併用
- 中立/未支配: 中立色
- ユニット: ownerWardIdの色で表示

SCかどうかを色だけで判別させないでください。
記号・枠・badge等でも識別できるようにしてください。

編集モードでは従来の行政区色分けを残して構いません。
「編集モード」と「ゲームプレビュー」を分離してください。

---

# 7. Preview状態を簡単に変更できる開発用UI

Phase 1.5の表示確認のため、選択地域のPreview状態を開発用UIから変更できるようにしてください。

最低限:

- controllerWardIdを変更
- supplyCenterOwnerWardIdを変更
- PreviewUnitを配置/削除
- ユニットownerWardIdを指定

これは正式ゲームUIではありません。

「この地域をA勢力が占領したらどう見えるか」
「SCはB所有だが地域controllerはCの場合どう見えるか」
を確認するためのものです。

Previewデータはブラウザ内保存またはJSON export/importができれば望ましいですが、
Phase 1.5を大きくしすぎる場合はexport/importは任意です。

---

# 8. Phase 1.5ではゲームルールを実装しない

以下はSPECへ記録するだけで、今回コードとして処理しないでください。

- 補給拠点は春・秋の移動+退却終了後に所有権更新
- 15補給拠点で勝利
- 規定年数終了時の最多補給拠点勝利
- 脱落が発生した年を最終年とする
- 脱落判定は冬清算後
- 補給拠点0で脱落
- 現在支配する非補給地域0でも脱落（仮ルール）
- 撤退は本家準拠
- 撤退中は交渉禁止
- Build / Disband

Phase 1.5は表示基盤のみです。

---

# 9. homeWardIdについて

既存データ互換のため削除しないでください。

ただし現在のゲームデザインでは「ホーム領域」という概念を使用しません。

そのためPhase 1.5では:

- homeWardIdをgame previewの色分けに使わない
- 詳細編集画面の主項目から外す/折りたたむ等、誤解しにくくする
- schema上はoptional/legacyとして保持
- READMEに「現在はゲームルールでは未使用」と明記

冬のBuild場所ルールは未確定です。
そのため、homeWardIdの完全削除またはbuild専用フィールドへのmigrationは今回行わないでください。

---

# 10. テスト

既存Phase 1テストをすべて維持してください。

さらに最低限以下を追加してください。

- displayAnchorがPolygon内部に入る
- 凹型Polygonでcentroidが不適切でもdisplayAnchorが内部になる
- MultiPolygonのdisplayAnchorが決定的
- displayAnchorOverrideの保存/読込
- 範囲外overrideの検証
- GameStatePreviewのruntime validation
- controller色がMapDefinitionのward色ではなくPreview stateを参照する
- unitとSCが同一regionにある場合に両方描画される
- 既存kyoto-urban-config.jsonが引き続き読み込める
- 既存MapDefinition生成・Phase 1機能が壊れていない

可能ならPlaywrightで:
- 編集モード→ゲームプレビュー切替
- controller変更
- unit配置
- SC+unit表示
- zoom/pan後も表示が地域に追従
を確認してください。

---

# 11. README更新

日本語READMEへPhase 1.5の使い方を追加してください。

追加内容:

- 編集モードとゲームプレビューの違い
- 色が「現在支配勢力」を表すこと
- 補給拠点の見分け方
- ユニット表示の見方
- displayAnchor自動配置
- displayAnchor手動修正方法
- Preview状態の変更方法
- homeWardIdは現ルールでは未使用で互換用として残っていること

既存のPhase 1操作説明は削除しないでください。

---

# 12. 完了前チェック

必ず以下を実行してください。

- `npm.cmd run lint`
- `npm.cmd run typecheck`
- `npm.cmd run test`
- `npm.cmd run build`
- 既存Playwrightがある場合 `npm.cmd run test:browser`

失敗があれば修正してください。

---

# 13. 完了報告

日本語で以下を報告してください。

1. SPECへ反映した変更
2. 実装したPhase 1.5機能
3. 作成・変更した主要ファイル
4. displayAnchorのアルゴリズム
5. GameStatePreviewの型
6. 色分け・ユニット・SCの表示仕様
7. 後方互換性の対応
8. 実行したテストと結果
9. 私がブラウザで確認する手順
10. 未実装事項
11. ゲームデザイン上、次に確認が必要な事項

Phase 2には進まないでください。
