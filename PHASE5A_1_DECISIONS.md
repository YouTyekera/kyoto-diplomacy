# Phase 5A.1 仕様差分 — Onlineシナリオ読込修正・SC/軍マーカー重なり修正

Status: 緊急修正
Date: 2026-10-03

この文書はPhase 5A UI/UX整理に対する優先修正である。
ゲームルール自体は変更しない。

## 1. Onlineシナリオ読込不具合

ユーザーが地図エディタで正常に読み込めるMapConfig JSONを、Online Lobbyの
「京都シナリオJSONを読み込む」から読み込むと、以下のような0件判定になる。

- 採用された侵入可能地域がありません
- 補給拠点がありません
- 初期軍がありません
- 全11区について採用地域/初期所有SC/初期軍が0

一方、同じJSONを地図エディタで読み込むと正しい状態になる。

対象JSON `kyoto-urban-config(3).json` は実際には:
- 227 region records
- enabled 190
- enabled Supply Center 72
- enabled starting army 59
を持つ。

したがって、JSON自体を「空設定」と扱ってはいけない。

Phase 4B仕様上、Onlineは
client parse -> serverへMapConfig送信 -> server側runtime validation -> server Datasetとcompile
を行うはずである。

今回のエラー内容は、Server側preflight/compileがアップロードMapConfigではなく
repo標準の「全227地域未採用・SC0・軍0」の初期MapConfigを参照しているか、
upload payloadのregions等がcompile前に失われている症状と整合する。

Codexは推測で直さず、request payloadからcompile引数まで値を追跡して根本原因を確定する。

## 2. シナリオ読込の正しい成功条件

アップロードされたMapConfigをserverが受信したら:

1. raw JSON parse
2. MapConfig schema validation
3. uploadされたMapConfigそのものをcompile inputとして使用
4. dataset source geometryをserver側で結合
5. MapDefinition compile
6. preflight
7. 成功した場合だけroom scenarioをatomic replace

とする。

repo既定MapConfigをcompile inputに混ぜない。

Datasetはserver正本を使ってよいが、
設定値 `regions / adjacency / adjacencyAdd / adjacencyRemove / obstacles` は
uploadされたMapConfigから使用する。

## 3. 読込結果の整合性表示

Online Lobbyでscenario load成功時に必ず:

- Enabled regions
- Supply Centers
- Starting units
- Scenario hash

を表示する。

client側でupload直後に算出したraw MapConfigの単純集計と、
server compile後summaryが大きく食い違う場合は成功扱いにせず、
「アップロード設定とサーバーコンパイル結果が一致しません」と診断する。

最低限今回のfixtureでは:
- enabled 190
- SC 72
- initial units 59

となること。

## 4. 失敗時のatomicity

scenario upload失敗時:
- 既存room scenarioを上書きしない
- default blank scenarioへ戻さない
- Hostへvalidation issueを表示
- server logへrequest id / stage / countsを出す
- JSON全文をconsoleへ出さない

## 5. 地図エディタとOnlineのMapConfig schema共有

Editor用loaderとOnline uploadで、
MapConfigのfield解釈が別実装になっている場合は共通schema/helperへ統合する。

特に:
- regions
- enabled
- isSupplyCenter
- homeWardId
- startingUnit
- adjacency
- adjacencyAdd
- adjacencyRemove
- obstacles

を同じ意味で扱う。

同じMapConfig fileがEditorで通りOnlineで0件になる回帰を自動テストで防止する。

## 6. Supply Center markerの大きさ

現在、Supply CenterにArmyが存在する場合、
SC円がArmyなしのSCより大きく見える。

これを廃止する。

### 新方針

- SC markerの視覚サイズはArmyの有無に依存しない。
- 同じzoom levelなら、Armyあり/なしでSC円の直径・stroke幅を完全に同じにする。
- `hasUnit ? largerRadius : radius` のような分岐は禁止。
- SC markerとArmy markerは独立したlayer/componentとして描画する。

## 7. Army pinとSCの重なり

SC上にArmyがいる場合:

- SC円を背面に描画
- Army pinを前面に描画
- Army pinの下端/足の付け根/尖端がSC円の内側へ収まる位置に配置する
- SC円をArmy全体の外周haloとして巨大化しない
- Army pinの中心全体をSC円へ押し込まない
- 「ArmyがSC上に立っている」ように見えること

実装イメージ:
- region anchor = SC center
- SC circle center = region anchor
- Army pinのtip/base anchor = region anchor付近
- pin bodyはその上方向へ伸びる

ArmyなしSCとArmyありSCのSC circle geometryは同一。

## 8. Semantic zoom

既存semantic zoomがある場合、
zoomによるSC size変化自体は許可する。

ただし同一zoomにおいて、
Army有無によるサイズ差はゼロであること。

## 9. テスト

最低限:

### Scenario loader
- uploaded real MapConfig fixture has 190 enabled / 72 SC / 59 starting units
- Editor loaderとOnline loaderが同じMapConfigを同じ設定値として読む
- server compile receives uploaded regions map
- standard blank repo config does not replace uploaded config
- scenario load summary = 190 / 72 / 59
- upload failure preserves previous scenario
- obstacles/adjacency overridesも保持
- actual Kyoto config smoke test

### Marker
- SC without unit radius = SC with unit radius
- SC stroke width same
- Army+SC uses same SC component
- Army pin tip/base lies inside SC circle bounds
- Army layer is above SC layer
- no oversized ring/halo appears only when unit exists
- 1280x720 and common zoom levels screenshot regression

## 10. 今回変更しないもの

- Supply Centerルール
- Armyルール
- 地域anchor
- UI全体レイアウト
- BGM
- Discord Activity
- Public deployment
