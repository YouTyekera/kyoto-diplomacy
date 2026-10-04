# Codex Phase 5B 実装プロンプト
## 初回試遊UX改善 + 裁定アニメーション + Audio + 少人数勝利条件

最初に以下を全文読んでください。

1. `spec.md`
2. `README.md`
3. Phase 1～5A.1 の完了報告
4. 全DECISIONS
5. `docs/PLAYTESTING.md`
6. `docs/EVENTS_AND_EQUIPMENT.md`
7. `PHASE5B_DECISIONS.md`

最新差分は `PHASE5B_DECISIONS.md`。
最初にspecへ反映してください。

今回は初回対人試遊で出たUX問題を直します。
Discord Activity/public deployment/大規模美術刷新へ進まないでください。

# A. Playtest fixture / regression

今回の3-player logで使われた実京都設定または既存Phase5A.1京都fixtureを用いて、
最低限3人相当の盤面密度でE2E/visual testを行ってください。

# B. Event locator

Current Events card componentを改善。

各eventのregionId/edgeをMapDefinitionで表示名へ変換。
region名だけでなくward名も表示。

Hover:
- endpoint highlight

Click / `地図で見る`:
- MapCanvas cameraへfocus request
- pan/zoom
- pulse

MapCanvasにimperative refまたはcamera state APIを追加してよいが、
React stateを不必要に二重管理しない。

Roadwork edge / Bus edge / Barricade edgeはfocus中に明瞭化。

Test:
- roadwork card click => correct two regions in viewport
- event card hover => endpoints highlighted
- no raw region IDs in player card

# C. Own Army identity

Online/Local game viewでcurrentPlayerWardIdが分かる場合:
- ArmyMarkerへisOwnUnit
- own-specific halo/double outline
- no YOU text spam

Top HUD:
`あなた: <ward name>` + color swatch

E2E:
own pin distinguishable by class/data attribute and screenshot.

# D. Right-click Move

Map playable regionsへcontextmenu handler。

When:
- orders phase
- own unit selected
- normal selection state
- legal move target

=> prevent default + set Move order。

Support/Bicycle/Barricade wizard中はそのwizard semanticsを優先し、
通常right-click Moveを発火しない。

Invalid:
- no state mutation
- brief user-facing explanation

Unit test + E2E:
- select own unit
- right-click legal region
- Move order appears
- browser menu not shown
- invalid target unchanged

# E. Two-hop preview

Map selection stateへ:
- primary legal moves
- secondary adjacency of hovered primary

secondary uses current effectiveAdjacency。

UI label:
`次の一歩の参考（現在の通行条件基準）`

future guaranteeの表現禁止。

Bicycle wizardでは同じvisual primitivesをactual second-leg selectionへ再利用。

# F. Support wizard

既存Support操作をplayer-facing UIで置換/改善。

State machine例:
```ts
idle
support-select-unit
support-select-kind
support-select-destination
```

Step 1:
candidate target unitsをMap上でhighlight。

Step 2:
buttons:
- 現在地を守る
- 移動を支援する

Support Move:
destination = intersection(
  targetUnit legal move destinations,
  supporter support-reachable destinations
)

Own target has current Move:
- show recommended current destination
- one-click apply

Foreign target:
- NEVER read/show private order
- user manually selects intended destination

Submit same existing SupportHold/SupportMove order types.
rules-core remains authoritative.

Natural language order summary.

Tests:
- support hold
- support own move
- support foreign intended move without leaking foreign order
- cancel
- invalid destination unavailable

# G. Adjudication Presentation data

Before authoritative apply overwrites display position,
construct or retain presentation snapshot.

Need:
- unit origin
- intended destination
- success/fail
- support lines
- standoff
- dislodgement
- final destination

Do not change adjudication outcome.

Public result is already allowed after resolution; use that.

# H. Animation

Create client presentation component/layer.

Default total about 3–4 seconds, config value.

Successful Move:
- slide origin -> destination

Failed Move:
- slide toward destination 35–45%
- return origin

Support:
- dashed/pulsing line

Standoff:
- destination flash

Dislodged:
- shake / short knockback indicator

All move animations start from same presentation stage.
Do not serialize movement by unit order.

Button:
`スキップ`

Accessibility:
- respect prefers-reduced-motion: reduce/disable movement but still show result sequence

Reconnect:
- if presentation is stale, show authoritative final board.

# I. Audio integrated with presentation

Do NOT require separate audio-only phase.

Folders:
```text
apps/web/public/audio/bgm/domestic.mp3
apps/web/public/audio/bgm/adjudication.mp3
apps/web/public/audio/sfx/march.mp3
```

If files absent => silent safe.

Audio manager:
- domestic during planning/retreat/winter
- adjudication during presentation
- crossfade
- don't restart domestic on every phase
- march one grouped SFX during unit slide
- stop march on skip/end

Settings:
- BGM enable/volume
- SFX enable/volume
- localStorage

No third-party audio.

# J. Neutral SC appearance

SupplyCenterMarker:
- owner color derived ONLY from `supplyCenterOwnerWardId`
- null => neutral white/light + neutral dark border
- no controller color
- owned => owner ring

Tooltip owner.

Regression:
neutral SC inside colored controlled region remains visually neutral.

Preserve Phase5A.1:
same radius/stroke with/without Army.

# K. Instant victory conquest requirement

Game start snapshot must record initial SC owner for each SC after active/inactive assignment.

Add setting:
`requiredRivalInitialSupplyCentersForInstantWin: 2`

At Spring/Autumn SC Update:
instant supply victory only if:
- ownedSC >= victoryTargetSC
- currentlyOwnedRivalInitialSC >= required

Rival initial SC:
- initial owner exists
- initial owner is another ACTIVE player
- not current player's own initial SC
- not inactive ward
- not neutral

Same rival may contribute 2.

Max-year/elimination end ranking:
- unchanged
- no conquest requirement

HUD:
- SC progress
- rival initial SC progress

Match log:
- progress snapshot

Tests:
- target reached but 0 rival => no instant finish
- target +2 rival => finish
- 2 neutral do not count
- inactive ward initial SC does not count
- own initial SC does not count
- two from same rival count
- maxYears winner ignores requirement

# L. Telemetry

Extend log summary:
- support hold/move count
- rival initial SC counts
- neutral SC counts
- presentation skipped count
- optionally right-click move aggregate

Do not log mouse coordinates or unnecessary behavior traces.

# M. Existing rule preservation

Do not modify:
- rules-core adjudication semantics
- SC capture timing
- controller persistence
- event generation rules
- equipment rules
- build/disband semantics

# N. Browser verification

Manually/E2E verify in actual Kyoto map:

1. Roadwork card -> click -> map focuses correct edge
2. own units obvious
3. left select + right click Move
4. hover a destination -> secondary adjacency visible
5. Support wizard is understandable
6. 3 clients finalize -> adjudication animation, march SFX if file exists
7. failed move visibly bounces
8. neutral SC in own territory is neutral marker
9. target-only does not instantly win without rival SC2
10. result remains server-authoritative

# O. Completion checks

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
npm.cmd run test:browser
npm.cmd run map:validate
```

# P. Report

Create `docs/PHASE5B_REPORT.md`:

1. playtest evidence addressed
2. event locator
3. right-click move
4. own-unit indication
5. two-hop preview
6. support wizard
7. adjudication presentation
8. Audio/BGM/SFX integration
9. neutral SC UI
10. victory condition
11. telemetry
12. tests
13. manual browser verification
14. remaining UX issues

Stop after Phase 5B.
