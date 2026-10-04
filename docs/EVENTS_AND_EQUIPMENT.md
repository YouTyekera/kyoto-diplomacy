# Phase 4A 公開イベント・装備API

仕様の正本はspec.md第24節です。春・秋Ordersへ入る直前にイベントを生成し、移動と全撤退の後、SC更新より前に装備と期限を清算します。オンラインとローカル年間進行が同じgame-coreを使います。

## 状態と責務

| ファイル | 内容 |
| --- | --- |
| packages/shared/events.ts | 装備・辺・公開イベント・予約・GameOrder・結果の型と厳格Zod検証 |
| packages/game-core/events.ts | seeded生成、候補、安全判定、有効隣接、pickup、期限、公開用所持数 |
| packages/game-core/equipment-orders.ts | 装備命令検証、予約、GUI候補、2段階同時移動、設置 |
| packages/game-core/session.ts | 初期春・次秋・次年春の生成と、撤退後清算の呼出し |
| packages/online-core/room-manager.ts | 認証済み提出・全員確定・公開/本人viewのallowlist |
| apps/web/src/EventsPanel.tsx / EquipmentOrderFields.tsx | 共通イベント・所持数、本人用の使用可能/予約表示、合法な装備入力 |
| data/config/event-settings.json | 種類別抽選重み。初期値は全て1 |

GameSessionStateの`events`は、`seed`、`rngCounter`、`nextEquipmentSerial`、生成時設定、今季の`current`、地面装備、勢力inventory、今季reservations、active/pendingバリケード、工事辺、バス辺を保持します。装備は恒久的なcarrier unitを持ちません。静的MapDefinitionやPreview JSONへ混ぜません。

runtime schemaで不正種類、余分なフィールド、装備ID重複、地面の重なり、予約重複、存在しない装備の予約、辺の端点順、期間・counter等を検証します。命令書全体では自軍所持・各種類各勢力1軍・経路・地図分断も検証します。不正な提出は保存前に拒否します。

## API

```ts
const created = createGameSession(map, preview, wards, yearLimit, victoryTargetSC, {
  seed: 'reproduce-this-game',
  // settingsを省略すると設定ファイルの同率重みを使う
});
const seasonMap = effectiveMap(map, state.events);
const choices = legalGameOrders(map, state, unitId, ownDraftOrders);
const checked = validateGameOrders(map, state, allOrders);
const reserved = reserveGameOrders(map, state, allOrders);
const movement = adjudicateGameOrders(map, state, allOrders);
const retreat = adjudicateGameRetreats(map, movement.result, retreatOrders);
```

実際の呼出しでは各`ok`を確認してから`result`を使います。オンラインは秘密の他者命令を補完Holdで隠したまま本人の提出を検証し、全員確定時に本当の命令書を同時裁定します。合法候補生成は検証済み地図の隣接を参照し、候補ごとに227ポリゴンを再parseしません。提出時の検証は省略しません。

## 有効隣接と安全判定

`buildEffectiveAdjacency(base, activeBarricades, roadworkEdges, temporaryBusEdges, allowed)`は対称な昇順グラフを返します。入力を変更せず、重複・自己辺・除外/侵入不能地域を排除します。通常地図から封鎖と工事を除き、バスを加えます。

通常移動・支援・撤退・自転車の各区間は同じ有効隣接を使います。設置対象だけは恒久的base隣接を使います。工事で今季通れない恒久辺にも設置命令は出せます。バスだけの辺には設置できません。

分断防止はbaseから持続する封鎖を引いたグラフを基準にします。バリケードの判定では次季節にも残る封鎖を使い、残り1季の封鎖は除きます。工事は今季のactive封鎖を使います。辺を取り除いて連結成分が増えれば拒否し、元から別々の採用地域を自動接続しません。工事とバスをバリケードの恒久安全判定へ含めません。

## 生成とRNG

3～5人は1件、6～8人は2件、9～11人は3件。1～2勢力のローカル検証では1件です。各種類は季節に1回まで、候補なし・重み0の種類を除外し、残りから重み付きで選びます。種類数を毎回減らすため無限再抽選はありません。生成不能なら可能な件数で終了します。

乱数入力は`seed:year:season:rngCounter`です。FNV-1aと整数のavalanche混合から0以上1未満へ変換します。種類選択と場所選択ごとにcounterを進め、状態に保存します。入力候補を昇順で固定し、イベント処理でMath.randomを使いません。オンラインはサーバー側crypto seedを区割当と共有します。生成設定も開始時の状態に保存し、途中のファイル変更で進行中ゲームを変えません。

装備は侵入可能・非SC・軍なし・既存装備なしの地域が候補です。base隣接地域のcontrollerに異なるactive勢力が2つ以上ある前線を優先し、なければ必須条件だけの候補へ戻ります。道路工事は安全なbase辺のうちcontrollerの異なる境界を優先。バスはbaseの最短距離2/3の非隣接ペアを使い、controllerが異なるか中立endpointを持つ候補を優先します。

ユーザーの追加決定に従い、バリケード装備は世界全体で1個です。地面・いずれかの勢力inventoryにあれば新規生成しません。消費済みのactive封鎖は装備ではなく持続効果なので、次の装備生成は可能です。これにより本番生成では複数勢力の同時設置競合を作りません。複数装備を持つ検証状態でも各勢力1軍制限と予約重複拒否は残します。

## 自転車

GameOrderは`{type:'bicycle-move', unitId, viaRegionId, destination, equipmentId}`です。所持する自転車を予約し、各勢力1軍までです。

第1段階ではA→Bの通常Moveへ変換して他の通常命令と同時裁定します。自転車軍IDを`unsupportedUnitIds`として渡し、その軍を対象にした支援を不成立にします。他人の秘密命令を検証時に参照する必要はありません。第1段階で成功した全自転車軍だけ、第2段階でB→Cへ同時移動します。他軍は第2行動なしのHold、支援なしです。どちらも同じrules-coreを使い、入力順で勝者を決めません。

両段階の成功到着地域にcontrollerを反映します。移動前の地域支配は消しません。排除情報を統合し、最終盤面の占有と両段階のstandoffを用いて撤退候補を作ります。全撤退は第2段階の後です。

`movement.orderResults`は通常の第1段階の強度・支援ログです。`movement.equipmentResults`は自転車の経由/終点と、両区間の成功・失敗理由を別々に返します。第1区間失敗時は第2区間結果を作りません。自転車は消費せず、撤退清算後に予約を解除します。

## バリケード

`{type:'deploy-barricade', unitId, targetRegionId, equipmentId}`はその軍をHoldとして裁定し、Support Holdを受けられます。通常の1ユニット1命令を守ります。自転車と設置は別枠なので、同じ勢力の別軍なら同じ季節に各1命令が可能です。

両移動段階の後に排除されていなければ成功し、装備を消費して`pendingBarricades`へ残数4の辺を保存します。現在の有効隣接は変えません。次の春/秋Orders開始時にactiveへ移し、各Ordersと直後の撤退まで封鎖します。全撤退清算時に4→3→2→1と減らし、4回目の後に削除します。冬は減らしません。秋に設置した場合は次年春から有効です。

排除された設置軍は失敗し、装備を消費しません。予約した装備のその後は撤退結果で決めます。結果は`equipmentResults`に対象と理由を含めます。

## 清算と秘密情報

全撤退の結果で生き残らなかった利用軍の予約装備だけを失い、未使用装備は維持します。成功設置の消費は先に済ませます。その後、地面装備の各地域を最終占有する軍のowner inventoryへ追加します。controllerやSC ownerはpickupに使いません。空の地域の装備は無期限に残します。工事・バス・今季イベント一覧を清算し、active封鎖の期限を進めます。

public viewは生成済みイベント、地面装備、active封鎖と残数、勢力別の種類/所持数だけを公開します。inventory instances・reservations・pending辺はそのまま公開しません。private viewは認証済み本人のinstances、予約、秘密命令、合法候補だけです。本人の確定・解除・編集・再接続でも他者に予定経路や対象を配信しません。装備IDを含まない`equipmentResults`を裁定後に公開します。

## 検証と範囲

`events.test.ts`42件、`events-online.test.ts`4件、HTTP起動確認7件を追加しています。既存172件と合わせ225件。ブラウザーは旧19＋新4の23シナリオです。オンラインE2Eだけは専用`tests/browser/server-fixture.ts`の固定seedと装備2種の重みを使い、旧通常移動の回帰にランダム工事を混ぜません。本番`apps/server/main.ts`は同率4種を使い、テスト設定を読みません。工事・バスのブラウザー検証はローカルの同率設定で行います。

設定重み・京都の採用範囲・SC/初期配置・最終同点処理は試遊/決定待ちです。追加イベント、譲渡・取引、装備自然消滅、締切、永続化、観戦、Discord Activityは対象外です。
