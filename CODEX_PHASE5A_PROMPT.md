# Codex Phase 5A 実装プロンプト
## プレイヤー向けUI/UX整理 + Room導線 + BGM基盤

最初に以下を全文確認してください。

1. `spec.md`
2. `README.md`
3. Phase 1～4B の完了報告
4. 全DECISIONS
5. `docs/PLAYTESTING.md`
6. `PHASE5A_DECISIONS.md`

最新差分は `PHASE5A_DECISIONS.md` です。
最初にspec.mdへ反映してください。

今回はゲームルールを一切変更しません。
UI/UXと音声基盤に集中してください。

# A. 現状調査

まず現在のroutes/componentsを整理し、
- player-facing
- developer tools
- shared map UI
を一覧化してください。

既存機能を削除せずにplayer-facing flowだけ整理します。

# B. Main Menu

プレイヤー向けトップ:
- オンライン対戦
- ローカルで試す
- 設定

Developer tools:
- 地図エディタ
- Game Preview
- Rules Sandbox

を別セクションへ。

# C. Lobby

first viewportで必ず見えるRoomCardを作成。

大きく:
`ルームコード ABC123`

actions:
- コードをコピー
- 招待リンクをコピー

表示:
- Host
- LOCAL/LAN connection scope
- player count
- scenario
- enabled regions / SC / initial units
- max years
- victory target

localhost invite copy時はlocal-only注意。

query param等で `?room=ABC123` を受け、
Online join formへ自動prefillしてください。

# D. Scenario identity

現在roomで実際に利用しているscenario情報を目立つ場所へ表示。

fixtureと実MapConfig取り違え防止。

server public room stateに不足フィールドがあれば、
秘密情報を含めず追加してください。

# E. Game layout

player-facing Game screenを再構成。

TopBar:
- year/season/phase
- own ward
- own SC/target
- units
- ready
- room chip
- audio/settings

Map:
- central dominant area

Side HUD:
- current events
- recent result
- player ready list
- inventory

Bottom ActionBar:
selected own unit only:
- Hold
- Move
- Support
- Bicycle
- Barricade

合法対象はMap上でhighlight。
非合法項目を長いselect/listで選ばせない。

Existing command generation/server validation must remain authoritative.

# F. Internal/dev data

通常player screenから:
- raw region id
- ward numeric id
- hashes全文
- debug reason code
- developer validation object
等を隠す。

必要ならdev mode/detail disclosureへ残す。

# G. Selection / hover regression

既存:
- hover region name
- subtle selected region
- army pin
- SC circle
を維持。

太い黒outlineを復活させない。

# H. Design tokens

CSS variablesまたはtheme objectへUI tokenをまとめる。

日本語system font stackを採用し、
見出し/本文/補助textのsizeとweightを整理。

勢力色は変更せず、UI chromeをneutral化。

過剰なgradient/animationは不要。

# I. AudioProvider

Global audio managerを追加。

推奨:
- `apps/web/src/audio/AudioProvider.tsx`
- `apps/web/src/audio/bgm-manifest.ts`
- `apps/web/public/audio/bgm/`

slots:
- title
- lobby
- game
- result

manifest srcが空/未配置でもgraceful。

Rules:
- title route => title
- lobby => lobby
- active game all phases => game
- game over => result

game phase transitionごとにrestartしない。
route context単位で管理。

fade 0.5～1.5sec程度。

browser autoplay:
- first user interactionでunlock
- blockedはcrash/error modalにしない

settings:
- music enabled
- music volume
localStorage persistence.

# J. BGM placeholders

実BGMファイルがまだrepoにない場合、
著作権素材やダミー音源を勝手に追加しない。

manifestへコメント付きの未設定slotを作るか、
無音で動作させる。

READMEへユーザーが置く場所を明記:
`apps/web/public/audio/bgm/`

対応形式の説明はブラウザ一般に合わせて簡潔に記載。
MP3等のWeb向け圧縮音声を推奨してよい。

# K. Activity-ready responsive

Discord SDKは導入しない。

ただし:
- 1280x720でusable
- sidebars collapsible
- map remains central
- no mandatory browser chrome
- touch/compact basic fallback

Playwright viewport testを追加。

# L. 現在の「オンライン」の表現

127.0.0.1 / localhostなら画面で:
`LOCAL / このPCのみ`

private LAN addressで起動した場合:
`LAN`

公開HTTPS判定は単純化しすぎない。
Phase 5AではPUBLIC hostingを実装しないため、
unknown hostはgeneric network表示でもよい。

「オンライン対戦」というゲームモード名は維持してよいが、
接続範囲を必ず併記する。

# M. Tests

既存全テスト維持。

E2E追加:
- title flow
- room code visible
- invite copy/prefill
- local scope badge
- scenario summary
- 3 player ready UI
- own unit action bar
- no raw debug clutter in player game screen
- 1280x720
- 1920x1080
- audio setting persists
- missing music safe
- game BGM context does not restart each phase
- result BGM context on finish

# N. README / Report

README:
- PLAYER flow
- LOCAL vs LAN vs PUBLIC distinction
- room code/invite
- BGM folder
- manifest
- audio settings
- Activity is future work

Create:
`docs/PHASE5A_REPORT.md`

Report:
1. before/after information architecture
2. lobby room code
3. invite flow
4. game HUD
5. command UX
6. typography/tokens
7. BGM architecture
8. audio file placement
9. responsive
10. tests
11. remaining UI issues
12. next recommended step: public deployment or Discord Activity

Phase 5B/Discord Activityへ進まないでください。
