# Codex Phase 2B 実装プロンプト
## 年間進行・支配更新・Build/Disband・UI最終調整

作業開始前に以下を全文読んでください。

1. `spec.md`
2. `README.md`
3. `docs/PHASE1_REPORT.md`
4. `docs/PHASE1_5_REPORT.md` または `PHASE1_5_REPORT.md`
5. `docs/PHASE2A_REPORT.md` または `PHASE2A_REPORT.md`
6. `PHASE1_5_DECISIONS.md`
7. `PHASE2A_DECISIONS.md`
8. `PHASE2B_DECISIONS.md`

`PHASE2B_DECISIONS.md` が最新の仕様差分です。
既存仕様と矛盾する場合はこれを優先してください。

最初に `PHASE2B_DECISIONS.md` の内容を `spec.md` へ反映し、`spec.md` を正本として更新してください。

ゲームデザインはユーザーとChatGPTが行います。
仕様にないルールをCodexが独自に決定しないでください。

# 今回のゴール

Phase 2Bでは以下を実装します。

A. 年/季節/フェイズ進行
B. controller更新と春秋SC所有更新
C. 冬Build / Disband
D. 勝利・脱落・最終年の基本処理
E. UI調整（軍マーカーをピン型に変更、御苑を塗りつぶし表示）

Phase 2B完了後は停止してください。Phase 3には進まないでください。

# 1. Phase 2Aを壊さない

Phase 2Aで実装済みの:
- rules-core
- Hold / Move / Support / Retreat
- Rules Sandbox
- Preview
- 地図エディタ
を維持してください。

既存の設定JSON、Preview JSON、MapDefinition、御苑障害物編集は引き続き読めるようにしてください。

# 2. 年/季節/フェイズ進行

最低限のゲーム進行状態を導入してください。

例:
- year: number
- season: 'spring' | 'autumn' | 'winter'
- phase: 'orders' | 'retreats' | 'sc-update' | 'adjustments' | 'finished'

推奨シーケンス:
1. Spring Orders
2. Spring Retreats
3. Spring SC Update
4. Autumn Orders
5. Autumn Retreats
6. Autumn SC Update
7. Winter Adjustments
8. End-of-Year / Elimination Check
9. next year Spring

UIから「次へ進む」で段階的に進められるようにしてください。
ローカル専用で構いません。オンライン同期は不要です。

# 3. controller更新

既定:
- unitが地域へ移動成功したら、その地域のcontrollerWardIdをその勢力へ更新する。
- その後にunitが去ってもcontrollerWardIdは維持する。
- retreat移動はcontrollerWardIdを変更しない。
- impassableにはcontrollerなし。

Rules Sandbox / game stateへこの概念を統合してください。

重要:
- Phase 2Aではcontroller自動更新をしていなかったので、今回追加する。
- 移動結果反映処理とcontroller更新処理を分離し、テストしやすくする。

# 4. 春秋のSC所有更新

各SC Updateフェイズで:
- SC地域について、その時点のcontrollerWardIdを確認し、
- controllerがnullでなければ、その勢力をsupplyCenterOwnerWardIdにする。
- controllerがnullなら既存仕様に従って中立SCはnull維持。

UIで更新前後を確認できるようにしてください。

# 5. 冬Build / Disband

## 5-1. 初期地点の定義

Phase 2Bでは、各勢力の `startingUnit` がシナリオ開始時に置かれていた地域集合を、その勢力の初期地点として扱います。

必要なら内部で:
- `homeBuildRegionIds`
を導出して保持してよいですが、既存JSONを壊さないでください。

## 5-2. Build条件

Build可能なのは:
- 自勢力の初期地点
- その地域がSC
- `supplyCenterOwnerWardId` が自勢力
- その地域にunitがいない

の全てを満たす地域のみ。

Build数:
- `ownedSCCount - currentUnitCount`
の正の差分。

unit typeはarmyのみ。

## 5-3. Disband条件

`currentUnitCount > ownedSCCount` のとき、差分だけ解散。

UIでは、どの軍を解散させるか選べるようにしてください。
独自の自動選択ルールを追加しないでください。

必要数に満たないと冬を完了できないようにしてください。

## 5-4. UI

冬フェイズでは:
- Build可能数
- Build可能地点
- 必要Disband数
- 各勢力のSC数 / 軍数
を表示してください。

Build / Disbandの操作後に確定し、次年へ進めるようにしてください。

# 6. 勝利・脱落・最終年

## 6-1. 勝利

Spring SC Update または Autumn SC Update 後に、
ある勢力の `ownedSCCount >= 15` なら即勝利。

## 6-2. 脱落

冬のBuild/Disband後に判定:
- ownedSCCount == 0
- controllerしている非SC地域数 == 0

のいずれかで脱落。

## 6-3. 最終年

いずれかの勢力に脱落が出た年を最終年とする。

ただし規定年数と同点処理は未確定なので、
Phase 2Bでは:
- 設定値として空欄/placeholderにする
- またはTODO表示にする
に留め、独自決定しないでください。

もし15SC勝利がないまま最終年を迎えた場合、簡易的に
「この年で終了対象」
と表示するところまでで構いません。
勝者確定の完全UIは簡易でよいです。

# 7. ユニット表示の再変更（ピン型）

現在のArmy表示を、より分かりやすいピン型マーカーへ変更してください。

要件:
- map pin / teardrop形状
- 独自SVGで実装
- 他作品アイコン画像を使わない
- 主色はownerWardId
- 内部にarmyを示す白い単純記号を置いてよい
- 「Aを丸で囲んだだけ」の表示にはしない
- 低ズームでも視認しやすい
- hover/selectedで詳細表示
- SCと同居しても読める

大きさはsemantic zoomに沿って調整してください。
Phase 2Aの「長い指示線を出さない」方針は維持します。

# 8. 御苑表示の改善

現在の障害物は、視覚的に「上から別ブロックが重なっている」ように見えやすい場合があります。

これを改善してください。

要件:
- 御苑障害物ポリゴンそのものを塗りつぶして表示する
- 斜線だけに依存しない
- 半透明塗り + 境界線 + 必要なら軽いハッチング程度
- 障害物形状に沿った表示であり、雑な矩形オーバーレイにしない
- 「障害物差し引き後」の地域形状と整合する

さらに、現在の読み込み障害物が標準御苑案と異なる場合は、UIで分かりやすい注意を出してよいです。
ただし既存設定を勝手に上書きしないでください。

# 9. Stateと保存

Phase 2Bで導入する年間進行のローカルゲーム状態は、
静的なMapDefinition / 設定JSON / Preview JSONと分離してください。

推奨:
- GameSessionState
- OrderPhaseState
- WinterAdjustmentState

必要ならゲーム状態のExport/Importを追加してもよいです。
ただし過剰に大きくなるならPhase 2Bでは任意です。

# 10. 自動テスト

既存テストを維持し、少なくとも以下を追加してください。

## controller / SC
- successful move updates controller
- controller persists after unit leaves
- retreat does not change controller
- spring SC update uses controller
- autumn SC update uses controller

## Build
- owned SC greater than units => build count
- build only on initial build points
- cannot build on occupied initial point
- cannot build on non-owned SC
- build creates army

## Disband
- units greater than SC => required disband count
- chosen disband removes selected units
- cannot finish winter with insufficient disbands

## Elimination / victory
- 15 SC triggers immediate victory at SC update
- zero SC after winter => eliminated
- zero non-SC controlled regions after winter => eliminated
- elimination marks final year

## UI / rendering
- unit marker is pin-like SVG, not old shield/rect marker
- SC still visible with unit
- obstacle fill is visible over the full御苑polygon
- no long leader lines reappear

Playwright等で:
- 年/フェイズ進行
- Build
- Disband
- 15SC勝利の簡易表示
- 御苑塗りつぶし表示
- ピン型unit表示
を確認してください。

# 11. README更新

READMEへ追加:
- 年/季節/フェイズ進行の説明
- controllerとSC所有の違い
- Spring/Autumn SC Update
- Winter Build/Disband
- 初期地点からのみBuildできること
- ピン型マーカーの見方
- 御苑の塗りつぶし表示
- 古い御苑設定を使っている場合の注意

既存のPhase 1 / 1.5 / 2A説明は必要に応じて更新してください。

# 12. 完了チェック

必ず実行:
```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
npm.cmd run test:browser
npm.cmd run map:validate
```

失敗があれば修正してから完了報告してください。

# 13. 完了報告

日本語で以下を報告してください。

1. SPECへ反映した内容
2. controller / SC更新の仕様
3. Build / Disband仕様
4. 勝利 / 脱落 / 最終年の実装
5. ピン型ユニット表示の仕様
6. 御苑表示の改善内容
7. 主要変更ファイル
8. テスト一覧と結果
9. ブラウザで確認する手順
10. 未実装事項
11. 次にゲームデザイン上確認が必要な事項

Phase 3には進まないでください。
