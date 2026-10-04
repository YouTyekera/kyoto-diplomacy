# Phase 1.5 完了報告

実施日: 2026-10-03（日本時間）

## 1. SPECへ反映した変更

実装前にリポジトリ直下の `spec.md`、`README.md`、`docs/PHASE1_REPORT.md`、`PHASE1_5_DECISIONS.md` を全文確認した。最初に決定事項を `spec.md` へ反映し、その後 `CODEX_PHASE1_5_PROMPT.md` の範囲を実装した。

- 春・秋とも移動と退却の終了後に補給拠点所有権を更新する。増減員は冬。
- 仮の15拠点勝利、所有権更新後の判定、規定年数時の最多拠点、冬清算後の脱落と最終年。タイブレークは未確定のまま。
- SCゼロ、または現在支配する非SC地域ゼロという脱落方針。後者は試遊で変更可能な仮ルール。
- ホーム領域をゲームルールへ使用しない。homeWardIdは互換用に保持し、冬のBuild場所は未確定。
- 現在支配、SC所有、ユニットの分離と現在支配色の表示。
- 本家準拠の撤退制限、撤退時の交渉禁止。外部Discordの強制ミュートを実装しない。
- 表示アンカー、SCと駒の分離、Preview、Phase 1.5完了時の停止。
- ユーザー指定の京都御苑の侵入不能扱い、滋野の南側を残す補正、京極側への適用、元geometryの保持、設定データによる境界管理。
- 追加回答に従い、公開地図からゲーム用境界案を用意し、画面で頂点を修正可能にする。

上記の季節進行・占領・勝利・脱落・撤退・増減員の処理は仕様記録のみ。ルールエンジンを実装していない。

## 2. 実装したPhase 1.5機能

- 障害物差し引き後の地域内部に、見やすい表示位置を自動生成。
- 採用地域を選び、地図クリックで表示位置を指定。設定保存・復元・自動位置への復帰。
- 領域外、境界上、穴・障害物内のoverrideを拒否。JSONからの不正指定は検証エラーにする。
- 勢力名と色を持つ盾型の陸軍駒、右上へ分離したSCバッジ、地名と内部点への指示線。
- 画面のピクセル寸法を使った近接マーカーの衝突回避、ズーム・パン追従、hover・選択連動。
- 編集モードとゲームプレビューの切替。支配、SC所有、ユニット所有を独立して編集。
- PreviewのJSON保存・読込とブラウザ内保存。静的設定と保存先を分離。
- homeWardIdの互換用折りたたみ表示。通常集計からホーム列を外し、旧レポートの値は保持。
- 御苑の境界案をGeoJSONへ保存。新規京都設定に適用し、既存設定向けの読み込みボタンも追加。
- 地図上の障害物作成、番号付き頂点の移動、末尾取消、自己交差検証、境界の保存・復元。
- 元KML、元GeoJSON geometryを保持し、playableGeometryだけへ障害物を差し引く。

採用範囲・拠点・ユニット配置は確定していない。初期設定は採用0、SC0、初期ユニット0を維持する。

## 3. 作成・変更した主要ファイル

| ファイル | 内容 |
| --- | --- |
| `spec.md` | 決定事項と御苑の指定を正本へ反映 |
| `packages/shared/model.ts` | アンカー・override、legacyフィールドの互換schema |
| `packages/shared/preview.ts` | Preview型、runtime validation、初期化・参照整理 |
| `packages/shared/display.ts` | 現在支配色・中立色・SCの濃淡 |
| `packages/map-core/anchors.ts` | polylabelによる内部点計算と内部判定 |
| `packages/map-core/compile.ts` | アンカー生成、override・侵入不能設定の検証 |
| `packages/map-core/phase1_5.test.ts` | Phase 1.5の13件の自動テスト |
| `apps/web/src/App.tsx` | モード切替、保存読込、表示位置と境界編集 |
| `apps/web/src/MapCanvas.tsx` | 駒・SC・指示線・境界頂点・現在支配色 |
| `apps/web/src/PreviewInspector.tsx` | Preview状態編集と客観的な件数表示 |
| `apps/web/src/marker-layout.ts` | 決定的な画面上の衝突回避 |
| `apps/web/src/style.css` | マーカー連動・Preview・境界編集の表示 |
| `data/maps/kyoto-urban/kyoto-gyoen-obstacle.geojson` | 公開地図を参照した境界案・出典・編集意図 |
| `data/maps/kyoto-urban/initial-config.json` | 未採用設定へ御苑障害物案を追加 |
| `data/generated/map-definition.json` / `validation-report.json` | 新形式の生成・検証結果 |
| `tests/browser/phase1_5.spec.ts` | Preview、位置修正、障害物作成、御苑編集の4シナリオ |
| `tests/browser/editor.spec.ts` | 旧ホーム項目の折りたたみ操作に対応 |
| `package.json` / `package-lock.json` | polylabelと型定義の追加 |
| `vite.config.ts` | NOTICEと依存ライセンスを本番配布物へ出力 |
| `playwright.config.ts` | 本番ビルド検証は別ポート5174を使用 |
| `README.md` / `NOTICE.md` | 日本語操作手順、境界参照元、ISC通知 |

`docs/PHASE1_REPORT.md` はPhase 1時点の記録として保持した。Dataset 00631は使用・復元していない。

## 4. displayAnchorのアルゴリズム

京都付近の局所メートル投影を使い、polylabelのpole of inaccessibility、すなわち外周・穴の境界から余裕のある内部点を求める。単純centroidへ依存しない。

MultiPolygonはTurfの面積で最大部分を優先し、同面積なら座標列を使って選択順を固定する。探索精度は通常0.5m、微小領域は0.01m、0.0001mで再試行する。逆投影後の点がplayableGeometryの厳密な内部にあることを確認する。完全消失した領域はnull。

計算はMapDefinition生成時に一度行い、WebではWorkerで実行する。描画とズームのたびにpolylabelを再計算しない。overrideも同じ内部判定で検証する。

polylabel 2.0.1のISCライセンスを確認し、NOTICEに通知全文を保持した。ビルドは `dist/NOTICE.md` と `dist/licenses.md` を出力する。

## 5. GameStatePreviewの型

```ts
type RegionControl = {
  regionId: string;
  controllerWardId: WardId | null;
  supplyCenterOwnerWardId: WardId | null;
};
type PreviewUnit = {
  unitId: string;
  ownerWardId: WardId;
  regionId: string;
  type: 'army';
};
type GameStatePreview = {
  regionControl: Record<string, RegionControl>;
  units: PreviewUnit[];
};
```

WardIdは11行政区のIDのunion。Zodで型、未知フィールド、勢力ID、キーとregionIdの一致、重複unitId、同一地域の複数ユニット、地域参照を検証する。読み込み時に静的地図と照合し、存在しない・除外・完全侵入不能の地域、非SCへのSC所有者指定を拒否する。

表示用初期化は採用・侵入可能地域だけを含み、行政区を初期controllerとする。旧homeWardIdは初期SC所有者への変換だけに利用し、初期ユニットからPreviewUnitを作る。中立SCはnull。マップ再計算でPreviewの編集済み支配・所有者を維持し、無効になった配置・参照を整理する。実ゲーム開始や無所属区の抽選ではない。

## 6. 色・ユニット・SC・御苑の表示

- 編集モード: 採用地域は元行政区色、除外は灰色。
- Preview: controllerWardIdで塗り、通常地域は淡く、SCは濃く、中立は灰色。
- ユニット: ownerWardIdの色と勢力名を持つ盾型の陸軍駒。
- SC: 色に加えてSC文字のバッジ。枠色はsupplyCenterOwnerWardId、中立は灰色。
- 同一地域の駒とSCは別位置に表示し、内部点と指示線で所属先を示す。マーカーの画面上の大きさを維持する。
- hover・選択で地域とマーカーを連動させる。SCの所有色は選択時も保持する。
- 障害物はズームしても一定の密度の斜線で表示する。

御苑案は[地理院タイル（標準地図）](https://maps.gsi.go.jp/development/ichiran.html)と[環境省御苑案内図](https://www.env.go.jp/garden/kyotogyoen/2_guide/map.html)を参照した。中立売御門付近を緯度35.0250の直線で東へ延長し、南側の滋野を通常地域として残す。北側を概略化し、滋野・京極の両方へ差し引く。これは実敷地全体の精密なトレースではなく、指定されたゲーム補正の境界案。全頂点と参照元を設定ファイルに保存し、コードに座標を埋め込んでいない。

御苑障害物は独立したregionではない。通常隣接とPreview地域へ登録せず、障害物内にアンカー・SC・ユニットを配置しない。移動・支援・退却・イベント出現の対象外という仕様は記録済みで、それらのルール処理自体は今回実装していない。

## 7. 後方互換性

- 設定・MapDefinitionのversionは1を維持。
- displayAnchorOverrideとdisplayAnchorはoptionalなのでPhase 1形式も読める。
- homeWardIdは保持し、省略した入力はnullとして読める。旧値を勝手に削除しない。
- 旧ブラウザ保存設定と読み込みJSONは御苑境界の有無も含めて保持する。御苑案の適用は専用ボタンで行える。
- homeWardIdを現在支配やルールへ参照しない。旧SC所有者への表示テスト用初期変換のみ。
- Previewは独立した型・保存キー・JSON。MapDefinitionへ現在状態を混入させない。
- Phase 1の全21件のテストとブラウザ3シナリオを維持。

## 8. チェックと結果

| チェック | 結果 |
| --- | --- |
| `npm.cmd run lint` | 成功 |
| `npm.cmd run typecheck` | 成功 |
| `npm.cmd run test` | 34件成功（既存21件 + 追加13件） |
| `npm.cmd run build` | 成功、NOTICE・licensesも生成 |
| `npm.cmd run test:browser` | Chromium 7シナリオ成功 |
| `E2E_PREVIEW=1` のブラウザテスト | 本番ビルドでも7シナリオ成功 |
| `npm.cmd run map:validate` | エラー0、初期設定のMapDefinitionを生成 |

自動テストは凹型のcentroid範囲外、穴・境界・微小領域、MultiPolygonの決定性、override往復と範囲外拒否、Previewのvalidation・初期化・独立性・中立状態保持、controller色、後方互換、近接表示、御苑の滋野・京極補正を検証した。公式227地域すべてのアンカーが障害物差し引き後形状の内部にあることと、元KMLのSHA-256も確認した。

初期設定の警告は、京極・滋野の意図した障害物交差、原本MultiPolygonの南大内・安井・砂川、採用地域未設定の計6件。採用0はゲーム範囲未確定のため維持している。

ブラウザではモード切替、独立した支配・SC所有・ユニット設定、駒とSCの非重複、hover、パン・ズーム追従、JSON往復と再読込復元、アンカー変更・範囲外拒否、障害物作成と頂点移動、御苑案の編集を確認した。画像は `test-results/phase1-5-preview.png` と `phase1-5-gyoen.png` に出力する。

ビルド時のZod内部の最適化コメント警告はViteがコメントを除去して正常に生成する。実行エラーではない。

## 9. ブラウザで確認する手順

1. リポジトリ直下で `npm.cmd run dev` を実行し、http://127.0.0.1:5173/ を開く。すでに起動していれば再読み込みする。
2. 「上京区」→「選択区を拡大」。旧保存設定で御苑がなければ「御苑のゲーム用境界案を読み込む」を押す。
3. 「滋野」を検索して採用し、斜線より南に通常地域が残ることを確認。「京極」も検索して補正を見る。
4. 障害物欄の「境界を編集」→「頂点Nを移動」→地図クリックで修正し、出典・編集意図を記録して確定する。
5. 採用地域で「補給拠点」をONにし、必要なら初期ユニットを設定する。
6. 「表示位置をこの地点に設定」→領域内部クリックで変更する。「表示位置を自動に戻す」で解除できる。
7. 「ゲームプレビュー」を押し、支配を中京区、SC所有を上京区、ユニットを左京区等へ変えて、3者が独立して表示されることを確認する。
8. マーカーをhover・選択し、ズームとパンを試す。指示線の内部点が所属地域に残ることを確認する。
9. 設定JSONとPreview JSONをそれぞれ保存・読込する。静的設定にPreview編集が混ざらないことを確認する。
10. 「検証」で問題を確認し、作業終了時にJSONを保存する。サーバー停止は起動ターミナルでCtrl + C。

詳しい起動・Phase 1の操作・復旧手順はREADMEを参照。

## 10. 未実装事項

- Move / Support / Retreat裁定、春秋の占領処理、Build / Disband。
- 勝利・脱落・終了判定、年・季節・フェイズ進行。
- オンライン同期、プレイヤー割当、無所属区抽選、秘密命令。
- イベント・装備・自転車、Discord連携。
- 穴付きPolygonやMultiPolygonの画面上の頂点編集（読み込みと差し引きは対応済み）。
- 御苑実敷地の精密なトレース。現在は指定された補正を持つ編集可能なゲーム用境界案。

## 11. 次に確認が必要なゲームデザイン

- 最終的な都市部の採用範囲。
- 補給拠点の配置・総数、初期ユニットの数・配置。
- 御苑境界案の画面上での確認と必要な修正。
- 冬のBuild可能地域。
- 規定年数の具体値、同数時の処理、終了時順位。
- 15拠点勝利と非SC支配ゼロ脱落の仮ルールの試遊調整。
- 原本または障害物差し引きで複数部分を持つ地域の最終的な扱い。
- 実ゲームでcontrollerをいつ・どう更新するかの詳細。

これらを独断で決めていない。**Phase 1.5で停止し、Phase 2へ進んでいない。**
