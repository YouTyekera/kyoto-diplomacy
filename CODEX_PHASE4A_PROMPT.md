# Codex Phase 4A 実装プロンプト
## 起動確認バグ修正 + 公開イベント + 装備 + 自転車 + バリケード

作業開始前に以下を全文読んでください。

1. `spec.md`
2. `README.md`
3. Phase 1 / 1.5 / 2A / 2B / 3A / 3B の完了報告
4. 全DECISIONSファイル
5. `docs/RULES_CORE.md`
6. `docs/GAME_CORE.md`
7. `docs/ONLINE_CORE.md`
8. `PHASE4A_DECISIONS.md`

`PHASE4A_DECISIONS.md` が最新差分です。
既存仕様と矛盾する場合はこれを優先してください。

最初にPHASE4A_DECISIONSをspec.mdへ反映して正本を更新してください。

ゲームデザインはユーザーとChatGPTが決定します。
仕様にないイベント・ルールを独自追加しないでください。

# A. 最初にdev:onlineのfalse negativeを修正

イベント実装前に、Windows実機で確認された起動確認不具合を修正してください。

症状:
- Vite: `http://127.0.0.1:5174/` ready
- server: `http://127.0.0.1:3001` 起動ログ
- 直後にwrapperが「起動完了を確認できませんでした」で非0終了

## A-1 調査
確認:
- scripts/dev-online.mjs
- scripts/online-startup.mjs
- server health endpoint
- child stdout/stderr
- timeout
- Windows spawn/exit判定

再現:
- 5173 occupied
- 3001 free
- npm.cmd run dev:online

## A-2 成功判定
ログ文字列ではなくHTTPを正とする。

- backend `/health` => HTTP 200
- frontend chosen Web URL => HTTP成功/HTML応答

poll:
- 100～250ms
- timeout 10～15秒程度

両方HTTP成功なら起動成功。
内部log flagだけを理由に終了しない。

## A-3 失敗診断
timeout時:
- selected Web/Server port
- process running/exited/exitCode
- last Web probe error
- last Server probe error
- timeout
を日本語表示。

START_ONLINE.cmdでも正常起動を失敗扱いしないこと。

## A-4 test
- 5173 occupied + 3001 free => fallback Web + server success
- log readyが先でもHTTP遅延を待てる
- Webだけfailure
- serverだけfailure
- both HTTP success => success
- timeout cleans child processes

この修正が通ってからイベント作業へ進んでください。

# B. Event / Equipment model

既存GameSessionStateへ以下を追加する。

概念例:
```ts
type EquipmentType = 'bicycle' | 'barricade'

type EquipmentInstance = {
  equipmentId: string
  type: EquipmentType
  ownerWardId: string
}

type GroundEquipment = {
  equipmentId: string
  type: EquipmentType
  regionId: string
  spawnedYear: number
  spawnedSeason: 'spring' | 'autumn'
}

type BarricadeEdge = {
  barricadeId: string
  a: string
  b: string
  ownerWardId: string
  remainingMovementSeasons: number
}

type SeasonalEvents = {
  groundEquipment: GroundEquipment[]
  roadworkEdges: EdgeKey[]
  temporaryBusEdges: EdgeKey[]
}
```

正確な型は既存architectureへ合わせて改善してよい。

重要:
- inventoryはplayer/ward所有。
- permanent carrier unitは持たない。
- unique equipmentId。
- same equipmentId cannot be reserved twice。

runtime validationを追加。

# C. Effective adjacency

pure functionを作る。

例:
```ts
buildEffectiveAdjacency(
  baseAdjacency,
  activeBarricades,
  roadworkEdges,
  busEdges
)
```

- remove barricades
- remove roadworks
- add bus
- symmetric
- deterministic
- no mutation

Orders legal candidates / validation / adjudication / Retreatはそのseasonのeffective mapを使う。

rules-coreをイベントごとにforkしない。

# D. Event generation

Spring/Autumn Ordersへ入る直前にserver/game-coreで生成。

event count:
- 3～5 => 1
- 6～8 => 2
- 9～11 => 3

same type max 1 per season。

types:
- bicycle spawn
- barricade spawn
- roadwork
- temporary bus

weightsはconfig化しdefault equal。

seeded deterministic RNG。
Math.random禁止。

候補がないtypeはskipし、残りtypeから決定的に選び直す。
必要件数を満たせない場合は生成可能件数で続行し、errorにしない。

# E. Equipment spawn and pickup

## E-1 spawn
bicycle/barricade:
- playable
- non-SC
- empty
- no ground equipment
- non-impassable

frontline priorityはDECISIONSに従う。
fallbackあり。

## E-2 pickup
movement + retreats完了後、SC update前。

occupied ground item:
- remove from ground
- add inventory to unit owner ward

unoccupied:
- remain indefinitely

Retreat arrival can pickup。

# F. Equipment inventory / reservation

Public:
- each ward's inventory type/count

Private:
- current season equipment assignment/reservation

When player selects an equipment order:
- reserve exactly one equipmentId to exactly one unit/order
- same instance cannot be assigned twice

If assigned unit survives movement/retreat:
- persistent bicycle returns to inventory availability next season
- failed barricade returns if not consumed

If assigned unit is finally destroyed in retreat/disband as a consequence of that movement phase:
- assigned equipment instance is destroyed

Unassigned inventory is unaffected by unit destruction.

# G. BicycleMove

Implement per PHASE4A_DECISIONS.

Order type:
```ts
BicycleMove {
  unitId
  viaRegionId
  destinationRegionId
  equipmentId
}
```

Validation:
- inventory owns bicycle
- one BicycleMove max per ward per movement season
- equipmentId unique reservation
- A-B and B-C in effective adjacency
- no support received
- no support order from that unit

## first leg
Resolve A->B with normal simultaneous orders.
Bicycle attack cannot receive support.

Need integrate with normal adjudication carefully:
- do not sequentially move it before other units
- first leg participates in same simultaneous movement resolution.

## second leg
Only successful first-leg bicycles participate.
Resolve all B->C simultaneously from post-first-leg board.
No support.

Use rules-core or a small second-stage adjudicator built from same deterministic strength/standoff principles.
Do not use arrival order.

Return explanatory result for both legs.

# H. DeployBarricade

New order:
```ts
DeployBarricade {
  unitId
  targetRegionId
  equipmentId
}
```

Validation:
- own unit
- owns barricade
- one DeployBarricade max per ward per movement season
- same equipment not reserved twice
- target is base-adjacent permanent edge
- not bus-only edge
- no existing active barricade on edge
- edge removal with next-season persistent barricades must not split graph

Movement adjudication:
- unit remains in place
- counts as holding for defense
- can receive Support Hold
- cannot Move/Support

After movement:
- if not dislodged => deployment succeeds
- consume barricade
- create pending barricade that activates NEXT movement Orders
- if dislodged => deployment fails and item remains reserved until retreat outcome
- if retreat survives => return to inventory
- if destroyed => item lost

Active duration:
4 movement seasons.
Orders + associated Retreat.
decrement after each Retreat resolution.
expire after fourth.

# I. Roadwork

Season event.

candidate base edge:
- playable
- no active barricade
- not duplicate
- removing edge doesn't disconnect persistent graph
- prefer border edge of different controllers
- fallback

active during current Orders+Retreat.

Remove edge from effective adjacency.

# J. Temporary Bus

Season event.

candidate pair based on base adjacency:
- nonadjacent
- playable
- shortest path 2 or 3
- prefer different controller / neutral
- fallback

active during current Orders+Retreat.

Add edge to effective adjacency.

# K. Interaction tests

Must explicitly test:

## effective graph
- roadwork blocks move/support/retreat/bicycle
- barricade blocks same
- bus enables move/support/retreat/bicycle
- event expiry restores base adjacency
- barricade countdown 4 seasons

## bicycle
- first leg failure stays A
- first success, second success -> C
- first success, second bounce -> B
- turns are allowed
- support cannot help bicycle
- max one bicycle unit per player
- one bicycle item not used by two units
- persistent bicycle not consumed
- assigned bicycle destroyed if user unit ultimately destroyed

## barricade
- one unit uses order for the season
- max one barricade deployment per player
- item cannot be double-reserved
- can receive support-hold
- dislodged => no barrier
- retreat survival => item retained
- destruction => item lost
- success => item consumed
- activation starts next movement season
- cannot block graph bridge
- cannot target bus-only edge
- even with 2+ barricade inventory, cannot have two DeployBarricade orders same season

## equipment
- pickup after movement
- pickup after retreat
- uncollected stays
- no spawn on SC/occupied/item region

## event generation
- 3/5 =>1; 6/8=>2; 9/11=>3 boundary cases
- no duplicate event type same season
- deterministic seed
- no candidate fallback
- no infinite reroll

# L. Online secrecy / ready flow

Orders phase private view must support new equipment orders.

Public before adjudication:
- current public events
- ground items
- inventory type/count
- active barricades/duration

Private:
- bicycle route
- barricade target edge
- equipment reservation

Ready panel behavior unchanged.
Auto Hold:
- only units without any order get Hold
- BicycleMove / DeployBarricade count as submitted order
- never add Hold to an equipment-order unit

All-ready auto adjudication must remain exactly-once.

# M. UI

Do not over-polish.

Add:
- Current Events panel
- Ground equipment marker
- Roadwork edge marker
- Bus edge line
- Barricade edge + remaining seasons
- inventory count

Order UI:
- if bicycle available -> Bicycle Move option
- if barricade available -> Deploy Barricade option
- only legal via/destination/edge clickable
- explain why unavailable where practical

Map hover/name/selection behavior from Phase3A/3B remains.

# N. Local annual progression

Events/equipment must also work in the local annual progression mode so the user can test alone.

Do not require online room to test them.

Use same event generation/core functions as online.
Avoid duplicating event rules in React.

# O. README / docs

Update README:
- event timing
- event count by players
- 4 event types
- equipment inventory
- pickup
- BicycleMove
- Barricade duration
- Roadwork
- Bus
- startup bug fix

Create:
- `docs/EVENTS_AND_EQUIPMENT.md`
- `docs/PHASE4A_REPORT.md`

Document unresolved/balance settings as configurable rather than hardcoded game truth.

# P. Completion checks

All existing checks plus new tests:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
npm.cmd run test:browser
npm.cmd run map:validate
```

Also reproduce:
- existing 5173 occupied
- `npm.cmd run dev:online`
- actual ONLINE GAME URL displayed
- process continues running until Ctrl+C
- HTTP frontend/backend healthy

Browser E2E:
- local event generation
- online 3-player room event visibility
- equipment pickup
- bicycle order secrecy and resolve
- barricade install and next-season block
- roadwork block
- bus temporary connection

Phase 4B / Discord Activityへ進まないでください。

# Q. Completion report

Japanese report:
1. startup false-negative root cause/fix
2. event architecture
3. equipment ownership/reservation
4. bicycle
5. barricade
6. roadwork
7. temporary bus
8. RNG
9. online secrecy
10. local test mode
11. UI
12. tests/results
13. browser verification
14. known limitations / balance TODO
15. decisions needed before next phase
