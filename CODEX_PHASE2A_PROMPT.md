# Codex Phase 2A 実装プロンプト
## Diplomacy裁定基盤 + 地図UI再調整 + 京都御苑修正

作業開始前に以下を全文読んでください。

1. `spec.md`
2. `README.md`
3. `docs/PHASE1_REPORT.md`
4. `docs/PHASE1_5_REPORT.md` または `PHASE1_5_REPORT.md`
5. `PHASE1_5_DECISIONS.md`
6. `PHASE2A_DECISIONS.md`

`PHASE2A_DECISIONS.md` が最新の仕様差分です。
既存仕様と矛盾する場合はこれを優先してください。

最初に `PHASE2A_DECISIONS.md` の内容を `spec.md` へ反映し、`spec.md` を正本として更新してください。

ゲームデザインはユーザーとChatGPTが行います。
仕様にないルールをCodexが独自に決定しないでください。

# 今回のゴール

Phase 2Aでは次の2本を同時に進めます。

A. Phase 1.5で悪化した盤面UIを修正し、実ゲームに向いた表示へ戻す  
B. Hold / Move / Support / Retreatまでの純粋なDiplomacy裁定エンジンを実装する

今回まだ実装しないもの:
- SC占領・controller更新
- 春秋の季節進行
- Build / Disband
- 勝利・脱落
- オンライン同期
- 公開イベント
- 装備・自転車
- Discord連携

Phase 2A完了後は停止してください。

# A. UI再調整

## A-1. Phase 1.5のglobal marker collision layoutを廃止/縮小

現状は近接マーカーの衝突回避により、勢力名入りユニットやSCが本来の地域から大きく離れ、長い指示線が地図全体を横切る場合があります。

この表示は本番盤面として不採用です。

実装方針:
- マーカーの基準は常にregionの `displayAnchor`。
- マーカーを他regionへ大きく押し出さない。
- global repulsion / global collision solverを通常表示では使用しない。
- 長いleader lineを通常表示から削除する。
- local offsetが必要でも小さく制限する。
- 所属地域の正確さを衝突回避より優先する。
- hover / selectedではregion輪郭とマーカーを同時に強調する。

既存 `marker-layout.ts` を削除・簡略化・用途限定してよい。
ただし既存テストを意味なく削除せず、新仕様に合わせて更新してください。

## A-2. Semantic zoom

全体表示時に情報過多にならないようにしてください。

低ズーム:
- 地域fill
- Army token
- SC円
のみを中心にする。

常時大きな「上京区」「北区」等の文字をユニットマーカーへ表示しない。

hover / selected / 高ズーム時:
- 勢力名
- region名
- unit詳細
をtooltipまたは詳細パネルで確認できる。

marker sizeは完全なscreen-fixed巨大サイズではなく、zoomに応じてclampしてください。

具体値はUI実装上の技術判断として調整し、README/完了報告へ記録してください。

## A-3. Army token

Phase 1.5の大型盾 + 勢力名の常時表示を、本番プレビューでは小型Army tokenへ置換してください。

- 色でownerWardIdを示す
- 中央に独自の簡単なarmy記号を表示してよい
- 著作物の他ゲームのユニット画像をコピーしない
- 勢力名はhover/selected/detailで表示
- selected unitは強調

編集モードの初期配置表示も可能なら同じ小型トークン系へ統一してください。

## A-4. Supply Centerを円形表示へ変更

現在の `SC` 文字入り角丸バッジを、本番プレビューでは使用しないでください。

Diplomacy盤で一般的な「小さな円形の補給拠点」を参考に、独自の円形SCマーカーを作ってください。

要件:
- 円形
- 明るい内部
- 濃い輪郭
- 小さくてもSCだと認識できる
- 中立SCも見える
- `supplyCenterOwnerWardId` がある場合は外周ringまたは小さい内側dotをowner色にする
- `controllerWardId` とSC所有者が異なる場合も区別できる

SCに文字 `"SC"` を常時書かなくてよい。
tooltipではSupply Centerであることを明示してください。

### Unit + SC同居
- unitはdisplayAnchor中心
- SCはその背後/近接位置
- 両方が見える
- region外へ追い出さない
- 長いlineを引かない

## A-5. UI回帰テスト

Playwright等で少なくとも:
1. 京都全体表示で長いマーカー指示線が大量に出ない
2. unit markerが所属regionから大きく離れない
3. SCが円として表示される
4. unit + SC同居が識別可能
5. zoom outでも勢力名ラベルが盤面を覆わない
6. hover/selectedで詳細が確認できる

を確認してください。

スクリーンショットも `test-results/phase2a-map-overview.png` 等へ出力してください。

# B. 京都御苑の修正

現在の `data/maps/kyoto-urban/kyoto-gyoen-obstacle.geojson` を更新してください。

ユーザー指定:
- 現在の御苑障害物の上辺と左右辺は基本的に維持
- **現在の下辺を南方向へ伸ばし、滋野regionの底（南端）まで通す**
- 実御苑の精密トレースではなくゲーム用の単純境界
- 後でユーザーが隣接overrideを使い、移動可能/不可を調整する

実装:
- 滋野のsource geometry / playable geometryを確認して南端を取得
- current obstacleの下側2頂点を滋野南端まで延ばす
- 単純な下辺を維持
- 設定GeoJSONに保存
- source/descriptionへ「ゲーム用境界であり実敷地の精密再現ではない」ことを記録
- 座標をReact/TSコードへハードコードしない
- existing obstacle editorから引き続き編集可能

この変更で滋野のplayableGeometryが複数部分になる場合:
- 自動で別regionへ分割しない
- 同一logical regionとして保持
- warningは表示してよい
- adjacencyを独自に補正しない

# C. Diplomacy rules-core

UI/networkから完全に独立したpure TypeScript moduleとして実装してください。

推奨:
- `packages/rules-core/`

型:
- Unit
- Order
- ValidatedOrder
- AdjudicationInput
- AdjudicationResult
- DislodgedUnit
- RetreatOption
- RetreatOrder
- RetreatResult

既存shared typesを適切に再利用してよい。

## C-1. Orders

最低限:
```ts
HoldOrder
MoveOrder
SupportHoldOrder
SupportMoveOrder
```

fleet/convoyは作らない。

Move:
- final adjacency上の隣接regionのみ

Support Hold:
- supporterがtarget unitのregionへ隣接していること

Support Move:
- supporterがsupported moveのdestinationへ隣接していること

他勢力unitへのsupportも可能。

## C-2. Validation

`validateOrderSet()` 等を作る。

検出:
- nonexistent unit
- duplicate order for one unit
- non-adjacent move
- illegal support destination
- self-reference等
- excluded/impassable destination
- mapに存在しないregion

不正命令を黙ってHoldへ変換しない。

未入力unit自動Holdは正式ルール未確定なのでrules-coreへ埋め込まない。

Sandbox上では明示的な「未入力をHoldにする」helperは許可する。

## C-3. Adjudication

本家Diplomacyの陸軍ルールに準拠して正確に実装。

必須:
- Hold defense
- move attack
- support hold
- support move
- support cutting
- support cut exception
- standoff
- head-to-head
- equal strength bounce
- circular movement
- self-dislodgement禁止
- dislodgement
- successful move chains

単純な一回のstrength比較だけで済ませない。
依存関係を正しく解決すること。

既存のDiplomacy adjudicatorをコピーする場合はライセンスを確認する。
可能なら独自実装 + 公式ルール/DATC等を参考にテストケース化する。
外部test caseをそのまま大量転載しない。

## C-4. Result explanation

`AdjudicationResult` に盤面更新以外の説明情報を保持する。

例:
- each order status
- reason codes
- attackStrength
- defenseStrength
- effectiveSupports
- cutSupports
- standoffRegions
- dislodgedUnits
- attackerOrigin

reasonを文字列だけにせずenum/code + UI向け説明生成を分離するのが望ましい。

# D. Retreat rules

movement adjudication後にretreat phaseを生成する。

## D-1. Legal retreat destinations

dislodged unitごとに、final adjacencyから候補を計算。

除外:
- movement解決後に占有されているregion
- dislodgerが攻撃してきたorigin
- 同movement phaseにstandoffが発生したregion
- non-adjacent
- excluded/impassable

## D-2. Retreat submission

複数dislodged unitのretreatは同時入力。

- legal destinationへretreat
- Disband

複数unitが同じdestinationを選んだ場合:
- 競合unitを全てdisband

他のretreat選択は解決まで表示しない構造にする。

Phase 2A Sandboxでは同一ブラウザdebugでもよいが、
data modelは秘密同時入力に対応できるようにする。

## D-3. 撤退時交渉禁止

SPECへ既にある「撤退中は交渉禁止」を維持。

Sandbox/将来UI向けにretreat phaseへ
「撤退フェイズ中は交渉禁止」
という表示を入れてよい。

外部Discordのミュート制御は行わない。

# E. Rules Sandbox

正式ゲームではなく開発・確認用の「ルールサンドボックス」を追加してください。

既存Game Previewから起動できると望ましい。

機能:
1. Preview unitsを初期盤面としてrules-coreへ渡す
2. unit選択
3. Hold / Move / SupportをGUIで入力
4. legal targetだけ選択可能
5. order arrowsを表示
6. supportはmove arrowと区別した線
7. 「裁定」ボタン
8. adjudication結果を盤面に反映
9. result explanationを一覧表示
10. dislodged unitがいればretreat入力へ
11. simultaneous retreat resolve
12. 初期Previewへreset

注意:
- region controllerを自動更新しない
- SC ownerを自動更新しない
- season/yearを進めない
- victory/elimination処理をしない
- Build/Disbandしない

これはrules-coreのvisual test harnessです。

# F. 自動テスト

少なくとも以下のcaseを個別testにしてください。

### Movement
- uncontested move
- two equal units into same empty region => standoff
- stronger supported move wins
- hold with support survives
- unsupported move fails against supported hold
- head-to-head equal
- head-to-head supported winner
- 3-unit circular move succeeds where rules permit
- self-dislodgement is prohibited
- foreign unit can be supported

### Support
- valid support hold
- valid support move
- attack cuts support
- attack from province against which support is directed does not cut support where official rule says exception applies
- dislodged supporter support invalid
- illegal support rejected by validation

### Retreat
- legal retreat
- cannot retreat into occupied region
- cannot retreat to attacker's origin
- cannot retreat to standoff region
- two retreats to same region => both disband
- no legal retreat => disband

テストケース名にルール意図を明記してください。

可能ならproperty/invariant:
- one unit per region after resolution
- unit count changes only by retreat disband during Phase 2A
- adjudication is deterministic
- input object is not mutated

# G. README / SPEC更新

READMEへ追加:
- 新しい小型unit表示
- 円形SC表示
- semantic zoom
- rules sandboxの開き方
- orders入力方法
- adjudication
- retreat
- reset方法
- Phase 2AではSC/controller/seasonが進まないこと

SPECへ:
- PHASE2A_DECISIONSの全確定事項
- Phase 2A実装範囲
- 未確定事項を明記

# H. 完了チェック

必ず実行:
```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
npm.cmd run test:browser
```

既存Phase 1 / 1.5のテストも壊さないでください。

失敗したら修正してから報告。

# I. 完了報告

日本語で:
1. SPECへ反映した内容
2. UI改善内容
3. 御苑境界の変更内容
4. rules-core構成
5. 実装したDiplomacyルール
6. Retreatルール
7. Rules Sandboxの使い方
8. 主要変更ファイル
9. テスト一覧と結果
10. ブラウザで確認する手順
11. 未実装事項
12. Phase 2Bへ進む前にゲームデザイン上確認が必要な事項

を報告してください。

Phase 2Bへは進まないでください。
