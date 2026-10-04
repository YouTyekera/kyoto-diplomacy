# Codex Phase 3A 実装プロンプト
## 3～11人オンライン対戦・秘密命令・区割当・UI微修正

作業開始前に、リポジトリ内の以下を全文確認してください。

1. `spec.md`
2. `README.md`
3. Phase 1 / 1.5 / 2A / 2B の完了報告
4. `PHASE1_5_DECISIONS.md`
5. `PHASE2A_DECISIONS.md`
6. `PHASE2B_DECISIONS.md`
7. `PHASE3A_DECISIONS.md`
8. `docs/RULES_CORE.md`
9. `docs/GAME_CORE.md`（存在する場合）

`PHASE3A_DECISIONS.md` が最新差分です。
既存仕様と矛盾する場合はこれを優先してください。

最初に `PHASE3A_DECISIONS.md` を `spec.md` へ反映し、正本を更新してください。

ゲームデザインはユーザーとChatGPTが行います。
仕様にないゲームルールを独自に追加しないでください。

# 今回のゴール

Phase 2Bまでのローカルゲームを、3～11人が別ブラウザ/別端末から同じroomへ参加して遊べるサーバー権威型オンラインゲームにします。

実装対象:
- room
- 3～11人lobby
- optional希望区
- seeded ward assignment
- inactive wards
- authoritative initial state
- secret orders
- auto Hold on submit
- public ready status
- all-ready auto adjudication
- Retreat/Winter同期
- reconnect
- dynamic SC victory target
- hover region tooltip
- subtle selected region UI

Phase 3A終了後は停止し、イベント・装備・Discord Activityへ進まないでください。

# 1. Serverを追加

既存のrules-core / game-coreを利用するNode.js TypeScript serverを追加してください。

Socket.IOを使用して構いません。

責務:
- RoomManager
- PlayerSession
- WardAssignment
- GameSession orchestration
- Secret submission store
- ready state
- reconnect

クライアントをstate authorityにしないでください。

可能なら:
- `apps/server/`
または既存構造に合う明確なserverディレクトリ

を使用してください。

# 2. Room / Lobby

必要な操作:
- room作成
- short room code発行
- nickname入力
- room code参加
- 希望区: なし or 11区から1つ
- leave before start
- host start

Lobby画面:
- player一覧
- nickname
- connected status
- host
- player count / 11
- 自分自身の希望区
- start可能/不可理由

他人の希望区は表示しなくて構いません。

正式start条件:
- 3 <= connected players <= 11
- 全playerがconnected
- 有効nickname
- host request

2人以下ならUIで「3人以上必要」と表示。

# 3. Seeded ward assignment

`PHASE3A_DECISIONS.md` のアルゴリズムを正確に実装してください。

- optional one preference
- uncontested preference is honored
- contested preference => one requester selected by seeded RNG
- remaining players and wards shuffled by same seeded RNG
- unique assignment
- remaining wards inactive

RNGには再現可能なseeded PRNGを使う。
Math.randomだけに依存しない。

GameSessionへ:
- seed
- player -> ward
- inactiveWards
を保存する。

unit test:
- same seed same result
- different seed can vary
- unique wards
- inactive count = 11 - player count
- collision preferences
- no preferences
- 3 / 11 player cases

# 4. 正式初期GameState生成

現在のmap config / MapDefinitionからonline game initial stateを生成してください。

Active ward:
- enabled regions controller = ward

Inactive ward:
- enabled regions controller = null

SC:
- active wardで `homeWardId === ward` => initial owner ward
- `homeWardId === null` => neutral
- inactive ward内 => neutral

Starting units:
- active assigned wards only
- existing startingUnit configを使う
- inactive ward units are omitted

Preview初期化を正式ゲーム開始処理へ流用しすぎず、専用functionとしてtest可能にしてください。

# 5. Dynamic victory target

Game start時:
`target = 15 + (11 - activePlayerCount)`

表示:
- Lobby start後
- Game header
- 勝利条件説明

3～11人のtableと同値になることをtest。

Game開始後はtarget固定。
disconnect/eliminationで再計算しない。

設定値として構造化し、将来変更しやすくしてください。

# 6. Client/server payload security

Socket eventsとpayloadをTypeScript型 + runtime validationで定義してください。

Room broadcastへ秘密情報を混入しないこと。

Public GameView:
- map public state
- units public positions/owners
- controllers
- SC owners
- year/phase
- player readiness
- connection
- assignment
- last public adjudication result

Private PlayerView:
- own draft/submitted orders
- own legal order options
- own retreat draft
- own winter draft
- reconnect infoは別扱い

他playerのorder/retreat/winter内容は送信しない。

server unit testsで、
`serializePublicState()` 等にsecret orderが存在しないことを確認してください。

# 7. Orders phase UI / Auto Hold

プレイヤーは自分のunitのみ選択できる。

Phase 2A/2Bの命令GUIをできる限り再利用。

「命令書を確定」:
1. 現在未入力の自軍unit countを表示
2. 未入力unitをHoldへ補完
3. server validation
4. finalized=true

確認文例:
`未入力の2軍は待機(Hold)として提出します。`

自分の提出内容はfinalized後も見られる。
他人には見せない。

「確定解除」:
- adjudication開始前なら可能
- finalized=falseへ戻す
- 自分のordersを再編集可能

最後のrequired playerがfinalizeし、serverがphase lockを取得したらunlock拒否。

race conditionを防ぐこと。
複数clientから最後のsubmitが同時に来てもadjudicationは1回だけ。

# 8. Ready panel

Game画面に常時「提出状況」パネルを用意してください。

各player:
- nickname
- ward
- status

Status:
- 入力中
- 確定済み
- 不要
- 切断
- 脱落

命令の中身を示さない。

Civ系の「誰を待っているか」が一目で分かることを目的とする。

現在待機中のplayerを上にまとめる等は技術/UI判断として行ってよい。

# 9. Auto adjudication / phase progression

## Orders
required全員finalized:
- server locks phase
- rules-core adjudicate
- game-core movement/controller apply
- result保存
- if retreats exist => Retreat phase
- else => appropriate SC Update and next phase

## Retreat
dislodged unitsを持つplayersだけrequired。
他はnot-required。

required全員finalized:
- simultaneous resolve
- public result
- SC Update
- next phase

「撤退フェイズ中は交渉禁止」を表示。

## Winter
adjustment required player:
- must finalize

Build余地があるが0buildを選ぶことも許可し、その場合もfinalizeが必要。

adjustment不要player:
- not-required

required全員finalized:
- apply adjustments
- elimination/end-year
- next year or finish

## Result visibility
phaseが進んでも直前のpublic resultを確認できる。
最低限のlog/panelを維持する。

# 10. Reconnect

Server creates:
- playerId
- cryptographically random reconnectToken

Client local storage:
- roomCode
- playerId
- reconnectToken

Reconnect:
- token validation
- same player session restored
- current public state + own private state restored

Never broadcast reconnectToken.

disconnect:
- status=disconnected
- finalized submission remains
- non-finalized player blocks all-ready progression
- no automatic forced Hold

pregame host disconnect:
- transfer host to another connected player deterministically.

No server restart persistence in Phase 3A.

# 11. Hoverで土地名を表示

すべてのgame map modesで共通化してください。

Pointer hover over playable region:
- primary: region name
- secondary: ward name

tooltip:
- cursor近く
- pointer-events:none
- viewport edge clamping
- unit / SC SVG element上でもunderlying region tooltipが出る
- 100～200ms程度までの軽いdelayは可。遅くしない。

hover region:
- very subtle highlight

Touch:
- selected region inspectorで同じ情報を表示。

E2E:
- hover region -> expected name visible
- move away -> hidden

# 12. 選択地域の太い黒枠を廃止

現在画像のような太い黒outlineは使用しない。

selected region:
- slight fill tint/brightness
- thin accent outline approximately 1.5–2px screen-space
- non-scaling stroke
- no thick black border
- original boundaries remain readable

色は既存UI accentから、全勢力色上で識別可能なものを選んでよい。
必要なら細いlight/dark二重strokeも可だが、合計が目立ちすぎないこと。

selected unit/SC:
- small halo or marker emphasis acceptable

Playwright screenshotでselected regionが地図を覆っていないことを確認。

# 13. 開発起動

初心者向けに1～2コマンドでserver + webを起動できるようにしてください。

例:
`npm.cmd run dev:online`

可能ならconcurrently等を追加してよいが、依存ライセンスを確認。

READMEに:
- server port
- web URL
- 同じPCで複数browser/profile/tabを使った3人テスト方法
- LAN内別PCから接続する方法（安全な範囲）
を記載。

Internet公開/deploymentはPhase 3Aで必須ではありません。

# 14. テスト

既存テストを維持。

追加unit/integration:
- room create/join
- cannot start with 2
- starts with 3
- max 11
- ward preference uncontested
- preference collision
- seeded reproducibility
- inactive wards
- formal initial controller/SC/units
- victory target 3..11
- auto Hold
- ready visibility but no secret leakage
- unready before lock
- last ready triggers exactly one adjudication
- Retreat required/not-required
- Winter required/not-required
- reconnect valid token
- reconnect invalid token
- disconnected unready blocks progression
- public serialization contains no secret orders

Browser/E2E:
- 3 browser contexts join same room
- host start
- assignments visible
- ready panel updates
- one player finalizes; others only see status
- final player finalize => auto adjudication
- hover region name
- selected region subtle outline
- reload one browser => reconnect
- old secret orders never appear in other context

E2E can use sample map if full Kyoto map makes setup difficult, but at least one Kyoto config smoke testを行う。

# 15. README / report

README update:
- online dev start
- lobby
- preference
- assignment
- inactive wards
- victory target
- submitting orders
- auto Hold
- ready status
- reconnect
- known limitations

Create:
- `docs/PHASE3A_REPORT.md`

Report:
1. architecture
2. room/lobby
3. ward assignment
4. initial state
5. victory target
6. secret orders
7. ready/auto adjudication
8. reconnect
9. UI hover/selection fix
10. tests/results
11. browser verification
12. known limitations
13. decisions needed before next phase

# 16. 完了チェック

必ず成功させる:
```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
npm.cmd run test:browser
npm.cmd run map:validate
```

server用のintegration test commandを別に作る場合も実行する。

Phase 3B / events / equipment / Discord Activityへ進まないでください。
