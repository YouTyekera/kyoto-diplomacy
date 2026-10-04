# Codex Phase 5A.1 緊急修正プロンプト
## Online MapConfig読込が空設定になる不具合 + SC/Armyマーカー重なり

Phase 5AのUI作業を進める前に、この不具合を優先して修正してください。

最初に以下を全文確認してください。

1. `spec.md`
2. `docs/PHASE4B_REPORT.md`
3. `PHASE5A_DECISIONS.md`
4. `PHASE5A_1_DECISIONS.md`
5. Online scenario upload関連コード
6. Editor MapConfig load関連コード
7. MapCanvas / SC / Army marker関連コード

`PHASE5A_1_DECISIONS.md` を最新差分としてspecへ反映してください。

# A. Online scenario loadの根本原因を特定する

ユーザーの実ファイルではEditor読込は成功するのに、
Online Lobbyでは採用0 / SC0 / 軍0になります。

今回の実MapConfig fixtureをrepo test fixtureへコピーして使用してください。
期待値:
- all region records: 227
- enabled: 190
- SC: 72
- starting units: 59

まず変更前に再現テストを追加し、
**必ずテストが失敗することを確認してから修正**してください。

調査する経路:
1. `<input type=file>`
2. client JSON parse
3. socket/request payload
4. shared runtime schema
5. server handler
6. room-manager
7. scenario compile helper
8. compileMapDefinition
9. preflight input
10. public scenario summary

各段階でfixtureの:
- Object.keys(config.regions).length
- enabled count
- SC count
- starting unit count
をテストまたは一時diagnosticで確認してください。

consoleへ227region JSON全文を出さない。

# B. default blank configへの誤fallbackを禁止

Phase 4B報告上、repoの京都初期設定は
「全227地域未採用・SC0・軍0」です。

Online upload時に、
upload configがvalidなのにdefault configへfallbackしてはいけません。

以下のようなコードがあれば修正:
- `uploadedConfig ?? defaultConfig` が意図せずdefaultになる
- payload field名不一致
- Zod parse後にregionsがstripされる
- compile関数へdefault configを渡している
- scenario idからdisk defaultを再読込してupload値を捨てている
- server cacheがmapIdだけでkeyされ、古いblank compileを再利用している
- room scenario replace前後でblank summaryを参照している

原因をREPORTに具体的に書いてください。

# C. EditorとOnlineでschema/helperを共有

MapConfig parse/normalizeを別々に実装している場合、
可能な範囲で共通化してください。

重要field:
- version
- mapId
- regions
- enabled
- isSupplyCenter
- homeWardId
- startingUnit
- adjacency
- adjacencyAdd
- adjacencyRemove
- obstacles

Editorで成功した正規MapConfigをOnline側が別解釈してはいけません。

# D. Server authoritative compileは維持

修正のためにclient MapDefinitionをそのまま正本にするのは禁止。

正しいflow:
uploaded MapConfig
+ server-side Kyoto Dataset
-> compile
-> validate
-> preflight
-> room scenario

です。

# E. Upload consistency guard

client側raw MapConfigの簡易count:
- enabled
- SC
- starting units

をupload request metadataとして送ってよい。

Serverはcompile後countと比較し、
今回のように `190 -> 0` など大きく不一致ならscenario replaceせず、
diagnostic errorを返してください。

これはセキュリティ判断ではなくbug検知用。
server compiled resultが正本。

# F. Lobby display

load success時:
- 採用地域 190
- SC 72
- 初期軍 59
のようなsummaryを見える位置に表示。

load failure時:
「JSONは読み取れましたが、サーバーコンパイル結果が一致しません」
等、stageを分けたmessageを出す。

# G. SC marker geometry修正

画像の問題:
ArmyがSC上にいる時だけSC円が大きく見える。

修正:
- SupplyCenterMarkerをArmy有無から独立
- same zoom => exact same radius/diameter/stroke
- Army markerの外周背景としてSCを拡大しない
- SCはregion anchor中心
- Army pinのbottom tip/baseがSC circle内部へ入るようにvertical offset
- Army bodyはSCの上へ立つ

DOM/SVG layer order:
1. region
2. SC
3. Army
4. hover/interaction overlays（必要に応じて）

Armyがある時にSC circleを別component/large ringへ差し替えない。

# H. Marker test

unitなしSCとunitありSCを並べたfixtureを作り、
computed SVG attributesで:
- r
- stroke-width
が一致することをtest。

Army pinのbase pointが
`distance(basePoint, scCenter) <= scRadius`
を満たすgeometry unit testか同等のtestを追加。

Playwright screenshot:
- unitなしSC
- unitありSC
を同一viewport/zoomで比較できるfixture。

# I. Completion

必ず:
```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
npm.cmd run test:browser
npm.cmd run map:validate
```

実ブラウザでも:
1. Online room作成
2. 実京都MapConfig fixture upload
3. summaryが190/72/59
4. Error「採用地域0」が出ない
5. map表示
6. ArmyありSC/ArmyなしSCの円が同サイズ

を確認してください。

# J. Report

`docs/PHASE5A_1_REPORT.md` を作成し:

1. 根本原因
2. なぜEditorは成功しOnlineだけ失敗したか
3. 修正したdata flow
4. fixture counts 190/72/59
5. scenario atomic replacement
6. SC marker geometry
7. Army/SC layering
8. tests/results
9. manual verification

を日本語で報告してください。

この修正後に停止してください。
Phase 5A本体のUI/BGM作業へは自動で進まないでください。
