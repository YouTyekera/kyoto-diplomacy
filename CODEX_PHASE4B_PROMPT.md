# Codex Phase 4B 実装プロンプト
## 試遊可能版の完成 — シナリオ読込・終了規則・Game Over・Match Log

作業開始前に以下を全文読んでください。

1. `spec.md`
2. `README.md`
3. Phase 1 / 1.5 / 2A / 2B / 3A / 3B / 4A の完了報告
4. 全DECISIONSファイル
5. `docs/RULES_CORE.md`
6. `docs/GAME_CORE.md`
7. `docs/ONLINE_CORE.md`
8. `docs/EVENTS_AND_EQUIPMENT.md`
9. `PHASE4B_DECISIONS.md`

`PHASE4B_DECISIONS.md` が最新差分です。
既存仕様と矛盾する場合はこれを優先してください。

最初にPHASE4B_DECISIONSをspec.mdへ反映し正本を更新してください。

ゲームデザインはユーザーとChatGPTが決定します。
Phase 4Bでは新規イベントやUI美術を独自追加しないでください。

# A. 正式シナリオJSONをオンラインLobbyへ読み込む

Host-onlyで「シナリオJSONを読み込む」を追加。

入力はPhase 1地図エディタが保存するMapConfig JSON。

flow:
1. browser file input
2. client runtime parse（UX用）
3. serverへ送信
4. server runtime validation
5. server KML/source datasetとcompile
6. MapDefinition validation
7. room scenarioとして固定

Clientだけでcompile結果を正本にしない。

Room public state:
- scenarioName
- scenarioHash
- enabled regions
- total SC
- total starting units
- preflight errors/warnings count

Game start後scenario変更不可。

# B. Preflight

PHASE4B_DECISIONSのhard error/warningを実装。

Server-side pure function:
`validateScenarioForOnlinePlay(...)`

11区すべてがrandom assignment候補なので、
player countが3でも「どの区がactiveになっても破綻しない」よう11区全てのstarting unit/SC/enabled regionをhard validationする。

# C. maxYears = 5

Game settingsへ:
- maxYears default 5

online game start時にsnapshotしてGameSessionへ固定。
local annual modeも同じdefault。

UI header/lobbyへ:
`規定年数: 5年`
を表示。

configurable structureにする。

# D. End rulesをgame-coreへ一本化

純粋関数化してserver/local共用。

優先:
1. SC update後 target victory
2. Winter後 new elimination => end
3. Winter後 year >= maxYears => end
4. continue

Target:
- multiple players >= target => highest SC
- highest tie => shared winners

Elimination:
- Winter後new eliminatedが1人以上 => game ends that winter
- highest SC wins
- tie => shared

Max years:
- Year5 winter => highest SC
- tie => shared

Ranking:
12,12,10 => rank 1,1,3

No secondary tiebreak.

# E. Finished game

GameSession:
```ts
status: 'playing' | 'finished'
endResult?: {
  reason
  year
  season
  winners
  standings
}
```

finished:
- order/retreat/winter submission rejected
- reconnect allowed
- board/result view allowed
- log export allowed

# F. Match telemetry

Create structured logging layer.

Record:
- game start
- phase start
- player finalized timestamp
- adjudication complete
- retreat complete
- SC update
- equipment pickup
- event generation
- winter adjustment
- elimination
- game end

Resolved orders:
- final submitted orders only after adjudication
- never draft revisions

Derive:
- Orders phase duration
- per-player finalize elapsed seconds

# G. Match log export

Sanitized JSON:
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

Must exclude:
- reconnectToken
- socket IDs if not needed
- draft history
- secret pre-resolution reservations

Host button:
`試遊ログをダウンロード`

Game Over screen also exposes download.

# H. Game Over screen

All clients see:
- GAME OVER
- winner(s)
- reason
- ended year
- target SC
- rank/player/ward/SC/controlled regions/units

Playtest summary:
- average Orders duration
- standoff total
- dislodgement total
- event counts
- bicycle pickup/use
- barricade pickup/deploy
- roadwork count
- bus count

Functional only; do not over-polish UI.

# I. Local annual mode

Reuse same:
- end evaluator
- ranking
- summary helpers

No separate React rule logic.

# J. Tests

Keep all existing tests.

Add:
- valid scenario upload/compile
- malformed JSON
- hard validation
- warning-only start
- target > SC total
- spring target
- autumn target
- multiple threshold different/tie
- elimination end
- year5 end
- 1,1,3 ranking
- submission rejected after finish
- telemetry privacy
- log schema
- final summary consistency

E2E:
- 3 clients
- host loads scenario fixture
- preflight
- start
- reach Game Over with small test fixture
- same standings on all clients
- download JSON
- no credential in JSON

At least one smoke test must compile actual Kyoto 227 source with saved test MapConfig fixture.

# K. README / docs

README:
- editor MapConfig export
- Host scenario load
- preflight
- provisional 5-year rule
- end reasons
- shared ties
- match log

Create:
- `docs/PLAYTESTING.md`
- `docs/PHASE4B_REPORT.md`

PLAYTESTING must explain:
1. START_ONLINE.cmd
2. host room
3. load scenario JSON
4. invite 3+ players
5. check warnings
6. start
7. play
8. download log
9. what screenshots/files to send ChatGPT after test

# L. Completion checks

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
npm.cmd run test:browser
npm.cmd run map:validate
```

Also confirm START_ONLINE.cmd remains healthy.

# M. Completion report

Japanese:
1. scenario loading
2. preflight
3. maxYears/end rules
4. Game Over
5. telemetry/log
6. online behavior
7. local reuse
8. tests/results
9. exact first-playtest steps
10. known limitations
11. what data to collect from first human playtest

Phase 5 / Discord Activity / UI polishへ進まないでください。
