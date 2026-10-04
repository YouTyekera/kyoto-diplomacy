# Phase 4A 仕様差分 — 公開イベント・装備・自転車・バリケード + dev:online起動確認修正

Status: Phase 4A 実装前の決定事項
Date: 2026-10-03

この文書は既存の `spec.md` と Phase 1.5 / 2A / 2B / 3A / 3B の決定事項に対する追加・変更である。
矛盾する場合、この文書を優先する。
Codexは実装開始前にこの内容を `spec.md` へ反映すること。

# 0. Phase 3B起動不具合を最初に修正する

Phase 3B後のWindows実機で、以下の症状が確認された。

- Viteは `http://127.0.0.1:5174/` でreadyログを出す。
- Online serverは `http://127.0.0.1:3001` で起動ログを出す。
- しかしwrapperが直後に「起動完了を確認できませんでした」と判断し、非0終了する。

イベント実装へ進む前にこのfalse negativeを修正する。

成功判定はログ文字列だけに依存せず、
- frontendの実HTTP応答
- backendのhealth HTTP応答
の双方が成功したことを正とする。

詳細はPhase 4A実装プロンプトに従う。

# 1. Phase 4Aの目的

公開ランダムイベントをSpring / Autumnの命令入力前に発生させ、
初心者へ「この季節に何を狙うか」という行動指針を与え、
同じ地図でも毎回異なる交渉・進軍経路を生む。

第1弾イベントは以下の4種類だけとする。

1. 自転車
2. バリケード
3. 道路工事
4. 臨時バス運行

イベントの結果は全プレイヤーへ公開する。
イベント内容の乱数はサーバー権威で生成し、GameSessionのRNG seedから決定的に再現可能にする。

# 2. イベント発生タイミング

イベントは各Spring / AutumnのOrders開始時、プレイヤーが命令を入力する前に生成・公開する。

順序:

1. 前季節の後処理完了
2. 新しいSpring / Autumn Ordersへ移行
3. その季節の公開イベント生成
4. 全員へイベント内容を公開
5. 外交
6. 命令入力・確定
7. 同時裁定
8. 必要ならRetreat
9. 装備pickup判定
10. SC Update
11. 次フェイズ

Winterには新規ランダムイベントを生成しない。

第1年Springからイベントを発生させる。

# 3. 1季節あたりのイベント数

初期仮設定:

- 3～5人: 1件
- 6～8人: 2件
- 9～11人: 3件

同一季節に同じイベント種類を2回選ばない。

4種類のイベント重みはPhase 4Aでは設定ファイル化し、初期値は同率とする。
試遊後に変更可能にする。

有効候補がないイベント種類は、その季節の抽選候補から除外し、残り種類から決定的に再抽選する。
無限rerollを作らない。

# 4. 季節ごとの有効隣接（Effective Adjacency）

通常のMapDefinition最終隣接を `baseAdjacency` とする。

Orders / Retreatのルール判定には、季節ごとに以下を反映した `effectiveAdjacency` を使用する。

baseAdjacency
- activeBarricadeEdges
- currentRoadworkEdges
+ currentTemporaryBusEdges

ただし:
- 重複edgeは正規化する。
- adjacencyは必ず対称。
- impassable / disabled regionは追加しない。
- UIの合法Move / Support / Retreat候補も同じeffectiveAdjacencyを使う。
- rules-coreの通常裁定ロジックそのものをイベント専用に複製せず、入力mapの隣接を差し替えて再利用する。

自転車の各1区間もeffectiveAdjacencyを使用する。

# 5. 装備の所有モデル

過去の「拾った軍が永続的に装備を保有する」案を変更する。

装備は **プレイヤー/勢力のインベントリ** に保有する。

- 地面の装備を拾った軍の所有勢力のinventoryへ追加する。
- 取得後は同じ勢力のどの自軍ユニットでも使用できる。
- ユニット間のtransfer命令は不要。
- 各装備はunique `equipmentId` を持つ。
- 1つのequipmentIdを同じ季節に複数ユニットへ同時割当してはならない。
- 使用時、その季節だけequipment instanceを特定unit/orderへreserveする。
- resolve完了後にreserveを解除する（消費された装備を除く）。

「装備使用軍が最終的に破壊されたら装備も消滅」という既存決定との整合のため:
- その季節にequipmentを使用しているunitがmovementでdislodgedされても、Retreat成功すれば装備はinventoryへ戻る。
- Retreat不能、Retreat競合、任意Disband等でそのunitが最終的に破壊された場合、その季節にそのunitへreserveされていたequipmentは失われる。
- 使用していないinventory装備は、他unitの破壊では失われない。

# 6. 地面の装備

装備イベントではGroundEquipmentをmap上に公開配置する。

最低限:
- equipmentId
- type
- regionId
- spawnedYear
- spawnedSeason

装備が誰にも拾われなければ、季節をまたいでその地域に残り続ける。

Phase 4AではGroundEquipmentに自然消滅期限を設けない。

同一regionに新規GroundEquipmentを重ねてspawnしない。

# 7. 装備出現地域

自転車 / バリケードのspawn候補:

必須:
- enabled / playable
- impassableではない
- 非SC地域
- event生成時点でunitがいない
- 既存GroundEquipmentがない

争奪を起こしやすくするため、以下の「前線候補」を優先する。

- 隣接region群に2つ以上の異なるactive勢力controllerが存在する
- またはneutral regionで、隣接region群に2つ以上のactive勢力controllerが存在する

前線候補が1件以上あればその中からseeded random。
なければ必須条件だけを満たす全候補へfallbackする。

spawn先は全員へ即時公開する。

# 8. 装備pickup

Movement + 必要なRetreatがすべて完了した後、SC Updateより前にpickupを判定する。

- GroundEquipmentのregionを最終的にunitが占有していれば、そのunitのowner勢力inventoryへ追加。
- Movementで到達したunitでもRetreatで到達したunitでも取得可能。
- pickup後GroundEquipmentはmapから削除。
- unitがいなければGroundEquipmentは残る。

同一regionに複数unitは存在できないためpickup競合は発生しない。

# 9. 自転車

自転車は永続装備。

## 9.1 使用上限

- 1プレイヤーにつき1移動季節に最大1unitだけBicycleMoveを使用できる。
- 複数の自転車equipment instanceを所有していても、1季節にBicycleMoveできるのは1unitのみ。
- そのBicycle equipment instanceをそのunitへreserveする。

## 9.2 命令

`BicycleMove(A -> B -> C)`

条件:
- A = unit開始region
- A-Bがその季節のeffectiveAdjacency
- B-Cがその季節のeffectiveAdjacency
- 直線でなくてよい
- 自転車移動unitはSupportを受けられない
- 自転車移動unit自身もSupportを行わない

## 9.3 第1段階

A -> Bを通常Ordersと同時に裁定する。

自転車Moveのattack strengthは基本1で、Supportを加算しない。

失敗:
- Aに残る
- 第2移動なし

成功:
- Bへ移動
- 第2移動資格を得る

## 9.4 第2段階

第1段階終了後、第1段階に成功した全BicycleMove unitの B -> C を同時に裁定する。

- 通常unitには第2行動なし
- Supportなし
- effectiveAdjacencyを使用
- 成功 => C
- 失敗 / standoff => B

第2段階用のtemporary map stateを作り、通常rules-coreの考え方を可能な限り再利用する。
第2段階を順番処理して先着順にしない。

## 9.5 自転車の消失

自転車は使用成功/失敗では消費しない。

ただし、その季節にBicycleMoveへ割当されたunitが最終的に破壊された場合、その自転車equipment instanceは消滅する。

# 10. バリケード

バリケードは1回使用すると消費される装備。

## 10.1 使用上限

- 1プレイヤーにつき1移動季節に最大1unitだけ `DeployBarricade` を命令できる。
- inventoryに複数のバリケードがあっても、同一季節に2軍へDeployBarricadeを出してはならない。
- 1つのequipmentIdを複数unitへ割当することも禁止。
- 自転車使用とバリケード使用は別枠。同じプレイヤーが同じ季節に、別unitでBicycleMoveを1件、DeployBarricadeを1件行うことは許可する。
- 1unitが同じ季節に複数の命令を持つことは当然禁止。

## 10.2 命令

`DeployBarricade(unitId, targetRegionId, equipmentId)`

- unitの現在region Aとtarget Bが **baseAdjacency上の恒久的隣接** であること。
- Temporary Busだけで成立したedgeには設置不可。
- すでにactive barricadeがあるedgeには設置不可。
- Bはplayableでimpassableではない。

unitはその季節、移動せずその場に留まる。
裁定上は防御に関してHold相当として扱う。
- Support Holdを受けられる。
- 自身はMove / Supportを行わない。

## 10.3 設置成功

Movement adjudication後、そのunitがdislodgedされていなければ設置成功。

- バリケードequipmentをinventoryから消費。
- barricade edgeをpersistent event stateへ追加。
- **現在の季節には影響しない。次のSpring/Autumn Orders開始時から有効化。**

unitがdislodgedされた場合:
- 設置失敗。
- まだ消費しない。
- Retreat成功ならinventoryへ戻る。
- 最終的にunitが破壊された場合、そのreserve中のバリケードも消滅。

## 10.4 期間

「2年」を4回の移動季節として定義する。

有効化された次のOrders phaseから数えて:
1. season 1
2. season 2
3. season 3
4. season 4

の4移動季節でedgeを封鎖する。

各Orders + 直後のRetreatまで効果を持つ。
4回目のRetreat終了後にexpireし、次のOrdersでは通常隣接へ戻る。

UIに「残り4季 / 3季 / 2季 / 1季」を表示する。

## 10.5 効果

active barricade edgeはeffectiveAdjacencyから除外する。

そのedgeを越える:
- Move不可
- Support不可
- Retreat不可
- Bicycle第1/第2区間不可

## 10.6 孤立防止

新しいバリケードを追加した場合に、次の季節のbaseAdjacencyから
「その時点で次季節にも残るactive barricades + 新バリケード」
を除いたグラフが複数connected componentへ分断される場合、設置対象として選択不可。

つまりバリケードで唯一の出入口を塞ぎ、盤面を完全分断することを禁止する。

temporary Roadwork / Busはこの恒久的安全判定へ含めない。

# 11. 道路工事

道路工事は装備ではなく、公開される季節限定イベント。

## 11.1 発生

Spring / Autumn Orders開始時に、baseAdjacencyのedgeを1つ選ぶ。

候補:
- 両endpointがplayable
- active barricadeで既に閉鎖されていない
- 同季節の別Roadworkと重複しない
- そのedgeを除いても、その季節開始時のpersistent graphが分断されない

異なるcontroller同士の国境edgeを優先し、なければ全候補へfallback。

## 11.2 効果期間

そのOrders + 直後のRetreatだけ有効。
SC Update前に終了する。

## 11.3 効果

Roadwork edgeをeffectiveAdjacencyから除外。

- Move不可
- Support不可
- Retreat不可
- Bicycle不可

全員へイベント発生時に公開する。

# 12. 臨時バス運行

臨時バスは装備ではなく、季節限定の臨時隣接追加イベント。

## 12.1 候補pair

`baseAdjacency` 上で:
- 現在隣接していない
- playable / impassableでない
- base graph shortest path distance が2または3
- 同region不可

endpointのcontrollerが異なる、または片方neutralのpairを優先。
候補がなければ条件を満たす全pairへfallback。

active Roadwork / Barricadeによって一時的に距離が増えたことを理由に遠距離pairを選ばない。
候補距離はbaseAdjacencyで評価する。

## 12.2 効果期間

そのOrders + 直後のRetreatだけ。

## 12.3 効果

Bus pairをeffectiveAdjacencyへ追加。

- Move可
- Support可
- Retreat可
- Bicycleの1区間として利用可

同じpairを複数追加しない。

全員へイベント発生時に公開する。

# 13. イベント表示

Online Game / ローカル年間進行の双方で、現在季節の公開イベントを明確に表示する。

最低限:
- year / season
- event type
- 対象regionまたはedge/pair
- 効果
- 残り期間（バリケード）

地図上:
- Ground Bicycle / Barricade: 小さな装備marker
- Roadwork: 対象edgeに短い工事表示
- Bus: endpoint間に臨時路線線
- Active Barricade: edge上に封鎖表示 + 残り季節

他作品の画像をコピーせず、独自の単純SVG/CSSでよい。
UIの美術的完成度はPhase 4Aの主目的ではない。可読性優先。

# 14. 公開/秘密情報

以下は全員へ公開:
- 季節イベント
- GroundEquipment
- 各プレイヤーの装備inventoryの **種類と個数**
- active barricade
- remaining duration
- roadwork
- bus

秘密:
- 次Ordersでどのunitがどのequipmentを使うか
- BicycleMove経路
- DeployBarricade対象edge
は命令解決まで他プレイヤーへ公開しない。

# 15. 装備inventory UI

自分の画面:
- Bicycle xN
- Barricade xN
- 使用可能/今季reserve済み
を確認できる。

他プレイヤー:
- Bicycle xN
- Barricade xN
の公開個数だけ見える。
どのunitへ使用予定かは見えない。

# 16. RNGと再現性

既存OnlineGameSession seedからイベント用の決定的RNG streamを派生する。

- 同じGame seed
- 同じyear
- 同じseason
- 同じevent generation state

なら同じイベント結果。

GameSessionにevent RNG counter/stateを保存する。

Math.randomへ直接依存しない。

# 17. Phase 4A対象外

- Discord Activity
- Steam
- event追加種類
- timer
- server restart永続化
- 観戦
- inventoryの他プレイヤーへの譲渡
- player間取引
- Equipment自然消滅

# 追加決定（2026-10-03・実装中のユーザー回答）

バリケード装備はゲーム全体で1個だけ出現する。地面に残っている、またはいずれかの勢力が所持している間、新しいバリケード装備は出現させない。この安全策により、複数勢力が同時にバリケード装備を所持・設置する状況を生成しない。

設置で消費した後の封鎖辺は持続効果として扱う。次の装備の出現は可能だが、設置の分断防止判定へ次季節にも残る既存の封鎖を含める。spec.md第24.6節へ反映済み。
