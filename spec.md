# 京都市版 Diplomacy 開発仕様書
Version: 0.17-draft
Status: Phase 6C/7Aの実装・ローカル検証完了。Phase 7Aで停止。実Render公開は利用者側の手動操作が未実施。
Last updated: 2026-10-04

## 0. この文書の役割

この文書は、京都市版Diplomacyのゲーム仕様・技術方針の正本である。

ゲームデザインはユーザーとChatGPTで決定する。Codexは、その決定を実装する担当であり、ゲームデザイン上の未確定事項を独断で決定してはならない。

Codexが実装中に仕様上の判断を必要とした場合は、技術的に必要な判断とゲームデザイン上の判断を分けること。技術的な実装詳細は合理的に選択してよいが、ゲームルール、バランス、勝利条件、イベント効果、マップ範囲などを勝手に決めてはならない。

## 1. ゲーム概要

京都市を舞台にした、多人数オンライン同時命令型ストラテジーゲーム。

基本となる戦闘・移動・支援・退却・増減員の考え方はボードゲームDiplomacyの陸軍ルールを基礎とする。

独自要素:
- 京都市11行政区を最大11勢力として扱う。
- 京都市の国勢統計区をゲームの地域単位として利用する。
- 京都市全227国勢統計区を全て使うのではなく、都市部のみを採用する。
- 公開ランダムイベントを導入する。
- マップ上で装備を獲得できる。
- 装備により通常のDiplomacyには存在しない特殊行動が可能になる。
- プレイヤー数が11人未満の場合、参加者のいない行政区をランダムに発生させる。

目標は、Diplomacyの交渉・同時命令・支援・裏切りの面白さを残しつつ、初心者が「何をすればよいか分からない」「自分だけで確実に動かせる軍が少なすぎる」と感じにくいゲームにすることである。

## 2. 対応人数と勢力

正式開始人数は3～11人。2人以下は開始不可、12人目は参加不可。勢力は京都市の11行政区と対応する。

- 北区
- 上京区
- 左京区
- 中京区
- 東山区
- 山科区
- 下京区
- 南区
- 右京区
- 西京区
- 伏見区

### 2.1 11人未満の場合

参加人数がN人の場合、11-N個の行政区をゲーム開始時にランダムで「無所属区」とする。

無所属区:
- 地域自体は削除しない。
- 初期ユニットを配置しない。
- プレイヤーを割り当てない。
- 他勢力が通常通り侵入・占領できる。
- その区の補給拠点は中立状態で開始する。
- 既存のhomeWardIdは互換用データとして保持するが、現在支配領域やゲームルールには使用しない。

抽選は固定せず、ゲームごとにランダム。乱数seedを保存して再現可能にする。

希望1区を任意提出し、単独希望を優先、競合はseed付き抽選、残りをseed付きshuffleで割り当てる（第22節）。

## 3. 初期ユニット

各参加勢力の初期ユニット数は現在6～7体を想定するが、試遊で変更可能性が高い。コードに固定しない。

各勢力ごとの初期ユニット数と初期配置地域をマップ設定で変更可能にする。

ユニットは現時点では陸軍1種類のみ。通常ユニットの基本戦力は1。

初期ユニット配置地域・補給拠点の対応は未確定。Phase 2Bでは、シナリオ開始時にその勢力のstartingUnitが置かれていたregion集合を初期地点として保持し、冬のBuild場所の判定に使う。homeWardIdや元行政区をBuild規則へ流用しない。

## 4. 地図データの正本

原典は京都市公式オープンデータ:

「令和2年度国勢調査 国勢統計区・行政区の領域ポリゴンデータ（KMLファイル WGS84）」
Dataset ID: 00670
Copyright: 京都市
License: CC BY 4.0

Google Mapsは人間が位置関係を確認する参考に限る。ゲーム用ポリゴンの正本にはしない。

KML原本は加工せず保存し、変換後データと分離する。出典・ライセンス情報をリポジトリ内に残す。

## 5. 使用する国勢統計区

京都市全227国勢統計区は使用せず都市部に限定する。

明示済みの設計意図:
- 左京区: 「修学院第一」「松ヶ崎」付近を北側の目安とし、それより北の山間部は使用しない方針。
- 右京区: 「御室」「常盤野」「広沢」「嵐山」付近を北側の目安とし、それより北の山間部は使用しない方針。

ただし、この文章からCodexが採用・除外地域を推測して確定してはならない。

使用地域はマップ編集画面で人間が確認して選択し、includedRegionIds / excludedRegionIds 等の設定として保存する。他行政区も後から同様に除外可能にする。

## 6. KML変換と内部地図形式

Illustratorでゲーム領域を描き直さない。

パイプライン:
KML原本
→ GeoJSON等の内部地理データ
→ 都市部採用地域を選択
→ 障害物ポリゴンを差し引く
→ 隣接関係を自動生成
→ 手動overrideを適用
→ ゲーム用MapDefinition生成

### 6.1 地域ID

各国勢統計区に安定した一意IDを与える。地名だけに依存しない。行政区 + 国勢統計区番号等、決定的なIDとする。

保持対象:
- 行政区
- 国勢統計区番号
- 国勢統計区名
- 元KML識別情報
- 元ポリゴン
- 出典情報

## 7. 隣接関係の自動生成

隣接関係を原則手入力しない。

採用された2地域のポリゴンが一定以上の長さの境界を共有する場合に隣接候補とする。角の一点だけ接している場合は隣接としない。

KMLの微小な座標誤差を考慮し、許容値を設定可能にする。

最終的なゲーム上の隣接は、自動生成結果に以下のmanual overrideを適用したもの:
- adjacencyAdd
- adjacencyRemove

隣接関係は対称性を検証する。

## 8. 京都御苑

京都御苑は中立地域ではなく、完全な侵入不能障害物として扱う。

- 御苑そのものをregionとして通常の隣接グラフへ登録しない。
- ユニットの配置・移動・支援・退却・イベント出現・補給拠点設定の対象外とする。
- 上京区の国勢統計区「滋野」はゲーム用に補正する。Phase 2Aでは現在の御苑障害物の上辺・左右辺の基本形を維持し、下側2頂点を南へ延ばして滋野のsource geometryの南端まで通す。単純な下辺を優先し、Phase 1.5の中立売通付近で止める境界案を置き換える。
- 御苑は「滋野」だけでなく「京極」にもまたがるため、障害物ポリゴンを必要に応じて京極側にも適用する。
- 元のKML geometryは変更せず保持し、ゲーム用playableGeometryのみ障害物差し引き後の形状とする。

国勢統計区境界と御苑境界が一致しない可能性があるため、国勢統計区を丸ごと侵入不能にする方式へ固定しない。

特殊障害物Polygon/MultiPolygonレイヤーを用意し、御苑ポリゴンをゲーム地図から差し引ける構造とする。

障害物差し引きによって国勢統計区が複数の非連結ポリゴンに分断された場合、自動で黙って確定せず検証警告する。

必要に応じて後から:
- 同一論理地域のMultiPolygonとして維持
- ゲーム用に地域を分割
- 隣接overrideで補正
を選べる設計にする。

現実の敷地境界を完全再現することより、プレイヤーが理解しやすいゲーム用境界を優先してよい。採用した境界は出典・編集意図とともに設定データとして明示的に保存する。形状をコードへハードコードしない。具体的な頂点・入力データは設定で管理する。

公開地図を参照したゲーム用境界を設定GeoJSONとして用意し、画面で頂点を修正・保存できるようにする。Phase 2Aの延長もゲーム用で、実敷地の精密なトレースへ戻さない。分断しても同一logical regionのMultiPolygonとして保持し、自動で別regionへ分割しない。通行可否は後からユーザーがadjacencyAdd / adjacencyRemoveで調整する。形状からゲームデザイン上の追加隣接・削除隣接を独自に決めない。

Phase 2Bでは既存の障害物ポリゴンそのものを半透明の濃色で塗り、境界線と必要なら薄い斜線を加える。斜線だけに依存せず、playableGeometryの差し引き範囲と整合させる。別の矩形で近似しない。古いブラウザ保存設定・JSONを自動置換せず、標準案と異なる場合は軽い注意と明示的な読み込み操作を提供してよい。

## 9. 補給拠点

イオン・駅等の実在施設を補給拠点にする案は廃止。

補給拠点は国勢統計区という土地自体へ設定する。

地域データ例:
- isSupplyCenter
- homeWardId（互換用・正式開始時の初期SC所有メタデータ）

具体的な配置数・場所は未確定。マップ編集画面からON/OFFできるようにする。

以下を別概念として分離:
- その土地が補給拠点か
- 正式開始時のSC所有者メタデータ（既存homeWardId。ホーム領域ルールには未使用）
- 現在の補給拠点所有者
- 現在その土地を占有しているユニット

### 9.1 補給拠点の所有権更新

春・秋のそれぞれについて、移動フェイズと退却フェイズ終了後に補給拠点所有権を更新する。春にも占領が成立する。本家Diplomacyの秋だけの更新には限定しない。

Build / Disbandは引き続き冬に行う。春の占領直後の増員は行わない。Phase 1.5では所有権更新ロジックを実装せず、春秋のどちらにも対応できる状態データを分離する。

Phase 2Bでは春・秋の移動と撤退の終了後、各SCの現在controllerを所有者へ反映する。中立SCに誰も入っていなければnullのまま。軍が離れてもcontrollerが維持されるため、SC所有も維持されうる。冬にはSC所有数と軍数を比較する。

### 9.2 ホーム領域と後方互換性

ホーム領域・元々自分の行政区だった地域をゲームルールとして参照しない。ゲーム中の色分け・占領・撤退・脱落・勝利条件にhomeWardIdを使わない。

既存JSON互換のためhomeWardIdはoptional/legacyとして保持し、通常UIの主項目から外すか「互換用/将来検討」として扱う。Phase 2Bでも既存JSONを破壊せず、Build用の初期地点はstartingUnitから別に導出する。将来の初期地点と初期ユニット位置の分離は別フィールドで検討できる。

### 9.3 地域支配の更新

合法なMove成功時に移動先controllerWardIdを軍の所有勢力へ更新する。軍が出発しても元地域のcontrollerは維持し、他勢力の合法なMove成功で上書きする。Retreatだけではcontrollerを変更しない。京都御苑等の占領不能領域にcontrollerを持たせない。軍の位置反映と支配更新は分離してテスト可能にする。

## 10. 通常のDiplomacyルール

陸軍に関係する基本裁定を実装対象とする。

- Hold
- Move
- Support Hold
- Support Move
- 支援カットと例外
- スタンドオフ
- Head-to-head
- 循環移動
- 自軍の排除禁止
- Dislodgement
- Retreat
- Retreat先競合
- Retreat不能時の解散
- Supply Center所有権更新
- WinterのBuild / Disband

艦隊、海域、Convoy、沿岸仕様は現時点で対象外。

ルールエンジンはUI・ネットワークから分離し、自動テスト可能にする。

### 10.1 Phase 2Aの純粋裁定基盤

UI・ネットワークから独立したpure TypeScriptのrules-coreを実装する。対象はHold、Move、Support Hold、Support Move、支援成立・支援カットと例外、スタンドオフ、head-to-head、同戦力bounce、循環移動、成功移動の連鎖、自軍の自己排除禁止、dislodgement、retreat候補算出・同時解決・競合および退却不能時の解散。

Moveは最終adjacencyで隣接する採用・侵入可能regionのみ。Support Holdは対象ユニットのregionへ、Support Moveは支援対象Moveのdestinationへsupporterが隣接していること。他勢力への支援も可能。同一regionにユニットは最大1体。

validateOrderSet等で不存在ユニット、重複命令、未入力命令、非隣接Move、不正な支援先・自己参照、不存在region、除外/侵入不能先を明示的に報告する。不正命令や未入力を黙ってHoldへ変換しない。adjudicateは検証済み入力を処理するかエラーを返す。rules-coreの全軍命令必須を維持する。Phase 3Aのオンライン進行層では命令書確定時に自軍の未入力をHoldで補完する。Sandboxの明示的補助も維持する。

裁定結果は最終盤面に加え、命令別success/failとreason code、有効support、cutされたsupport、attack/defense strength、standoff regions、dislodged units、attacker origin、legal retreat destinationsを持つ。アニメーションは純粋な裁定結果から生成する。

Phase 2Aではfleet/sea/convoy/coast、冬のBuild / Disband、SC所有権更新、controller更新、春秋進行、勝利・脱落、オンライン同期、イベント・装備・自転車を実装しない。これらはPhase 2B以降。

### 10.2 Retreatの条件

最終adjacencyから候補を求め、移動解決後に占有されている地域、排除した攻撃者のorigin、その移動フェイズのstandoff地域、非隣接、不存在、除外/侵入不能地域を除く。色やhomeWardIdで独自に制限しない。

撤退命令はlegal destinationへのRetreatまたは撤退時のDisband。全dislodged unitの入力を同時に解決し、同じdestinationへの競合は関係ユニットをすべて解散する。退却不能も解散する。確定前の他ユニットの撤退選択を表示しないデータ構造とする。撤退中の交渉禁止を表示し、外部Discordの強制ミュートは行わない。

### 10.3 Phase 2Bの年間進行と冬清算

純粋な移動・撤退裁定を維持し、その外側にローカルの年/季節/フェイズ進行を導入する。順序はSpring Orders → Spring Retreats → Spring SC Update → Autumn Orders → Autumn Retreats → Autumn SC Update → Winter Adjustments → Elimination Check / End-of-Year → 次年Spring。UIの「次へ進む」で段階的に確認する。オンライン同期・締切制御は行わない。

冬のBuild上限はmax(0, 保有SC数 − 自軍数)。場所は自勢力のシナリオ初期地点であり、SCであり、現在自勢力がSCを所有し、軍がいない地域に限定する。armyのみ増員する。homeWardIdではなく、シナリオ開始時のstartingUnitから初期地点集合を固定して保持する。

自軍数が保有SC数を超える場合は差分だけDisbandする。プレイヤー/デバッグUIで軍を選び、独自の強制自動選択を追加しない。必要解散数を満たさない限り冬を完了できない。各勢力のSC数・軍数・増員可能数/地点・必要解散数を表示し、操作を確定してから冬後の判定へ進む。

## 11. 命令入力

マップ上のクリック中心で入力する。

基本命令:
- Hold
- Move
- Support

退却・増減員も専用UIで行う。

Phase 3Aでは命令書確定時にサーバーが自軍の未入力をHoldで補完する。確定前に未入力数を明示する。rules-coreの未入力エラーとSandboxの明示的補助は維持する。

他プレイヤーの秘密命令を表示しない。他国との約束にシステム上の強制力を持たせない。

## 12. 公開ランダムイベント

イベントは全プレイヤーへ公開する。

目的:
- 初心者に行動指針を与える
- 毎回異なる争点を作る
- 交渉のきっかけを作る
- リプレイ性を上げる

基本イメージは、マップ上の特定地域に装備・物資等が公開状態で出現する形式。

Phase 4Aでは第1年から春・秋Orders開始時に公開イベントを生成する。3～5人1件、6～8人2件、9～11人3件。種類は自転車・バリケード・道路工事・臨時バスだけとし、冬には生成しない。装備取得は移動・撤退完了後、SC Update前に行う。詳細は第24節。

イベント乱数はサーバー側で生成しseedを記録する。イベントシステムはデータ駆動・拡張可能にする。

## 13. 装備システム

確定済み:
- 装備はマップイベント等から獲得できる。
- 装備は取得した軍の所有勢力のインベントリが保有し、同じ勢力のどの軍でも使用できる。
- 自転車は永続装備。
- ユニット間transferは不要。使用季節だけ装備instanceを軍へreserveし、最終破壊時の喪失と使用後の返却を第24節で規定する。

未確定:
- 全装備に同じ所有・譲渡ルールを適用するか
- 譲渡相手が自勢力だけか他勢力も含むか
- 譲渡タイミング
- 距離条件

データモデルは将来の譲渡を妨げないが、未確定ルールを実装しない。

## 14. 自転車

### 14.1 所有
- 勢力インベントリが所有し、BicycleMoveへ使用季節だけreserveする。
- 永続。使用しても消滅しない。
- ユニット間transferは不要。プレイヤー間譲渡・取引はPhase 4A対象外。

### 14.2 使用制限
1ターンにつき、1プレイヤーが自転車特殊移動に使えるユニットは最大1体。

同一プレイヤーが複数の自転車を保有しても、そのターンに特殊移動できるのは1ユニットのみ。

自転車装備ユニットは、特殊移動を使わないターンには通常のHold / Move / Support等を選べる。

### 14.3 自転車移動
`BicycleMove(A -> B -> C)`

- A: 開始地域
- B: Aに隣接する移動可能地域
- C: Bに隣接する移動可能地域
- 直線である必要はなく、曲がってよい。
- 自転車特殊移動を行うユニットは支援を受けられない。
- 自転車特殊移動中のユニットは他軍を支援しない。

### 14.4 第1移動
A→Bを通常の同時裁定の中で解決する。ただし自転車移動に支援は付与できず、基本戦力1。

失敗:
- Aに留まる。
- 第2移動は発生しない。

成功:
- Bへ移動。
- 第2移動資格を得る。

### 14.5 第2移動
第1移動後の盤面を基準に、成功した自転車ユニットのみB→Cを同時に試みる。

- 通常ユニットには第2行動を与えない。
- B→Cにも支援は付与できない。
- 成功すればCへ。
- スタンドオフ等で失敗すればBに留まる。Aには戻らない。
- 複数の自転車第2移動は同時裁定。

詳細エッジケースは通常裁定エンジン再利用を基本方針とし、実装前に専用テストケースを作る。

### 14.6 過去の未確定事項（Phase 4Aは第24節を優先）
- 出現頻度
- アイテム獲得判定の正確なタイミング
- 譲渡タイミング
- 他勢力への譲渡可否
- 譲渡距離条件
- Retreat中の扱い
- ユニット解散時の装備処理

Codexは独自決定しない。

## 15. 勝利・終了条件

以下の仮決定をPhase 2Bの実装対象へ進める。未確定の規定年数・同点処理・順位付けを独自決定しない。

1. オンラインでは開始時に固定するvictoryTargetSC = 15 + (11 − activePlayerCount)以上のSC所有で即勝利する。11人時と従来のローカル検証の基準は15。春または秋の補給拠点所有権更新後に判定する。
2. SC目標勝利が発生しない場合、規定年数終了時に補給拠点数が最多の勢力を勝者とする。
3. 同数時の処理は未確定。独自タイブレークを追加しない。
4. いずれかの勢力に脱落が発生した年を最終年とする。脱落は冬の清算後に判定し、その冬をもって年の終了判定を行う。

冬清算後、保有補給拠点0個（条件A）、または現在支配している非補給地域0個（条件B）のいずれかを満たす勢力を脱落とする方針。条件Bは影響が大きく試遊で変更する可能性のある仮ルール。現在支配とは元の行政区・ホーム領域ではなくcontrollerWardIdによる現在の支配を意味する。

規定年数の具体値は未確定で設定変更可能にする。終了時順位・同点処理も未確定。

Phase 2Bでは冬清算後の脱落判定と脱落年の最終年判定を実装する。15SC勝利なしで最終年に達した場合は「この年で終了対象」という簡易表示まででよい。規定年数は空欄/placeholderまたはTODOとして保持し、独自の年数・タイブレーク・順位規則を追加しない。

## 16. 外交

自由交渉。Discord等の外部VCを利用可能なので初期実装でゲーム内会議室は不要。

嘘、裏切り、秘密協定、非公式支援約束をシステムで禁止しない。

他プレイヤーの確定前命令や秘密情報を漏らさない。

撤退先の制限は本家Diplomacy準拠とし、「自分の色の地域にしか撤退できない」という独自制限は採用しない。撤退フェイズではプレイヤー同士の相談を禁止する。

将来の撤退UIは秘密・同時入力、交渉禁止の明示、確定前の他プレイヤーの撤退選択を非表示とする。外部Discord VCの会話を通常Webアプリで完全に阻止できないため、Discord強制ミュート等はPhase 1.5で実装しない。

## 17. Webゲーム技術方針

最初は通常のWebアプリ。

基本構成:
- TypeScript
- React
- Vite
- Node.js
- 将来のSocket.IO等リアルタイム通信を追加しやすい構造
- Vitest等の自動テスト

将来Discord Activityへ移植しやすくする。Steamは現時点対象外。

### 17.1 地図表示

外部地図タイルに依存せず、変換したGeoJSONをSVGへ投影して描画する構成を優先。

D3 geo等の地理投影ライブラリ、Turf等の地理演算ライブラリを利用してよい。

## 18. マップ設定・検証ツール

ユーザーがコードやJSONを大量手編集せず調整できる管理画面を作る。

最低限:
- 全国勢統計区表示
- 地域名・行政区表示
- 採用/除外
- 補給拠点ON/OFF
- 初期ユニット配置
- ホーム勢力表示（互換用/将来検討として折りたたむ）
- 地域内displayAnchorの自動配置と手動override
- 表示確認用GameState Preview（現在支配色、ユニットと補給拠点の区別）
- 自動隣接表示
- 隣接追加/削除override
- 障害物表示
- 地域詳細
- 設定JSON保存/読込

検証:
- 地域ID重複
- 存在しない参照
- 非対称隣接
- 点接触誤判定
- 孤立地域
- 連結成分
- 行政区ごとの使用地域数
- 行政区間接続箇所
- 地域ごとの隣接数
- 障害物による分断
- 初期ユニット重複
- 除外地域への初期配置
- 除外地域へのoverride
- 補給拠点数
- 勢力別初期ユニット数
- 勢力別ホーム補給拠点数（レポートの既存データ互換用）

バランスを自動採点しない。客観値だけ提供する。

## 19. MapDefinitionとGameStateの分離

MapDefinition:
- 地域形状
- 地域ID
- 行政区
- 採用/除外
- 隣接
- 障害物
- 補給拠点
- homeWardId（既存互換・正式開始時のSC所有メタデータのみ）
- 初期配置候補
- displayAnchor（playableGeometry内部の表示点）

GameState:
- 参加プレイヤー
- 無所属行政区
- 現在ユニット位置
- 現在ユニット所有者
- 現在補給拠点所有者
- controllerWardId（現在支配勢力。補給拠点所有者・ユニットとは別概念）
- 装備所有
- イベント
- 年/季節/フェイズ
- 秘密命令
- RNG seed

人数差で地図エンジンを書き換えない。

### 19.1 Phase 1.5の表示基盤

displayAnchorはplayableGeometry内部に置き、centroidだけに依存しない。凹型・穴・MultiPolygonに対応する決定的な内部点アルゴリズムを使う。MultiPolygonは最大面積部分を優先してよい。設定JSONにdisplayAnchorOverrideを保存でき、領域外・障害物内のoverrideを検証する。計算は地図生成時またはmemoized処理で行う。

GameStatePreviewではregionIdごとにcontrollerWardIdとsupplyCenterOwnerWardIdを別々に保持し、ユニットはunitId、ownerWardId、regionId、type: armyを持つ独立データとする。御苑等の障害物とdisabled地域を通常地域として含めない。

ゲームプレビューの地域色はcontrollerWardIdを参照する。同一controllerの通常地域と補給拠点は同じ勢力色・同じopacityで塗り、補給拠点は円形SC記号と所有者リングだけで区別し、中立/未支配は中立色、ユニットはownerWardIdの勢力色と小型Armyトークンで表示する。色だけに依存せず、同一地域のSCとユニットを同時に識別でき、hover/選択時に地域と表示が連動する。

Previewは表示確認専用で実ゲーム開始・占領処理ではない。初期Previewではenabled地域の行政区をcontrollerとしてよい。既存homeWardIdはPreview用初期SC所有者への変換に限り利用してよいが、その後の支配色・ルールには使わない。初期配置からPreviewUnitを生成し、中立SC所有者はnullとする。現在支配・SC所有者・ユニットの各勢力を開発用UIで独立に変更できるようにする。

### 19.2 Phase 2Aの盤面表示

マーカーの基準はdisplayAnchor。global collision avoidance / repulsionと長いleader lineを通常表示から廃止する。隣接regionをまたぐほど押し出さず、小さいlocal offsetだけ許可し、完全な非重複より地理的位置の正確さを優先する。

低ズームは地域色・小型Armyトークン・SC円を中心に表示し、勢力名を常時大きく表示しない。中ズーム以上またはhover/selectedで勢力名・地域名・unit詳細をtooltipやパネルで確認する。マーカー寸法はズームに応じて変え、min/maxをclampする。選択unitを強調する。

Armyは独自の単純な記号と所有勢力色を使い、大型盾を常用しない。SCは白系内部と濃い輪郭の小円にし、中立でも表示する。外周ringまたは内側dotでSC所有者を示す。controller色とは別。SC文字入り角丸badgeを通常表示に使わない。unit同居時はunitをanchor中心、SCは背後/下/ごく小さいoffsetで両方を示し、地域外へ追い出さず長いlineを引かない。

### 19.3 Rules Sandbox

Phase 2Aのローカル開発用Sandboxを実装する。MapDefinitionとPreview unitsから初期盤面を作り、unit選択、GUIで合法なHold / Move / Support入力、MoveとSupportで異なる線、裁定、盤面反映、理由一覧、dislodged unitの秘密入力と同時Retreat解決、初期Previewへのresetを提供する。

Phase 2AのSandboxはvisual test harnessとして保持できる。Phase 2Bでは同じ裁定基盤を使った年間進行のローカルゲーム状態を追加し、controller・SC更新・冬清算・基本の勝利/脱落判定を統合する。規定年数・同点処理・順位付け等の未確定事項はTODOのまま保持する。

### 19.4 Phase 2Bの表示とゲーム状態

軍は独自SVGのpin / teardrop形状へ変更する。所有勢力色を主色にし、内部の白い単純な陸軍記号は許可する。「Aを丸で囲んだだけ」の表示や他作品の画像コピーは使わない。低ズームで視認できるsemantic zoom、displayAnchor基準、長い指示線なしの方針を維持する。SCとの同居時もpinを主役とし、hover/選択で勢力・地域・命令内容を確認できる。

年間進行のGameSessionState等は静的MapDefinition・設定JSON・表示確認用Previewから分離する。ゲーム状態のExport/Importは任意。Phase 2Aの裁定・Sandbox・Preview・地図エディタ、既存JSONと御苑障害物編集を維持する。

Phase 2Bではcontroller更新、春秋SC更新、年/季節/フェイズ、冬Build/Disband、15SC勝利、冬後の脱落と最終年、簡易結果表示、pin表示、御苑塗りを実装する。fleet/sea/convoy/coast、オンライン同期、認証、締切、公開イベント、装備/自転車、Discord、同点処理の最終仕様、穴付き/MultiPolygonの高度な画面編集は対象外。

## 20. Codexの作業原則

- ゲームデザインを勝手に補完しない。
- 未確定事項はTODO/設定として残す。
- 段階ごとに停止する。
- 各段階でbuild、typecheck、testを実行する。
- エラーを放置しない。
- 変更内容を報告する。
- 初心者向けにWindows操作を具体的に説明する。
- 既存コード流用時はライセンス確認。
- 京都市KMLのCC BY 4.0 attributionを保持する。
- 複雑な裁定は自動テストを書く。

## 21. 初期開発ロードマップ

Phase 1: 地図基盤
- プロジェクト初期化
- KMLインポート
- GeoJSON変換
- 地図表示
- 採用/除外エディタ
- 隣接自動生成
- 隣接override
- 障害物
- マップ検証
- 設定保存

Phase 1.5: 表示アンカー、ユニット・補給拠点表示改善、現在支配色、GameState Preview、後方互換性。春秋所有権更新・勝利・脱落・撤退・増減員のルールは仕様記録のみでコード実装しない。完了したら停止する。

Phase 2A: 小型Army・円形SC・semantic zoom、長いマーカー線の廃止、御苑下辺の滋野南端への延長、純粋なHold / Move / Support / Retreat裁定基盤とローカルRules Sandbox。完了したら停止し、Phase 2Bへ進まない。
Phase 2B: controller/春秋SC更新、年/季節/フェイズ、初期地点SC限定の冬Build/手動Disband、15SC勝利・冬後脱落/最終年、独自pinと御苑塗り。完了したら停止し、Phase 3へ進まない。
Phase 3A: 3～11人オンライン、区割当・無所属区、正式初期化、人数別SC目標、秘密命令・自動Hold・提出状況、自動年間進行、再接続、hover/選択改善。完了後停止し、イベント・装備・Discord Activityへ進まない。
Phase 3B: 同一controllerのSC/非SC地域fill統一、開発起動の空きポート選択・日本語案内、START_ONLINE.cmd、README・回帰テスト。完了後停止し、イベント・装備・自転車・Discord Activityへ進まない。
Phase 4A: HTTPによる開発起動確認修正、公開4イベント、勢力インベントリ・pickup・reserve、自転車2段階同時移動、4季バリケード、有効隣接、オンラインとローカル年間UI。完了後停止し、Discord Activity等へ進まない。
Phase 4B: 保存済みシナリオのHost読込・11区Preflight、既定5年、共通終了/同率順位、Game Over、試遊ログと出力。完了後停止し、Discord Activity・UI polishへ進まない。
Phase 5A: プレイヤー向け入口・ロビー・招待・ゲームHUD・地図クリック命令・BGM・レスポンシブ。ゲームルールを変更せず、完了後停止。Discord Activity・公開デプロイへ進まない。
Phase 6: 試遊・調整

Discord Activity対応は通常Web版安定後の将来拡張。


## 22. Phase 3Aの確定差分

以下はPHASE3A_DECISIONS.mdを正本へ反映したもの。過去フェイズの対象外記述はその時点の記録であり、矛盾時は本節および最新の第24節を優先する。homeWardIdは正式初期SC所有者の生成だけに利用し、支配・Build・撤退・勝利・脱落へ流用しない。

### 22.1 Phase 3Aの目的

Phase 2Bまでのローカルゲームを、3～11人がブラウザから同じルームへ参加して遊べるサーバー権威型オンラインゲームへ拡張する。

Phase 3Aの中心:
- ルーム作成・参加
- 3～11人
- 行政区の割当
- 欠場区の中立化
- 秘密命令
- 提出状況の公開
- 全員提出時の自動裁定
- Retreat / Winterのオンライン同期
- 再接続
- 動的SC勝利目標
- 地域名hover
- 選択地域UIの改善

イベント・装備・自転車はまだ実装しない。

### 22.2 プレイヤー人数

正式なゲーム開始可能人数は3～11人。

- 2人以下では正式ゲームを開始できない。
- 12人以上は参加できない。
- 開発用fixtureやrules-core単体テストでは人数制限を適用しなくてよい。

参加人数を `activePlayerCount` とする。

### 22.3 行政区割当

京都市の11行政区を最大11勢力として利用する。

#### 22.3.1 基本はランダム

各プレイヤーは1つの任意の「希望区」を提出できる。

- 希望なしも可能。
- 希望は保証されない。
- Phase 3Aでは希望は1人1区まで。順位付き複数希望は将来拡張。
- 他プレイヤーの希望内容をロビーで公開する必要はない。

#### 22.3.2 割当アルゴリズム

サーバー側のRNG seedを用い、決定的に再現可能な割当を行う。

1. 希望区ごとに希望者をまとめる。
2. その区を希望したプレイヤーが1人だけなら、そのプレイヤーへ割り当てる。
3. 同じ区を複数人が希望した場合、その希望者の中からseed付き乱数で1人を選び、その区へ割り当てる。
4. 希望で割り当てられなかったプレイヤーと希望なしプレイヤーをseed付きでshuffleする。
5. 残りの未割当行政区もseed付きでshuffleし、1対1でランダム割当する。
6. 最後まで誰にも割り当てられなかった行政区を「無所属区」とする。

同じseed・同じ参加者・同じ希望入力からは同じ割当結果を再現できること。

#### 22.3.3 無所属区

11 - activePlayerCount 個の区が無所属になる。

無所属区:
- プレイヤーなし
- startingUnitなし
- その区に属するenabled regionの初期controllerはnull
- その区内のSCの初期ownerはnull
- 地域は通常通り侵入・支配可能
- mapから削除しない

### 22.4 正式ゲーム開始時の初期状態

#### 22.4.1 controller

プレイヤーが割り当てられた行政区について:
- その行政区に属するenabled regionの初期 `controllerWardId` をその行政区にする。

無所属区:
- 初期 `controllerWardId = null`

#### 22.4.2 SC所有者

SCの `homeWardId` は「ホーム領域」ルールには使用しないが、既存シナリオの初期SC所有者メタデータとしてPhase 3Aでは利用する。

- activeな区にあるSCで、`homeWardId` がその区なら、その区を初期ownerとする。
- `homeWardId = null` のSCは、active区内であっても中立開始。
- 無所属区のSCは `homeWardId` があっても中立開始。

将来は `initialSupplyOwnerWardId` のような専用フィールドへmigrationしてよいが、Phase 3Aで既存JSONを破壊しない。

#### 22.4.3 初期ユニット

- activeな区の `startingUnit.ownerWardId` に一致する初期軍だけを配置する。
- 無所属区の初期軍は配置しない。

### 22.5 動的なSC勝利目標

11人時の15SC勝利を基準に、参加人数が少ないほど無所属区のSCを獲得しやすくなるため勝利目標を上げる。

Phase 3Aの仮ルール:

`victoryTargetSC = 15 + (11 - activePlayerCount)`

すなわち:

- 11人: 15
- 10人: 16
- 9人: 17
- 8人: 18
- 7人: 19
- 6人: 20
- 5人: 21
- 4人: 22
- 3人: 23

これは試遊調整前の仮ルール。

実装では魔法数値へ散らさず、scenario/game settingsとして:
- `baseVictoryTargetSC = 15`
- `referencePlayerCount = 11`
- `missingPlayerSCBonus = 1`
を持つか、同等に設定変更可能な構造にする。

ゲーム開始時にtargetを計算してGameSessionへ固定保存する。
途中の切断や脱落でtargetを再計算しない。

### 22.6 ロビー

最低限:
- ルーム作成
- 短いroom code
- room codeで参加
- player nickname
- optional preferred ward
- 接続状態
- host表示
- 参加人数
- ゲーム開始

開始条件:
- 3～11人
- 全参加者が接続中
- nicknameが有効
- hostだけが開始可能

開始後は新規プレイヤーを参加させない。
観戦機能はPhase 3A対象外。

Hostがゲーム開始前に切断した場合、接続中の別プレイヤーへhostを移譲してよい。
ゲーム開始後は進行が自動のためhost固有権限を増やさない。

### 22.7 サーバー権威

ゲーム状態の唯一の正本はサーバー。

サーバーが保持:
- room
- players
- ward assignment
- inactive wards
- RNG seed
- GameSessionState
- orders
- ready/finalized status
- retreat submissions
- winter submissions
- victory target

クライアントだけで:
- 命令裁定
- ward割当
- SC更新
- controller更新
- victory/elimination
を確定しない。

既存 `rules-core` / `game-core` をサーバーから利用する。

### 22.8 秘密命令

各プレイヤーは自分のユニットの命令だけを編集できる。

他プレイヤーへ送信してよい情報:
- nickname
- assigned ward
- connected / disconnected
- orders status: editing / finalized / not-required
- eliminated status

送信してはいけない情報:
- 他プレイヤーのMove先
- Hold内容
- Support対象
- 未確定order
- finalized orderの詳細
- retreat先
- winter adjustment内容（解決前）

サーバー側でもroom broadcast payloadに秘密情報を混入させない。

### 22.9 自動Hold

Orders phaseで「命令書を確定」した時点で、そのプレイヤーの未入力ユニットへサーバーがHoldを補う。

- 確定前に「未入力N軍はHoldになります」とUIで明示する。
- プレイヤー自身には、補完されたHoldを含む最終提出内容を表示してよい。
- 他プレイヤーには詳細を見せない。
- rules-core自体の「全軍にOrderが必要」という厳密性は維持する。
- Auto Holdはonline orchestration層の機能として実装する。

### 22.10 提出状況と自動裁定

Civ系ゲームのターン待ち表示のように、全員の提出状況を公開する。

表示例:
- 入力中
- 確定済み
- 不要
- 切断
- 脱落

命令内容は表示しない。

### Orders
- 各生存プレイヤーが自分の命令書を確定する。
- 全てのrequired playerが確定した瞬間、サーバーが自動で裁定する。
- hostの裁定ボタンは不要。

### 確定解除
- 全員確定して自動裁定が始まる前なら、確定済みプレイヤーは「確定解除」できる。
- 最後のrequired playerが確定して裁定処理が開始された後は解除不可。
- 解除後は自分の命令を再編集できる。

### Retreat
- dislodged unitを持つプレイヤーだけrequired。
- requiredでないプレイヤーは「不要」。
- required全員の秘密入力が確定したら自動同時解決。
- 撤退中は交渉禁止表示を維持。

### Winter
- Build/Disbandで操作が必要なプレイヤーをrequiredとする。
- Build可能だが0体Buildを選ぶ場合も「冬調整を確定」が必要。
- 何も調整できず必要もないプレイヤーは「不要」。
- required全員確定後にサーバーが一括適用する。

### 22.11 結果の表示と次フェイズ

自動裁定後も直前の裁定結果をGameSession内に保持し、次フェイズ中に確認できるようにする。

Phase 3Aでは複雑な戦闘アニメーションは必須ではない。

少なくとも:
- 成功/失敗した移動
- support
- standoff
- dislodgement
- retreat
を結果ログ/盤面で確認できるようにする。

### 22.12 再接続

ブラウザ再読込や一時切断へ対応する。

- serverがplayerIdとランダムなreconnect tokenを発行
- clientはtokenをlocalStorage等へ保存
- 再接続時にroom code + playerId + tokenで同じplayerへ復帰
- tokenを他プレイヤーへbroadcastしない
- token不一致ならなりすまし復帰を拒否

切断中:
- ready statusを「切断」と表示
- 既にfinalized済みならその提出は保持
- 未finalizedならゲームはそのプレイヤーを待つ
- Phase 3Aではhostによる強制Hold/強制skipを実装しない

サーバープロセス自体が再起動した場合の永続復旧はPhase 3A対象外。

### 22.13 地域名hover表示

本番ゲーム画面を含む地図表示で、マウスカーソルをregion上へ置いたとき土地名を確認できるようにする。

要件:
- enabled/playable regionをhoverするとtooltip
- 主表示: 国勢統計区名 / 地域名
- 副表示: 行政区名
- tooltipはcursor付近だが地図操作を邪魔しない
- 画面端ではviewport内へ収める
- unitやSCの上にhoverしても、その下のregion名を確認できる
- hover中のregionを軽く強調
- mobile/touchではclick/select時の詳細表示で代替

編集モード、Preview、Sandbox、Online Gameで共通利用できるようにする。

### 22.14 選択地域の表示改善

現在のクリック選択時に出る太く大きな黒枠は廃止する。

新方針:
- region fillをわずかに明るく/半透明overlayで強調
- 1.5～2px程度の細いaccent stroke
- `vector-effect: non-scaling-stroke` 等でzoomしても極端に太くしない
- 真っ黒で太いoutlineを使わない
- 元のregion境界を隠さない
- selected marker/unitも軽いhalo等で連動して強調してよい

目的は「どこを選んだか分かる」ことであり、地図形状を覆うことではない。

### 22.15 技術方針

既存WebクライアントへNode.js + Socket.IO等のサーバーを追加する。

推奨:
- TypeScript
- Node.js
- Socket.IO
- existing rules-core
- existing game-core

サーバーとクライアント間のイベントpayloadを型定義・runtime validationする。

Phase 3AではDB導入は不要。
room stateはサーバーメモリ保持でよい。

本番ビルドで同一Nodeサーバーから静的frontendを配信できる構成が容易なら対応してよいが、開発時はVite + server別ポートでもよい。

### 22.16 Phase 3Aで実装しないもの

- 公開ランダムイベント
- 装備
- 自転車
- Discord Activity
- Steam
- spectator
- server再起動後のroom永続化
- chat / DM
- 強制skip / AFK timer
- turn timer
- 2人以下の正式ゲーム


## 23. Phase 3Bの確定差分

以下はPHASE3B_DECISIONS.mdを全文反映したもの。過去の濃淡方針を撤回する。起動確認等の矛盾時は最新の第24節を優先する。ゲームルール・シナリオは変更しない。

### 23.1 地域の塗り色

Phase 2B/3Aでは、通常地域とSupply Center地域を同一勢力内でも濃淡で区別していた。
実地図ではこの差が大きく、同じ勢力の支配領域が分断されて見えるため、この方針を撤回する。

### 新方針

- 地域のfillは `controllerWardId` のみによって決定する。
- 同一controllerであれば、Supply Centerか否かに関係なく同じfill色・同じopacityを使う。
- `isSupplyCenter` によってregion fillを濃く/薄くしない。
- Supply Centerの有無は円形SCマーカーだけで表現する。
- SC所有者はSCマーカーのring / inner markで `supplyCenterOwnerWardId` を表現する。
- `controllerWardId` と `supplyCenterOwnerWardId` が異なる場合も、region fillとSC ringの違いで判別できる。
- 中立/未支配regionは既存のneutral fillを使用する。
- hover/selectedによる一時的な強調は可。ただしSCだから恒常的に濃くしてはならない。

この方針は編集モード、Game Preview、Rules Sandbox、ローカル年間進行、オンライン対戦の「ゲーム状態表示」に共通適用する。
編集モードで採用/除外や静的設定を示すための別表現は維持してよい。

### 23.2 `dev:online` の起動エラー改善

現在 `npm.cmd run dev:online` は標準でWeb 5173 / Server 3001を使用する。
5173等が既に使用中の場合、Viteの低レベルエラーがそのまま表示され、初心者には原因と対処が分かりにくい。

#### 23.2.1 リポジトリ外からの実行

`npm.cmd run ...` はpackage.jsonのあるリポジトリ直下で実行する必要がある。
npm自体はリポジトリ外からpackage scriptを実行できないため、この制約は消せない。

READMEのオンライン起動手順の最初に、必ず以下を明示する。

```powershell
Set-Location "C:\Users\zikke\Documents\kyoto-diplomacy"
npm.cmd run dev:online
```

`C:\Windows\System32` などで実行した場合のENOENTは、「package.jsonがないため」であることを初心者向けに説明する。

#### 23.2.2 ワンクリック起動

リポジトリ直下にWindows用の起動ファイルを追加する。

例:
- `START_ONLINE.cmd`

要件:
- 自分自身が置かれているリポジトリ直下へ `cd /d "%~dp0"` する。
- `npm.cmd run dev:online` を実行する。
- エラー終了時は画面が閉じないようにする。
- Node/npmがない場合は分かりやすい日本語メッセージを出す。

これにより、ユーザーはExplorerから `START_ONLINE.cmd` をダブルクリックしても正しいworking directoryで起動できる。

#### 23.2.3 使用中ポートの扱い

`scripts/dev-online.mjs` を改善する。

環境変数でポートを明示指定していない場合:
- Web標準候補 5173 が使用中なら、5174, 5175... と順に空きポートを探索する。
- Server標準候補 3001 が使用中なら、3002, 3003... と順に空きポートを探索する。
- 十分な上限（例: +20）まで探索する。
- 選択した実ポートを子プロセス/Vite proxyへ正しく渡す。
- 起動成功時に、実際に開くURLを大きく分かりやすく表示する。

例:
`5173 は使用中のため、Webは http://127.0.0.1:5174/ で起動しました。`

環境変数 `WEB_PORT` / `ONLINE_PORT` をユーザーが明示指定した場合:
- そのポートを勝手に変更しない。
- 使用中ならfriendly errorを出して終了する。
- どのPowerShellで古いサーバーを止めるか、または別ポートを指定する例を表示する。

#### 23.2.4 ポート診断

任意だが推奨:
- 起動失敗時に `5173 is already in use` のstack traceだけを見せず、日本語の対処を出す。
- Windows向け確認例をREADMEに追加する。

```powershell
Get-NetTCPConnection -LocalPort 5173 -State Listen
```

プロセスを確認する例:
```powershell
Get-Process -Id (Get-NetTCPConnection -LocalPort 5173 -State Listen).OwningProcess
```

Codexがプロセスを勝手にkillしてはならない。
ユーザー自身が既存の開発サーバーPowerShellでCtrl+Cするのを第一選択とする。

### 23.3 既存5173開発サーバーとの共存

`npm.cmd run dev` がすでに5173で起動中でも、`dev:online` が自動で別のWebポートへfallbackできるようにする。

ただし、同じブラウザでどのURLを開くべきか混乱しないよう:
- terminalにONLINE GAME URLを明示
- page title / headerにも「ONLINE」モードと接続先を確認できる表示を入れてよい

### 23.4 回帰防止

以下をテストする。

- SC regionとnon-SC regionで同一controllerなら同じfill style
- SC marker自体は引き続き表示される
- SC owner ringは維持
- selected/hover highlightは維持
- dev-online port resolverが使用中標準ポートをskipする
- explicit WEB_PORT使用中なら勝手にfallbackしない
- chosen web/server portsがproxy/envへ一致して渡る

### 23.5 Phase 3Bの範囲

今回のPhase 3Bは、Phase 3Aのオンライン対戦基盤を安定して試遊するための小規模なUX/開発環境改善とする。

実装する:
- 地域fill統一
- `dev:online` 空きポート自動選択
- friendly startup messages
- START_ONLINE.cmd
- README改善
- 回帰テスト

実装しない:
- イベント
- 装備
- 自転車
- Discord Activity
- ターンタイマー
- ゲーム永続保存


## 24. Phase 4Aの確定差分（Phase 4Bは第25節を優先）

以下はPHASE4A_DECISIONS.mdを全文反映したもの。過去フェイズの対象外・所有モデル・未確定事項と矛盾する場合、本節を優先する。起動修正と検証を先に完了し、その後にイベント実装を行う。

### 24.0 Phase 3B起動不具合を最初に修正する

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

### 24.1 Phase 4Aの目的

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

### 24.2 イベント発生タイミング

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

### 24.3 1季節あたりのイベント数

初期仮設定:

- 3～5人: 1件
- 6～8人: 2件
- 9～11人: 3件

同一季節に同じイベント種類を2回選ばない。

4種類のイベント重みはPhase 4Aでは設定ファイル化し、初期値は同率とする。
試遊後に変更可能にする。

有効候補がないイベント種類は、その季節の抽選候補から除外し、残り種類から決定的に再抽選する。
無限rerollを作らない。

### 24.4 季節ごとの有効隣接（Effective Adjacency）

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

### 24.5 装備の所有モデル

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

### 24.6 地面の装備

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

追加決定（ユーザー回答）: バリケード装備はゲーム全体で1個だけ出現する。地面にバリケードがある、またはいずれかの勢力が所持している間、新たなバリケード装備をspawnしない。設置で消費された後のactive edgeは装備instanceではなく持続効果として扱い、次の設置の安全判定へ含める。同時に複数勢力がバリケード装備を所持・設置する状況を生成しない。

### 24.7 装備出現地域

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

### 24.8 装備pickup

Movement + 必要なRetreatがすべて完了した後、SC Updateより前にpickupを判定する。

- GroundEquipmentのregionを最終的にunitが占有していれば、そのunitのowner勢力inventoryへ追加。
- Movementで到達したunitでもRetreatで到達したunitでも取得可能。
- pickup後GroundEquipmentはmapから削除。
- unitがいなければGroundEquipmentは残る。

同一regionに複数unitは存在できないためpickup競合は発生しない。

### 24.9 自転車

自転車は永続装備。

#### 24.9.1 使用上限

- 1プレイヤーにつき1移動季節に最大1unitだけBicycleMoveを使用できる。
- 複数の自転車equipment instanceを所有していても、1季節にBicycleMoveできるのは1unitのみ。
- そのBicycle equipment instanceをそのunitへreserveする。

#### 24.9.2 命令

`BicycleMove(A -> B -> C)`

条件:
- A = unit開始region
- A-Bがその季節のeffectiveAdjacency
- B-Cがその季節のeffectiveAdjacency
- 直線でなくてよい
- 自転車移動unitはSupportを受けられない
- 自転車移動unit自身もSupportを行わない

#### 24.9.3 第1段階

A -> Bを通常Ordersと同時に裁定する。

自転車Moveのattack strengthは基本1で、Supportを加算しない。

失敗:
- Aに残る
- 第2移動なし

成功:
- Bへ移動
- 第2移動資格を得る

#### 24.9.4 第2段階

第1段階終了後、第1段階に成功した全BicycleMove unitの B -> C を同時に裁定する。

- 通常unitには第2行動なし
- Supportなし
- effectiveAdjacencyを使用
- 成功 => C
- 失敗 / standoff => B

第2段階用のtemporary map stateを作り、通常rules-coreの考え方を可能な限り再利用する。
第2段階を順番処理して先着順にしない。

#### 24.9.5 自転車の消失

自転車は使用成功/失敗では消費しない。

ただし、その季節にBicycleMoveへ割当されたunitが最終的に破壊された場合、その自転車equipment instanceは消滅する。

### 24.10 バリケード

バリケードは1回使用すると消費される装備。

#### 24.10.1 使用上限

- 1プレイヤーにつき1移動季節に最大1unitだけ `DeployBarricade` を命令できる。
- inventoryに複数のバリケードがあっても、同一季節に2軍へDeployBarricadeを出してはならない。
- 1つのequipmentIdを複数unitへ割当することも禁止。
- 自転車使用とバリケード使用は別枠。同じプレイヤーが同じ季節に、別unitでBicycleMoveを1件、DeployBarricadeを1件行うことは許可する。
- 1unitが同じ季節に複数の命令を持つことは当然禁止。

#### 24.10.2 命令

`DeployBarricade(unitId, targetRegionId, equipmentId)`

- unitの現在region Aとtarget Bが **baseAdjacency上の恒久的隣接** であること。
- Temporary Busだけで成立したedgeには設置不可。
- すでにactive barricadeがあるedgeには設置不可。
- Bはplayableでimpassableではない。

unitはその季節、移動せずその場に留まる。
裁定上は防御に関してHold相当として扱う。
- Support Holdを受けられる。
- 自身はMove / Supportを行わない。

#### 24.10.3 設置成功

Movement adjudication後、そのunitがdislodgedされていなければ設置成功。

- バリケードequipmentをinventoryから消費。
- barricade edgeをpersistent event stateへ追加。
- **現在の季節には影響しない。次のSpring/Autumn Orders開始時から有効化。**

unitがdislodgedされた場合:
- 設置失敗。
- まだ消費しない。
- Retreat成功ならinventoryへ戻る。
- 最終的にunitが破壊された場合、そのreserve中のバリケードも消滅。

#### 24.10.4 期間

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

#### 24.10.5 効果

active barricade edgeはeffectiveAdjacencyから除外する。

そのedgeを越える:
- Move不可
- Support不可
- Retreat不可
- Bicycle第1/第2区間不可

#### 24.10.6 孤立防止

新しいバリケードを追加した場合に、次の季節のbaseAdjacencyから
「その時点で次季節にも残るactive barricades + 新バリケード」
を除いたグラフが複数connected componentへ分断される場合、設置対象として選択不可。

つまりバリケードで唯一の出入口を塞ぎ、盤面を完全分断することを禁止する。

temporary Roadwork / Busはこの恒久的安全判定へ含めない。

### 24.11 道路工事

道路工事は装備ではなく、公開される季節限定イベント。

#### 24.11.1 発生

Spring / Autumn Orders開始時に、baseAdjacencyのedgeを1つ選ぶ。

候補:
- 両endpointがplayable
- active barricadeで既に閉鎖されていない
- 同季節の別Roadworkと重複しない
- そのedgeを除いても、その季節開始時のpersistent graphが分断されない

異なるcontroller同士の国境edgeを優先し、なければ全候補へfallback。

#### 24.11.2 効果期間

そのOrders + 直後のRetreatだけ有効。
SC Update前に終了する。

#### 24.11.3 効果

Roadwork edgeをeffectiveAdjacencyから除外。

- Move不可
- Support不可
- Retreat不可
- Bicycle不可

全員へイベント発生時に公開する。

### 24.12 臨時バス運行

臨時バスは装備ではなく、季節限定の臨時隣接追加イベント。

#### 24.12.1 候補pair

`baseAdjacency` 上で:
- 現在隣接していない
- playable / impassableでない
- base graph shortest path distance が2または3
- 同region不可

endpointのcontrollerが異なる、または片方neutralのpairを優先。
候補がなければ条件を満たす全pairへfallback。

active Roadwork / Barricadeによって一時的に距離が増えたことを理由に遠距離pairを選ばない。
候補距離はbaseAdjacencyで評価する。

#### 24.12.2 効果期間

そのOrders + 直後のRetreatだけ。

#### 24.12.3 効果

Bus pairをeffectiveAdjacencyへ追加。

- Move可
- Support可
- Retreat可
- Bicycleの1区間として利用可

同じpairを複数追加しない。

全員へイベント発生時に公開する。

### 24.13 イベント表示

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

### 24.14 公開/秘密情報

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

### 24.15 装備inventory UI

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

### 24.16 RNGと再現性

既存OnlineGameSession seedからイベント用の決定的RNG streamを派生する。

- 同じGame seed
- 同じyear
- 同じseason
- 同じevent generation state

なら同じイベント結果。

GameSessionにevent RNG counter/stateを保存する。

Math.randomへ直接依存しない。

### 24.17 Phase 4A対象外

- Discord Activity
- Steam
- event追加種類
- timer
- server restart永続化
- 観戦
- inventoryの他プレイヤーへの譲渡
- player間取引
- Equipment自然消滅


## 25. Phase 4Bの確定差分（ルールは維持、UIは第26節を優先）

以下はPHASE4B_DECISIONS.mdの全文を正本へ反映したもの。過去の規定年数・同点処理・順位・脱落年終了の未確定記述と矛盾する場合は本節を優先する。過去のフェイズ対象外記述は当時の記録として保持する。

# Phase 4B 仕様差分 — 試遊可能版の完成・シナリオ読込・終了処理・プレイログ

Status: Phase 4B 実装前の決定事項
Date: 2026-10-03

この文書は既存の `spec.md` と Phase 1.5 / 2A / 2B / 3A / 3B / 4A の決定事項に対する追加・変更である。
矛盾する場合、この文書を優先する。
Codexは実装開始前にこの内容を `spec.md` へ反映すること。

# 1. Phase 4Bの目的

Phase 4Aまでで、通常Diplomacy裁定・年間進行・オンライン対戦・公開イベント・装備まで実装された。

Phase 4Bでは新しいゲームメカニクスを増やさず、
**実際に3～11人で試遊し、結果を比較・改善できる状態**を完成させる。

主対象:
- 正式な京都シナリオJSONをオンラインルームへ読み込む仕組み
- ゲーム開始前のシナリオ検証
- 固定年数・終了条件の完成
- 最終順位/勝者表示
- プレイテスト用ログ
- 終了後のデータ出力

Discord Activity化、フォント/美術面の最終UI調整、新規イベント追加はPhase 4Bの対象外。

# 2. 正式シナリオの扱い

現在、repoに含まれる初期京都設定は未採用状態であり、ユーザーが地図エディタで保存したMapConfig JSONが実際のシナリオ正本になる。

Phase 4Bでは、オンラインルーム作成者が **保存済みMapConfig JSONを読み込んで、そのroomのシナリオとして使用** できるようにする。

## 2.1 Hostによるシナリオ読込

Lobby開始前にHostだけが:
- 「京都シナリオJSONを読み込む」
- JSONファイル選択
を行える。

ClientでJSONを読むだけでゲーム状態を確定せず、Serverへ送信しServer側でruntime validationとcompileを実行する。

Serverが正本として保持する:
- scenario id
- map config
- compiled MapDefinition
- validation summary
- checksum/hash

ゲーム開始後はscenarioを変更できない。

## 2.2 シナリオ表示

Lobbyに:
- シナリオ名
- 採用地域数
- SC総数
- 初期軍総数
- 更新/読込状態
を表示する。

# 3. ゲーム開始前Preflight

Start前にServerが必ず検証する。

Hard error（開始不可）:
- enabled region 0
- SC 0
- initial unit 0
- invalid adjacency
- starting unitがdisabled/impassable
- starting unit regionがSCでない
- 1regionに複数starting unit
- active候補11区のうち、初期軍が0の区がある
- active候補11区のうち、初期SCが0の区がある
- active候補11区のうち、enabled regionが0の区がある
- current player count用 `victoryTargetSC` がシナリオSC総数を超える
- MapConfig/MapDefinition validation error

Warning（開始可能だが表示）:
- wardごとの初期軍数差
- wardごとの初期SC数差
- wardごとのregion数差
- disconnected component
- 元KML MultiPolygon warning
- obstacle split warning
- degreeが極端に低いregion
- SCや初期軍が国境付近へ集中している等、既存客観値から表示可能なもの

バランスを「良い/悪い」と自動採点しない。

Start button付近へ:
- Error数
- Warning数
- 詳細を見る
を表示する。

# 4. 規定年数

初回試遊用の仮ルールとして **5年** を採用する。

設定:
- `maxYears = 5`

これはconfigurableとし、試遊後に変更可能。
コードへ散在するmagic numberにしない。

1年 = Spring + Autumn + Winter。

第5年Winterの清算・脱落判定が終了した時点で、他の終了条件が先に発生していなければゲーム終了。

# 5. 終了条件と優先順位

## 5.1 SC目標到達

Spring / AutumnのSC Update後に、`victoryTargetSC` 以上を所有する勢力が存在すれば即終了。

同一SC Updateで複数勢力がtarget以上になった場合:
1. SC所有数が最も多い勢力を勝者とする。
2. 最高SC数が同数なら、その勢力を同率勝者とする。

## 5.2 脱落発生

既存仕様どおり、脱落判定はWinter Adjustments後。

脱落条件:
- owned SC = 0
- または controlled non-SC region = 0

そのWinterに1人以上の新規脱落が発生した場合、
**その年を最終年として、そのWinter終了時点でゲーム終了**。

勝者は最終時点のSC所有数最多勢力。
同数なら同率勝者。

## 5.3 規定年数

SC勝利も脱落終了も発生しなければ、第5年Winter終了時点で終了。

勝者:
- final SC count最多
- 同数なら同率勝者

## 5.4 順位

最終順位は原則SC所有数の降順。
同数は同順位とする。

Phase 4BではSC以外のタイブレークを設けない。

表示例:
1位 A区 12SC
1位 B区 12SC
3位 C区 10SC

# 6. Game Over State

GameSessionに明確な終了理由を保持する。

例:
- `supply-target`
- `elimination-final-year`
- `max-years`

最低限:
- endReason
- endedYear
- endedSeason
- winners
- final standings
- final SC counts
- final controlled region counts
- final unit counts

終了後:
- 新しいordersを受け付けない
- boardは閲覧可能
- last adjudication/resultも閲覧可能
- match logをdownload可能

# 7. プレイテストログ

試遊改善のため、GameSessionとは別に決定的なMatchLogを蓄積する。

各phase/重要イベントにrecord:
- timestamp
- year
- season
- phase
- submitted order count
- finalizedまでに要した秒数
- resolved orders（裁定後のみ）
- SC count by ward
- controlled region count by ward
- unit count by ward
- equipment inventory count by ward
- generated public events
- equipment pickups
- barricade deployments / expirations
- standoff count
- dislodgement count
- build/disband count
- elimination
- victory/end reason

Draft中の秘密命令履歴は記録しない。
最終提出命令は裁定後にlogへ保存してよい。

## 7.1 交渉時間の近似

ゲーム内VCを持たないため、実際の会話時間は測定できない。
代わりに:
- Orders phase開始時刻
- 各player finalized時刻
- 全員finalized時刻
をlogし、ターン所要時間の参考にする。

# 8. Match Log Export

HostおよびGame Over画面から:
- `match-log.json`
をDownloadできる。

JSONに含める:
- game id
- scenario hash
- player count
- ward assignment
- inactive wards
- RNG seed
- event settings snapshot
- victory settings snapshot
- final result
- timeline

Reconnect token等の秘密認証情報は絶対に含めない。

# 9. 試遊サマリーパネル

Game Over画面で最低限:
- 勝者
- 終了理由
- 経過年数
- 最終SC
- 最終region数
- 最終unit数
- 各Orders phaseの平均所要時間
- standoff総数
- dislodgement総数
- 各イベント発生回数
- 自転車/バリケード取得・使用回数
を表示する。

これはゲームの面白さを自動評価するものではない。
ユーザーとChatGPTが試遊後に判断するための客観値。

# 10. 試遊用UIの範囲

Phase 4Bではフォントや装飾の最終調整を行わない。

直すのは、試遊不能になるUIのみ:
- Game Overに進めない
- startできない理由が不明
- Scenario未読込が分からない
- Result/log downloadが見つからない
など。

地図のフォント、装備アイコンの美術、余白、最終レイアウト等は後のUI polishフェーズへ回す。

# 11. ローカル年間進行

オンラインだけでなくローカル年間進行でも:
- maxYears 5
- SC target
- elimination final year
- final standings
を同じgame-core関数から利用する。

終了ロジックをReact側とServer側で二重実装しない。

# 12. テスト

最低限:

## Scenario
- valid saved MapConfig -> server compile success
- invalid JSON rejected
- invalid MapConfig rejected
- start blocked with missing initial ward setup
- start blocked if target > SC total
- warnings do not block

## End rules
- target reached spring -> finish
- target reached autumn -> finish
- two target achievers, one higher -> higher wins
- equal target achievers -> shared winners
- winter elimination -> same year finish
- maxYears=5 -> finish after year5 winter
- SC tie -> shared rank
- no orders accepted after finish

## Logging
- phase duration recorded
- resolved orders only after adjudication
- no reconnect token
- events/pickups recorded
- export schema valid
- final summary consistent with GameState

## Online
- 3-browser scenario load / start
- game over state broadcast
- all clients see same standings
- host downloads match log

# 13. Phase 4B対象外

- Discord Activity
- UI最終デザイン
- 新規イベント
- event重み調整
- server restart永続化
- spectator
- timer / AFK skip
- AI player


## 26. Phase 5Aの確定差分（最新の適用規定）

以下はPHASE5A_DECISIONS.mdの全文を正本へ反映したもの。過去フェイズのUI対象外記述と矛盾する場合、本節を優先する。第25節までのゲームルール・地図・設定形式は変更しない。

# Phase 5A 仕様差分 — プレイヤー向けUI/UX・ルーム導線・BGM基盤

Status: Phase 5A 実装前の決定事項
Date: 2026-10-03

この文書は既存の `spec.md` と Phase 1.5 / 2A / 2B / 3A / 3B / 4A / 4B の決定事項に対する追加・変更である。
矛盾する場合、この文書を優先する。
Phase 5Aではゲームルールを変更しない。

# 1. Phase 5Aの目的

Phase 4Bまででゲームロジック・オンライン同期・イベント・終了処理・試遊ログは成立した。
一方、現在の画面は開発/検証UIの情報密度が高く、実際のプレイヤーが遊ぶUIとして違和感が大きい。

Phase 5Aでは新ルールを追加せず、以下を優先する。

- プレイヤー向け画面と開発者向け画面を明確に分離
- ルームコードを迷わず見つけられるロビー
- 参加リンクのコピー
- 現在の接続範囲（LOCAL / LAN / PUBLIC想定）を明示
- ゲーム画面の情報階層を整理
- 命令入力を画面下部のコンテキスト操作へ整理
- BGM再生基盤を追加
- 音量/ミュート/自動再生制約へ対応
- Discord Activityへ後で載せやすいレスポンシブ構造へ整理

# 2. 「オンライン」の表現を正確にする

`127.0.0.1` / `localhost` は同一PCからしかアクセスできない。

そのため、起動画面・ゲーム画面で接続モードを明示する。

例:
- LOCAL: `127.0.0.1` / `localhost`
- LAN: private IP（192.168.x.x / 10.x.x.x 等）
- PUBLIC: 公開HTTPSホスト

LOCAL URLしか利用できない状態で「友達を招待」だけを強調しない。

Lobbyには小さく:
`接続範囲: このPCのみ`
または
`接続範囲: 同一LAN`
を表示する。

Phase 5Aではインターネット公開そのものは実装しない。
Public hosting / Discord Activityは次フェーズ。

# 3. プレイヤー向け入口

プレイヤー向けトップ画面を整理する。

主ボタン:
1. オンライン対戦
2. ローカルで試す
3. 設定

開発用:
- 地図エディタ
- Rules Sandbox
- Game Preview

は「開発ツール」へまとめ、通常プレイヤー画面の主導線から外す。

開発ツールを削除しない。

# 4. Lobbyの再設計

Lobby最上部にルーム情報カードを固定表示する。

必須:
- `ルームコード: ABC123` を大きく表示
- コピーボタン
- `招待リンクをコピー`
- Host表示
- 接続範囲（LOCAL/LAN）
- シナリオ名
- 規定年数
- 人数
- 勝利SC目標

ルームコードはスクロールしないと見えない位置へ置かない。

## 4.1 招待リンク

ブラウザ版では:
`<current-origin>/?room=ABC123`
等のjoin linkを生成する。

リンクを開いた場合:
- Online画面へ遷移
- room code入力済み
- nickname入力へ誘導

localhostの招待リンクをコピーした場合は
「このURLは同じPCからのみ利用できます」
と軽い注意を出す。

# 5. シナリオの誤認防止

Lobbyとゲーム開始後に、実際に読み込まれているシナリオを明示する。

Lobby:
- file name（clientで取得できる場合）
- scenario hash短縮表示
- enabled region数
- SC総数
- initial unit総数

Game header:
- scenario name
- hash短縮値は詳細パネル内

テストfixtureと実MapConfigを取り違えにくくする。

# 6. Game画面の情報設計

PC横長画面を基本とする。

## 6.1 Top Bar

常時表示:
- 年
- 春/秋/冬
- 現在フェイズ
- 自分の担当区
- 自分のSC数 / 勝利目標
- 自分の軍数
- 確定状態
- 音量/設定

Room codeはゲーム中は小さなchipで表示し、クリックでコピー可能。

## 6.2 Map

地図を主役にし、画面面積の大半を確保する。

維持:
- hoverで地域名
- subtle selection
- SC円
- army pin
- event marker
- barricade/roadwork/bus表示

常時大量の説明文字を地図上へ置かない。

## 6.3 Left/Right HUD

左:
- 今季の公開イベント
- 最近の裁定結果（折りたたみ可）

右:
- プレイヤー一覧
- 入力中 / 確定済み / 不要 / 切断 / 脱落
- SC数
- 自分の装備inventory

開発者向けID・内部state名・validation詳細は通常ゲーム画面から隠す。

## 6.4 Bottom Action Bar

自軍unitをクリックしたときだけ表示。

基本アクション:
- 待機
- 移動
- 支援
- 自転車（所持時）
- バリケード（所持時）

選択後:
- 地図上で合法対象だけを強調
- 操作途中を短い日本語で表示
- `キャンセル`
- `命令を変更`

右パネルの長いフォーム入力を主操作にしない。

# 7. 命令提出

画面下または右下に大きめの:
`命令書を確定`

確定前:
- 入力済み軍数 / 全軍数
- 未入力はHoldになることを短く表示

確定後:
- `確定済み`
- 全員裁定前なら`確定解除`

誰待ちかはplayer listで分かる。

# 8. フォントとVisual Token

Phase 5Aでは独自フォントファイルを同梱しない。

日本語system font stackを整理する。
例:
`"Yu Gothic UI", "Meiryo", "Hiragino Kaku Gothic ProN", system-ui, sans-serif`

CSS variables / design tokensへ集約:
- background
- surface
- border
- text
- muted
- accent
- danger
- radius
- shadow
- spacing
- font-size

既存の勢力色はゲーム情報なので維持しつつ、
UI chromeは落ち着いたニュートラル色で統一する。

# 9. BGMアーキテクチャ

ユーザー作成BGMを後から差し替えやすい構造にする。

推奨配置:
`apps/web/public/audio/bgm/`

manifest:
`apps/web/src/audio/bgm-manifest.ts`

例のslot:
- `title`
- `lobby`
- `game`
- `result`

Phase 5Aでは最低4slotを用意するが、同じ曲を複数slotに割り当ててもよい。

manifest例:
```ts
{
  id: 'game-main',
  src: '/audio/bgm/game-main.mp3',
  loop: true,
  defaultVolume: 0.45
}
```

ファイルが存在しなくてもアプリがクラッシュしないようにする。
未設定slotは無音。

## 9.1 再生ルール

- Title: title
- Lobby: lobby
- Orders / Retreat / Winter: game
- Game Over: result

季節ごとに同じgame BGMを再起動しない。
Game画面に入っている間は継続再生。

画面切替時は短いcrossfade / fade（例0.5～1.5秒）。

## 9.2 Browser autoplay

ブラウザはユーザー操作前の音声自動再生を拒否することがある。

最初の明示的クリック後にAudio systemをunlockする。
再生不可時はエラー表示ではなく、ミュート状態のまま音楽ボタンで開始できるようにする。

## 9.3 音量

設定:
- BGM ON/OFF
- BGM volume 0～100

localStorageへ保存。

将来SE追加を想定し、内部構造は:
- master
- music
- sfx
へ拡張可能にしてよいが、Phase 5AでSE実装は不要。

# 10. Discord Activityを見据えたUI

Phase 5Aは通常ブラウザで実装する。

ただし後からActivity iframeへ載せやすいよう:
- fixed absolute viewport assumptionsを減らす
- 1280x720程度でも操作可能
- sidebarが狭い画面で折りたためる
- browser URL bar前提の操作をゲーム内部へ持ち込まない
- invite/room code componentを独立させる

Discord SDKそのものはまだ導入しない。

# 11. 今回変更しないもの

- 戦闘ルール
- SC更新
- 勝利条件
- 脱落条件
- イベント確率
- 自転車
- バリケード
- 最大年数
- MapConfig
- KML / adjacency
- public deployment
- Discord SDK

# 12. 回帰テスト

- room codeがLobby first viewで見える
- copy room code
- copy invite link
- invite linkでroom prefill
- localhost時のlocal-only注意
- loaded scenario summary表示
- game HUD
- unit選択でaction bar
- hover region
- subtle selection
- ready statuses
- BGM設定保存
- missing audio fileでcrashしない
- route/screen changeで同じgame BGMが不要にrestartしない
- Game Overでresult slotへ切替


## 27. Phase 5A.1 の確定差分（最新の優先修正）

以下はPHASE5A_1_DECISIONS.mdの全文を正本へ反映したもの。Onlineシナリオ読込とSC/Armyマーカーについて、本節を優先する。ゲームルール・地域anchorは変更しない。既存のPhase 5A実装は保持し、今回の修正後は停止してUI/BGMの追加作業へ進まない。

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


## 28. Phase 5Bの確定差分

以下はPHASE5B_DECISIONS.mdの全文反映。過去節と矛盾する場合は本節を優先する。Phase 5Bの実装・検証後に停止する。

# Phase 5B 仕様差分 — 初回試遊UX改善・裁定演出・Audio・勝利条件調整

Status: Phase 5B 実装前の決定事項
Date: 2026-10-03

この文書は既存の `spec.md` と Phase 1.5 / 2A / 2B / 3A / 3B / 4A / 4B / 5A / 5A.1 の決定事項に対する追加・変更である。
矛盾する場合、この文書を優先する。

Phase 5Bでは初回対人試遊で明確になった「操作の分かりづらさ」「盤面情報の発見しづらさ」「裁定の味気なさ」を改善する。
大規模な美術刷新やDiscord Activity化はまだ行わない。

# 1. 初回試遊から確認した優先課題

今回の3人試遊では、ゲーム開始時のSC/軍は以下だった。
- 26102: SC6 / Army6
- 26104: SC6 / Army6
- 26111: SC5 / Army5

1年目春は全員確定まで約437.5秒、秋は約183.7秒を要した。
春の17命令はMove15 / Hold2、秋の17命令はMove6 / Hold11で、Support命令は記録されなかった。
春はstandoff 1 / dislodgement 0、秋はstandoff 0 / dislodgement 0。
1年目冬には合計7軍のBuildが発生した。

これを踏まえ、Phase 5Bは「ルール追加」より、地図操作・支援入力・イベント発見・裁定演出を最優先する。

# 2. 公開イベントを地図上で発見しやすくする

現在「道路工事: 柏野 ↔ 乾隆」のように名称だけ表示されても、広い京都マップ上で位置が分かりにくい。

全ての位置を持つ公開イベントに以下を実装する。

対象:
- Roadwork
- Temporary Bus
- Ground Bicycle
- Ground Barricade
- Active Barricade

## 2.1 Event card

イベントカードへ:
- 地域名
- 行政区名
- 効果
- `地図で見る`
を表示する。

例:
`道路工事: 柏野（北区） ↔ 乾隆（上京区）`

## 2.2 Hover

イベントカードhover中:
- 対象regionを強調
- edge eventなら両regionとedgeを強調
- その他の地図要素を完全に隠さない

## 2.3 Click / 地図で見る

クリック:
- 対象が見える位置へmap pan
- 必要なら適度にzoom
- 1～2秒程度pulse
- edge eventは対象境界を目立たせる

Roadwork:
- 工事edgeを太めのconstruction-style線または明確な×/ストライプで表示

Bus:
- 2点を結ぶ臨時路線を明確に表示

Ground Equipment:
- markerを中心へfocus

Active Barricade:
- edge + 残り季節をfocus

# 3. 自軍識別

現在、自分の担当区は分かっても、盤面の多数のArmy pinの中から「どれが自軍か」が直感的でない。

## 3.1 Own Army marker

自分のArmyだけ、勢力色に加えて色以外の追加識別を持つ。

推奨:
- 1～2pxの明るいouter halo / double outline
- 小さなself marker notch

敵軍には付けない。

文字「YOU」を全Armyへ常時描かない。

## 3.2 Header

Top HUDに:
`あなた: 西京区`
+ 勢力色swatch
を常時表示する。

## 3.3 Hover

自軍hover:
`自軍 / 地域名`

他軍hover:
`○○区軍 / 地域名`

# 4. 右クリックでMove

通常Ordersフェイズで:

1. 自軍unitを左クリックして選択
2. 移動可能regionを表示
3. 移動可能regionを右クリック
4. 即座にMove orderを作成

とする。

Map内ではcontextmenuを抑止する。

条件:
- own unit selected
- command wizard（Support/Bicycle/Barricade等）の途中ではない
- right-click targetがlegal Move destination

成功後:
- Move arrowを即表示
- order summaryを更新
- toast例: `修徳 → ○○へ移動`

invalid right-click:
- orderを変更しない
- 短い非modal feedback
- raw rule codeを表示しない

Touch/mobileはBottom Action Barによる従来操作を維持。

# 5. 2手先の移動理解

選択中Armyの直接隣接だけでなく、
「その移動先から、さらにどこへ接続しているか」を地図上で理解できるようにする。

## 5.1 Normal Move

Army Aを選択:
- immediate legal destinations = primary highlight

Primary destination Bをhover:
- Bから現在のeffectiveAdjacency上で隣接するregion = secondary highlight
- primaryとsecondaryは明確に違うstyle

表示文:
`次の一歩の参考（現在の通行条件基準）`

将来の季節にはイベントで道路状況が変わりうるため、
「次ターン確実に行ける」とは表示しない。

## 5.2 Bicycle

BicycleMove選択時は同じ2段表示を実際のA→B→C選択に利用する。
この場合secondaryはactual legal second legとして扱う。

# 6. Support入力を二段階で直感化

現状のSupport UIは「軍を支援するのか、移動先を支援するのか」が分かりにくい。

新しいSupport wizard:

1. 支援する自軍を選択
2. `支援`を押す
3. Step 1: `どの軍を支援しますか？`
4. map上の支援候補unitを強調
5. target unitをクリック
6. Step 2:
   - `この軍の現在地を守る`
   - `この軍の移動を支援する`
   を明示
7. Move supportの場合、legal destinationだけ強調して選択

## 6.1 Support Hold

`現在地を守る`:
- target unit current regionを選択済みとして扱う
- supporter -> target regionへsupport line

## 6.2 Support Move

`移動を支援する`:
- target unitが移動可能
- supporterがsupport可能
の両条件を満たすdestinationだけ表示する。

自軍targetに既にMove orderがある場合:
- そのdestinationを「現在の移動命令」として推奨表示
- ワンクリックでSupport Moveを設定可能

他勢力unit:
- その勢力の秘密命令を絶対に表示しない
- プレイヤーが「この軍がこの地域へ動く」という意図を手動指定する

## 6.3 Summary

設定後:
`○○の △△ → □□ を支援`
または
`○○を現在地で支援`
と自然言語で表示。

dashed support lineを盤面へ描く。

Escape / キャンセルでwizard解除。

# 7. 裁定Presentation

現在は裁定計算直後に最終状態へ飛ぶため、結果を見る余韻がない。

ゲームルール/サーバー裁定結果は変更せず、
Client presentation layerを追加する。

## 7.1 Snapshot

裁定前にpresentation用に:
- pre-resolution unit positions
- submitted orders（裁定後公開可能なもの）
- support relations
- result success/fail
- standoff
- dislodgement
- post-resolution unit positions
を保持する。

server authoritative resultが正本。

## 7.2 Animation sequence

既定約3～4秒。設定値化する。

推奨:
- 0.0～0.4s: Move arrows / Support lines表示
- 0.4～2.0s: Move unitをslide
- failed Moveは目的地方向へ約40%進んで戻る
- successはdestinationへ到達
- support lineはpulse
- 2.0～2.6s: standoff flash / dislodged shake
- 2.6～3.4s: final boardへsettle
- その後結果summary表示

`スキップ`ボタンを用意する。

複数unit移動は同時にanimateし、先着順処理に見せない。

Reconnect時、古いanimationの再生を強制しない。
final authoritative boardへ復帰できる。

# 8. Audioを今回のUX改善へ統合

以前の細かいAudio専用フェーズは行わず、Phase 5Bの裁定Presentationへ最低限追加する。

ユーザー制作音源を利用しやすいslotだけ作る。

推奨配置:
`apps/web/public/audio/`

```text
audio/
├─ bgm/
│  ├─ domestic.mp3
│  └─ adjudication.mp3
└─ sfx/
   └─ march.mp3
```

第三者素材やダミー音源をCodexが追加してはならない。
ファイル未配置でも無音でゲーム続行。

## 8.1 BGM

`domestic`
- Orders / Retreat / Winter / 通常盤面操作

`adjudication`
- 裁定Presentation開始から結果summary終了まで

同じdomestic context内でSpring→Autumn等へ変わっても頭から再生しない。

domestic ↔ adjudicationは短いfade/crossfade。

## 8.2 March SFX

unit slide中:
- `march.mp3` を一つのgroup SFXとして再生
- unit数分を同時多重再生しない
- animation skip時は停止
- animation終了時は停止

## 8.3 Minimal settings

Audio設定は最小限:
- 音楽 ON/OFF
- BGM音量
- 効果音 ON/OFF
- 効果音音量

localStorage保存。

ブラウザautoplay blockでゲームを止めない。

# 9. Neutral Supply Center表示

SC markerの表示色は `supplyCenterOwnerWardId` だけを正本とする。

`controllerWardId` をSC marker色へ流用しない。

## 9.1 Neutral SC

`supplyCenterOwnerWardId === null`:
- white / light neutral fill
- dark neutral border
- faction color ringなし
- 自勢力領土内でも必ずneutral appearance

Tooltip:
`補給拠点: 中立（未所有）`

## 9.2 Owned SC

ownerあり:
- 同じ基本SC geometry
- owner faction color ring
- tooltipにowner

Army有無によるSC size差は禁止（Phase 5A.1維持）。

# 10. 少人数の勝利条件

現行3人戦ではSC総数72に対し勝利目標23。
3×23=69で総SC72以下なので、理論上は3人全員が勝利目標相当のSCを持ちうる。
少人数時のneutral expansionだけで即時勝利へ近づく問題を抑える。

## 10.1 SC thresholdは維持

既存の人数別 `victoryTargetSC` はPhase 5Bでは原則維持する。

## 10.2 Rival SC conquest requirement

SC目標による「即時勝利」には追加条件を入れる。

- `victoryTargetSC` 以上を所有
AND
- ゲーム開始時に **別のactive playerが所有していたSC** を現在2個以上所有

を満たす必要がある。

設定:
`requiredRivalInitialSupplyCentersForInstantWin = 2`

これはconfigurableにする。

inactive ward由来のSC、中立SCはこの2個へ数えない。

同じ敵から2個でもよい。
「2人の別敵から1個ずつ」は要求しない。

## 10.3 Fixed-year winner

規定年数終了・脱落終了時の最多SC勝利には、このrival SC条件を要求しない。

つまり追加条件は早期instant victoryだけ。

## 10.4 HUD

勝利進捗:
`SC 18 / 23`
`敵初期SC 1 / 2`

と表示する。

# 11. 試遊ログ拡張

次回比較のためMatchLogへ追加:

- supportHoldCount
- supportMoveCount
- rightClickMoveCount（telemetry optional）
- adjudicationPresentationSkipped count
- rivalInitialSC count by ward
- neutralSC owned count by ward
- orders duration

privacyを壊さない。
right-click等のUX telemetryは個人識別を増やさずgame session内部の集計だけでよい。

# 12. 今回変更しないもの

- Map geometry
- 補給拠点のcapture timing
- controller rules
- 自転車ルール
- バリケードルール
- 公開イベント抽選
- Build location
- Discord Activity
- public deployment
- 本格的なUI美術


## 29. Phase 5Cの確定差分

以下はPHASE5C_DECISIONS.mdの全文反映。UI/UX・presentationについて過去節と矛盾する場合は本節を優先する。UI_UX_GAME_FEEL_GUIDE.mdをプレイヤー向けUI/UX・Game Feelの参照正本とする。ゲームルール・勝利条件・裁定・イベント・地図設定は変更しない。Phase 5Cの実装・検証完了後に停止する。

# Phase 5C 仕様差分 — UI Polish / Non-blocking Results / Match Result / Game Feel

Status: Phase 5C 実装前
Date: 2026-10-03

この文書はPhase 5B完了後のプレイヤー向けUI/UX改善を定める。
ゲームルール・裁定結果は変更しない。

## 1. 裁定結果を閉じなくても次の操作を可能にする

Phase 5Bでは裁定演出・結果サマリー表示中に命令入力を停止し、
`結果を閉じる` で次の入力へ戻る。

Phase 5Cでは以下へ変更する。

### 1.1 Animation中
裁定animation中のみ盤面入力を停止してよい。
既定約3.4秒。Skip可。

### 1.2 Animation終了後
- authoritative final boardを確定
- server上の現在phaseに応じて操作を即解禁
- 結果を閉じる操作を進行条件にしない

結果情報はfullscreen/modalではなく
`前回の裁定` non-modal drawerへ移す。

Drawer:
- backdropなし
- map操作をブロックしない
- 開いたままでも命令・撤退・Buildが可能
- collapse可能
- collapsed chipから再表示可能
- client-local UI state
- 誰かが閉じた/閉じないことでserver進行は変わらない

Retreatが必要ならdrawerとは別にaction ribbon:
`撤退が必要です`
を表示する。

## 2. Match Result画面の文言

大見出し `GAME OVER` をプレイヤー向け画面から撤去する。

共通小見出し:
`対局結果`

current playerが単独winner:
`勝利`

current playerが共同winner:
`共同勝利`

current playerがwinnerでない:
`第N位`

eliminated:
必要なら `脱落` badge + 最終順位

終了理由も自然文:
- 勝利条件達成
- 脱落発生により終了
- 規定年数終了

全員に同じランキング・統計は表示するが、
hero headingだけcurrent playerに合わせる。

観戦/担当勢力不明:
`対局終了`

## 3. UI design systemを正式化

`UI_UX_GAME_FEEL_GUIDE.md`を参照正本として扱う。

design tokens:
- spacing
- radii
- typography scale
- surface/background
- text/muted
- border
- accent
- success/warning/danger
- shadows
- motion durations/easings

散在するmagic CSS値を段階的にtokenへ移す。

既存勢力色はgame dataとして維持。

## 4. Command UX polish

自軍選択時BottomActionBarを「command dock」として視覚的に整理。

表示:
- 選択Army
- 現在地域
- 現在命令
- Hold / Move / Support / Bicycle / Barricade
- Cancel / Change

選択時:
- Armyが短くlift/halo
- legal region reveal

order accepted:
- map arrow/line
- destination one-shot pulse
- dock summary即更新

Hold:
- 小さなhold/shield indicatorをArmy付近に表示してよい

すべて短く、animationによって操作を待たせない。

## 5. Phase transition

大きなmodalではなく、map中央上部へ短いbanner。

例:
`1902 春 — 命令`
`1902 秋 — 命令`
`1902 冬 — 軍備調整`

300～600ms程度で入退場。
その後TopBarの常時表示へ収束。

## 6. SC capture / Build / Equipment feedback

情報上重要な変化だけ軽い演出。

SC capture:
- SC ringがnew owner colorへtransition
- small `+1 SC` near own HUD（own player時）
- neutral -> ownedが視認可能

Enemy initial SC capture:
- progress indicatorをbrief pulse
- `敵初期SC 2 / 2`等

Build:
- Army pin fade/raise-in

Disband:
- fade/shrink

Equipment pickup:
- map marker -> inventory方向への簡易feedback
- card/inventory count pulse

演出はserver state変更後のpresentationでありルールを変えない。

## 7. Ready feedback

命令確定:
- button morph/text `確定済み`
- player listも即時status反映
- 自分の確定解除が可能な間は明示

all ready:
- 0.3～0.6sの短いtransition後、adjudication presentationへ
- 長いloading modal不要

## 8. Event cards polish

Phase5Bの地図focusを維持。

Card hierarchy:
- icon
- event name
- target names
- short effect
- 地図で見る

現在イベントとpersistent effectsを分けて表示。
期限のあるBarricadeは残り季節をchipで表示。

## 9. Map readability

地図が主役。

- side panel surfaceを少し透過/軽量化
- map label collisionを悪化させない
- selected / own / legal / secondary / event highlightのstyleを明確に区別
- thick black outline禁止を維持
- neutral SC UIを維持

小さなregionでoverlayが重なりすぎる場合、
hover/focus時だけ詳細ラベルを出す。

## 10. Result screen game feel

勝者:
- 600～1200msの控えめhero reveal
- winner faction color accent
- trophy/crown等の単純iconは可
- confettiはPhase5Cでは原則使わない

非勝者:
- neutral result presentation
- rankを最重要

共通:
- ranking
- end reason
- SC
- territory
- unit count
- match summary
- download log

## 11. Audio hooks

既存:
- domestic
- adjudication
- march

を維持する。

追加SFXはファイルがあれば使えるslotだけ準備してよい:
- select
- order-confirm
- sc-capture
- support-success
- standoff
- victory

第三者音源/ダミー音源は禁止。
未配置は無音。

SFXなしでも同じ情報を視覚的に得られること。

## 12. Accessibility / motion

- prefers-reduced-motion
- skip adjudication
- focus-visible
- Escape cancel
- non-color indicators
- UI motion never blocks essential interaction after state is known

## 13. 対象外

- rules changes
- victory condition changes
- new events
- Discord Activity
- public deployment
- mobile-first redesign


## 30. Phase 6Aの確定差分

Phase 6Bの表示・音源方針は第31節を優先する。入力修正とゲームルールは維持する。

以下はPHASE6A_DECISIONS.mdの全文反映。プレイヤー向けUI・入力・Audioの整理は本節を優先し、UI_UX_GAME_FEEL_GUIDE.mdとAUDIO_PLACEHOLDER_PLAN.mdを参照する。ゲームルール、裁定、勝利条件、イベント、自転車・バリケード、SC更新、Build/Disband、KML・MapConfigは変更しない。右クリックMoveは実ブラウザのマウス操作で再現・検証する。Phase 6A完了後に停止する。

以下のStatusは差分文書の策定時点の原文を保持したもの。現在の実装状態は文頭のStatusとdocs/PHASE6A_REPORT.mdを参照する。

# Phase 6A 仕様差分 — Board-First UI Redesign / Input Fix / Audio Placeholder Integration

Status: Phase 6A 実装前
Date: 2026-10-04

この文書は、Phase 5C完了後の「UIをゲームらしく整える」ための仕様差分である。
ルール変更は行わず、盤面体験・見た目・入力の確実性を優先する。

## 1. 目的

現状の問題:
- 画面が細々しており、盤面よりもUIパネルが目立つ
- 開発ツール感が強い
- 情報が常時出すぎて視線が散る
- 右クリックMoveが現環境で期待通り動いていない
- マップを触る気持ちよさより、フォーム操作感が強い

目標:
- 「地図が主役」の画面にする
- ひと目で自軍・敵軍・SC・イベントが分かる
- 必要な時だけ情報を出す
- 右クリックMoveを確実に使える
- 見た目を“開発用ツール”から“遊べるゲーム”へ近づける

## 2. レイアウト方針

### 2.1 Board-first
盤面を最優先にする。
PC標準表示では、主要画面面積の中心をマップが占めること。

目安:
- 地図領域を横幅の少なくとも 70% 以上
- 高さも可能な限り確保
- 不要時の左右パネルは折りたたみ / 最小化

### 2.2 常時表示を減らす
常時表示は最小限にする。
常時必要なのは:
- 年 / 季節 / フェイズ
- 自分の区
- SC進捗
- 軍数
- 入力状態
- 命令確定ボタン
- 参加者のready状況（簡略）
- 音量 / 設定 / 退出

それ以外:
- イベント詳細
- 前回裁定
- 参加者詳細
- シナリオ詳細
- 自分の装備 / 予約
- 無所属区一覧
- 詳細な命令一覧

は、折りたたみかタブに移動する。

### 2.3 基本構成
- 上部: 薄いTop HUD（1行または2行まで）
- 中央: 大きな盤面
- 下部中央: command dock
- 左: 折りたたみ可能なサイドトレイ（イベント / 前回裁定）
- 右: 折りたたみ可能な情報トレイ（参加者 / 選択地域 / 自分の命令）
- Confirmボタンは目立つが巨大すぎない固定位置

## 3. 視覚方向性

方向性は
「作戦盤 / モダンな地図ゲーム」
で統一する。

### 3.1 避けるもの
- フォームが多い管理画面風UI
- 罫線だらけの設定画面風見た目
- 細かい枠が並ぶだけの情報密集UI
- 常時長文表示
- 盤面より濃いサイドバー
- 小さすぎる文字
- 目立ちすぎる開発用ラベル

### 3.2 目指すもの
- 明るく落ち着いた面
- 地図色が主役
- HUDは細く控えめ
- 命令入力はコンパクト
- ピン・矢印・支援線は見やすい
- 余白がある
- 「触れる盤面」という印象

## 4. マップ表示の改善

### 4.1 ピン・SCの見せ方
- ピンは現状よりやや大きくする
- ArmyピンとSCが重なっても判別しやすくする
- SCは軍の有無で不自然に見え方が変わらない
- 自軍は視認しやすい縁取り / haloを維持

### 4.2 ラベル
常時全ラベルを強く表示しない。
基本:
- 主要ラベルは控えめ
- hover / selected / zoom-in 時に詳細を強く出す
- 選択地域は名前を上部か右側の小インスペクタにも表示

### 4.3 選択強調
太い黒枠は使わない。
代わりに:
- 明るい縁取り
- 軽い外側glow
- subtle pulse
- 選択ピンのリフト
を使う。

### 4.4 無所属・中立
だれのものでもない地域・SCは、
「情報がない」ことが直感的に分かる見た目にする。
過剰に色を付けない。

## 5. コマンド入力の改善

### 5.1 右クリックMoveを確実に直す
必須修正:
- 自軍を左クリックで選択
- 合法な移動先を右クリックでMove登録
- 右クリックMoveが動作しない環境・状態を解消する

確認項目:
- ブラウザのcontextmenu抑止
- overlayやpanelによるpointer event干渉
- selected unit stateが消えていないか
- hover/selectionとsecondary targetが競合していないか
- support/bicycle/barricade選択中以外では right-click Move が有効か

### 5.2 明示的フォールバック
右クリックが使えない環境向けに、
既存のボタン操作・タッチ操作は維持する。
ただし、PCでは右クリックMoveを第一級UXとして扱う。

### 5.3 command dock
command dockは
- 選択軍
- 現在地
- 現在命令
- Hold / Move / Support / Bicycle / Barricade / Cancel
だけに絞り、
情報を詰め込みすぎない。

## 6. パネル再設計

### 6.1 左トレイ
「イベント・結果」系。
内容:
- 今季公開イベント
- 地面の装備
- 持続効果
- 前回の裁定（折りたたみ）

初期状態は「細いタブ」または「軽い幅」でよい。
必要時だけ広げる。

### 6.2 右トレイ
「参加者・地域情報」系。
内容:
- ready状況
- 自分の命令数
- 選択地域の詳細
- 選択地域の支配 / SC / 所有情報

シナリオ詳細や無所属区一覧はデフォルト折りたたみ。

### 6.3 地域インスペクタ
地域をhover/選択したとき、
その地域の基本情報を簡潔に出す小インスペクタを用意してよい。
ただし地図領域を圧迫しないこと。

## 7. Audioの扱い

Audioは「細かな仕様をさらに増やす」のではなく、
最低限の効果音をプレースホルダーで導入する。

### 7.1 今回対象
BGMは既存方針を維持。
追加するのは以下の短い効果音枠:
- select
- order-confirm
- march
- support-success
- sc-capture
- standoff
- victory

### 7.2 役割分担
- Codex: 再生フック、音量設定、ファイル参照、未配置時の安全処理
- ChatGPT/補助生成: シンプルな仮音源（プレースホルダー）制作支援は可能
- 本格音源: 必要なら後から差し替え

### 7.3 方針
- まずは短く邪魔しない
- UIの分かりやすさを補助する
- 無音でも情報が欠落しない
- 未配置ファイルで落ちない

## 8. 実装優先順位

優先度A:
1. 右クリックMove修正
2. 盤面を広くするレイアウト刷新
3. 常時表示の削減
4. パネル折りたたみ
5. command dockの簡潔化
6. 開発ツール感の強い見た目の整理

優先度B:
7. ピン/SC/ラベルの視認性改善
8. 選択・hover表現の微調整
9. 地域インスペクタ
10. 最低限の効果音フック確認

優先度C:
11. 仮効果音の差し込み
12. より細かな見た目の polish

## 9. 対象外

- ゲームルール変更
- イベントルール変更
- 勝利条件変更
- Discord Activity化
- 公開デプロイ
- モバイル全面最適化

## 31. Phase 6Bの確定差分（2026-10-04のユーザー指示）

目的は開発ツール感をさらに減らし、友達と遊べる盤面の視認性・見た目・手触りへ改善すること。ゲームルールは変更しない。

### 31.1 SC・軍・ラベル

SCをクリック・選択しても、黒塗りや大きな黒円でSC・軍・地域名を隠さない。細いリング、軽いglow、控えめなpulseを優先する。同じズームでSCの大きさをArmyの有無によって変更しない。軍密集時は詳細ラベルの常時表示を抑え、hover・選択時の情報を優先する。キーボード選択の可視性も維持する。

### 31.2 作戦盤・非プレイ領域

温かみのある紙色・オフホワイト・淡い青緑を使い、外周の非プレイ領域には独自の山地・森・地形を背景として描く。背景は装飾のみで、地域・隣接・通行可否を追加または変更しない。プレイ可能な地域へ自然背景をかぶせず、都市部・領土・駒・命令を読みやすくする。現実の標高・植生を正確に再現する目的ではない。他作品の素材・UI・アイコンをコピーしない。領土・勢力色・境界線のコントラストを適度に上げ、UI面の白さを減らす。

### 31.3 カメラと構図

初期表示と全体復帰はプレイ領域の都市部を主役にし、その外側に自然背景が見える構図へ調整する。大きな外周ポリゴンに合わせて肝心の対戦エリアが小さすぎる表示を避ける。地域・SC・軍を削除しない。全プレイ範囲の確認・パン・ズーム・イベントfocusを利用できる構造を維持する。

### 31.4 仮SE

Phase 5B/5Cのダミー音源禁止とPhase 6Aの未配置方針を、今回のユーザー許可により仮SEについて更新する。リポジトリ内で生成した簡易WAVなど、差し替え可能なローカル資産を追加してよい。対象はselect / order-confirm / march / support-success / sc-capture / standoff / victory。第三者音源の無断取得・ダウンロードは行わない。BGM基盤と独立したSE ON/OFF・音量・設定保存を維持する。未配置・404・再生拒否でゲームが停止しないこと。marchは既存の単一グループ再生と終了・skip時の停止を維持する。

### 31.5 変更禁止・検証・停止

裁定ロジック・勝利条件・イベント規則・自転車・バリケード・Build/Disband・SC更新・KML/MapConfigのルール的意味・Phase 6Aの右クリックMove修正を変更しない。

lint / typecheck / test / build / test:browser / map:validateを実行する。1920×1080と1280×720で、通常盤面・SC選択・軍密集・外周自然背景・SE再生・command dock・イベントを目視確認し、画像を保存する。docs/PHASE6B_REPORT.mdに修正・音源・構図・テスト・画像・残るUI課題を日本語で報告する。完了後はPhase 6Bで停止し、公開デプロイ・Discord Activity・ルール変更へ進まない。


## 32. Phase 6Cの確定差分

以下はPHASE6C_DECISIONS.mdの全文反映。プレイヤー向け表記とカメラについて過去節に優先し、ゲームルールは維持する。元プロンプトのPhase 6C停止指示は今回のユーザー指示により、単体検証・報告完了後に限ってPhase 7Aへ進める。

# Phase 6C 仕様差分 — 用語統一・勝利条件ヘルプ・ズーム制限・広域補給拠点表示

Status: Phase 6C 実装前
Date: 2026-10-04

この文書は Phase 6B 完了後の小規模UI/UX整理である。
ゲームルール・裁定・MapConfig・KMLは変更しない。

## 1. 目的

Phase 6Bで盤面・自然背景・SE・カメラが大きく改善した。
Phase 6Cでは公開前の仕上げとして、以下だけを直す。

- 広域表示時の中立補給拠点マーカーが大きすぎる
- プレイヤー向けUIに `SC` 表記が残っている
- 一部の日本語が機械的・不自然
- 勝利条件をゲーム中に確認しづらい
- 必要以上にズームアウトできる

## 2. 中立補給拠点のsemantic zoom

現在の中立補給拠点は、全域表示で白い破線円が地理に対して大きく見える。

新方針:
- tactical/normal zoomでは現行サイズを維持
- wide zoom / 全域表示付近では中立・未所有の補給拠点だけ視覚サイズを約70%へ縮小
- 例: visual radius 6 -> 4.2前後
- strokeも少し細くする
- 所有済み補給拠点、Army、選択ringは必要に応じて別スケール
- クリックしやすさを落とさないため、見えないhit targetは現行以上の大きさを維持
- zoom境界で急に変わらず、段階または滑らかな補間を使う

ルール上の補給拠点サイズ・アンカーは変更しない。表示のみ。

## 3. プレイヤー向け用語統一

ユーザーに見えるUI・ヘルプ・tooltip・結果画面・イベント説明では `SC` を使わず、
すべて `補給拠点` と表記する。

例:
- `SC 6 / 23SC` -> `補給拠点 6 / 23`
- `SC所有` -> `補給拠点の所有`
- `敵初期SC 0 / 2` -> `敵の初期補給拠点 0 / 2`
- `+1 SC` -> `補給拠点 +1`

TypeScriptの内部field名、JSON schema、telemetry key、テスト内部識別子は互換性のため `SC` を維持してよい。
ただしプレイヤー画面へ内部名を露出させない。

## 4. 日本語UX監査

全 player-facing strings を一度棚卸しし、
開発者用語・直訳調・AI的な不自然さを修正する。

特に以下を修正する。

旧:
`全撤退後の占有軍が取得`

新:
`撤退処理が終わった時点で、その地域にいる軍の勢力が装備を獲得します。`

短いcard向け:
`取得: 撤退処理後、その地域にいる軍の勢力`

推奨用語:
- `地面の装備` -> `マップ上の装備`
- `持続する封鎖` -> `継続中の封鎖`
- `前回の裁定` -> `前回の行軍結果`
- `全プレイ範囲` -> `全域を表示`
- `選択区を拡大` -> `選択地域を拡大`

一文を短くし、名詞を連結しすぎない。
同じ概念は同じ語で呼ぶ。

## 5. 勝利条件タブ

Top HUDの `音量・設定` 付近に `勝利条件` ボタンを追加する。

non-modal drawer / popoverで表示し、盤面操作を塞がない。

ゲームの現在設定から動的に表示:

### 勝利条件
- 即時勝利:
  `補給拠点を {victoryTarget} か所以上所有し、他の参加者がゲーム開始時に所有していた補給拠点を {requiredRival} か所以上所有すると勝利。`
- 脱落が発生:
  `冬の処理で新たな脱落者が出た場合、その年で終了。補給拠点を最も多く所有している勢力が勝利。`
- 規定年数:
  `規定の {maxYears} 年が終了した時点で、補給拠点を最も多く所有している勢力が勝利。`

### 脱落条件
- `所有する補給拠点が0になる`
- `支配している補給拠点以外の地域が0になる`

同数なら共同勝利であることも記載する。

内部値と表示が食い違わないよう、GameSession settingsから生成する。

## 6. ズームアウト上限

ユーザーが必要以上に地図を小さくできないようにする。

新方針:
- `全域を表示` のcamera extentを最大ズームアウトとする
- wheel / `-` button / pinch相当操作で、それ以上外側へズームアウトできない
- 画面端の安全余白として全域fitの約3〜5%追加は許可
- window resize時は再計算
- panは現在の仕組みを維持するが、完全に盤面を画面外へ追い出せないよう必要ならsoft clamp

`全体に戻す` / 作戦表示はこれより寄ったカメラ。
イベントfocus / 選択地域拡大はズームイン方向のみ。

## 7. テスト

- wide zoomで中立補給拠点 visual radius が小さくなる
- invisible hit areaは縮まらない
- normal zoomで現行サイズへ戻る
- player-facing DOMに `SC` という単独略称が残らない
- 勝利条件drawerがGameSession値を表示
- drawer openでも盤面操作可能
- wheel / minusで全域fitよりズームアウトできない
- resize後も上限が有効
- 日本語snapshot / text regression


## 33. Phase 7A — Render公開Web版

以下の公開方針を正本へ反映する。Phase 6Cの報告・全検証完了後に開始し、Phase 7Aで停止する。ゲームルール・裁定・勝利条件・イベント・装備・KML・MapConfigの意味を変更しない。Discord Activity・永続DBを追加しない。

# Phase 7A 公開Web化 方針 — Render Free

Status: Deployment plan
Date: 2026-10-04

## 1. 採用構成

現状の React/Vite + Node.js + Socket.IO を大きく書き換えず公開するため、
Renderを採用する。

構成:
- Frontend: Render Static Site (Free)
- Backend: Render Web Service (Free)
- Source: GitHub repository
- HTTPS/WSS: Render managed TLS
- Deployment config: repo root `render.yaml`

Discord ActivityはPhase 7A対象外。

## 2. この構成を選ぶ理由

- Static frontendは常時配信できる
- Node Web ServiceはSocket.IO/WebSocketをそのまま使える
- Free Web Serviceはアイドル時にsleepし、次のHTTP/WS接続でwakeする
- 友達へ通常のHTTPS URLを共有できる
- frontendをbackendと分離することで、backend cold start中も画面を表示して
  `サーバーを起動しています` と案内できる
- monorepoをRender Blueprintで再現可能にする

## 3. 無料枠の制約をUIで吸収

Backend free instanceはidle後sleepするため、
clientのOnline入口でbackend healthを確認する。

状態:
- connecting
- waking
- online
- retrying
- unavailable

初回wakeは時間がかかる可能性がある。
最大90秒程度はfriendly progress UIでretryし、
生のSocket errorを最初に見せない。

## 4. 本番server要件

- `process.env.PORT` を使用
- `0.0.0.0` bind
- `/health` 200
- production frontend originだけCORS allow
- localhost dev originもdevelopmentのみallow
- WebSocket / Socket.IO reconnectはexponential backoff
- graceful SIGTERM
- room codeに推測耐性を確保
- reconnect tokenをlog/exportへ出さない
- debug endpointsをproductionで公開しない

## 5. Frontend要件

- backend URLをbuild-time env (`VITE_ONLINE_SERVER_URL` 等) で設定
- productionは `https://...onrender.com`
- Socket.IOはHTTPS pageからWSSへ接続
- invite linkはfrontend public URLを使用
- productionでは `公開サーバー` と表示
- backend sleep中もfrontendは開く
- `サーバーを起動しています。初回はしばらくかかることがあります。`
  を表示
- reconnect progressをわかりやすくする

## 6. 安定性

長期間同じ状態で遊べるよう:
- package-lockを必ずcommit
- `npm ci`
- Node major versionをpin
- render.yamlへbuild/start/healthを明示
- 本番branchを固定
- 初回公開後は `autoDeployTrigger: off` または `checksPass` を選べるようにする

推奨:
安定版公開後は auto deploy を off にし、
明示的にdeployした時だけ更新する。

## 7. Room state

Phase 7Aでは既存どおりroom/game stateはメモリ保持でよい。

制約:
- backend restart/deploy/maintenanceで進行中roomは失われ得る
- active matchの永続復旧はPhase 7A対象外

将来必要なら外部の永続storeを追加する。
Render Free Postgresを長期保存用途に依存しない。

## 8. render.yaml

2 servicesをBlueprint管理:
- static frontend
- free Node web backend

実際のworkspace scriptsをpackage.jsonから調査し、
推測のbuild commandをハードコードしない。

## 9. Production verification

最低限:
- public frontend URL opens from another network
- create room
- invite link
- 3 separate clients join
- WebSocket stays connected during active game
- right-click Move
- support
- adjudication
- audio assets load
- backend sleep -> wake -> create a new room
- reload/reconnect
- no localhost URL in production bundle
- no secret tokens in logs


### 33.1 今回の追加条件

FrontendはBackend起動を待たず表示する。health確認と約90秒の接続待ち・backoffを行い、connecting / waking / retrying / online / unavailableを自然な日本語で説明する。HTTPSのBackend URLはbuild時の環境変数から読み、公開サーバーと表示し、招待URLは公開Frontend originを使用する。productionではFrontend originだけをCORSとWebSocket handshakeで許可し、wildcard・開発debug endpoint・秘密情報のログ出力を禁止する。BackendはPORT、0.0.0.0、health、SIGTERMを扱う。

render.yamlはroot package.jsonの実在するnpm scriptsを使用し、npm ci・package-lock・Node 24 major固定・本番branch main・autoDeployTrigger offで再現する。Room/Gameはメモリ保持のため、再起動・redeploy・休止で失われる可能性をREADMEと報告へ明記する。

通常6コマンドに加え、公開origin想定接続・CORS・health・起動待ち/再試行・招待URL・再接続・本番音源path・localhost固定URLなしを検証する。3クライアントで作成から裁定/再読込まで可能な範囲で確認し、実Render公開とローカル検証を区別する。GitHub/Renderのユーザー側操作・環境変数・公開URL確認はDEPLOY_RENDER.mdへ具体的に記載する。未実施の公開を完了扱いにしない。
