# Codex Phase 5C 実装プロンプト
## UI Polish / UX / Game Feel / Non-blocking Results

作業開始前に全文確認:
1. `spec.md`
2. `docs/PHASE5B_REPORT.md`
3. 最新PLAYTESTING
4. 全DECISIONS
5. `UI_UX_GAME_FEEL_GUIDE.md`
6. `PHASE5C_DECISIONS.md`

最新仕様はPHASE5C_DECISIONS。
spec.mdへ反映後に実装。

今回はUI/UX/presentationのみ。
rules-core/game rulesを変更しない。

## A. Result summaryをnon-modal化

現在:
animation -> result summary -> user must close -> controls enabled

変更:
animation -> authoritative board -> current phase controls enabled immediately
                          + non-modal previous result drawer

Requirements:
- result drawer has no full-screen backdrop
- no global pointer-events block
- map/control interaction works while drawer open
- client-local open state
- drawer state never affects ready/server phase
- collapsible chip `前回の裁定`
- Retreat required ribbon independent from drawer

Remove `結果を閉じる` as a required progression action.
A close/collapse action may remain purely visual.

Regression:
- after animation, without closing drawer, retreat can be selected
- without closing, next Orders unit can be selected
- drawer open doesn't intercept unrelated map clicks
- server phase already authoritative

## B. Personalized final result

Remove prominent `GAME OVER` text.

Based on current player's ward:
- sole winner => `勝利`
- shared winner => `共同勝利`
- nonwinner => `第N位`
- spectator/no ward => `対局終了`

Common eyebrow:
`対局結果`

Eliminated badge where relevant.

Test uploaded-log-like case:
current player's ward is sole winner => Victory heading, never GAME OVER.

## C. Create/use design tokens

Implement central token layer.
Do not rewrite every developer tool.
Prioritize player-facing:
- menu
- lobby
- game HUD
- command dock
- event cards
- result drawer
- final result

Typography hierarchy and spacing consistency.

Avoid adding a large UI framework unless clearly necessary.

## D. Command microinteractions

Army select:
- 120–220ms own marker emphasis/lift
- command dock updates immediately

Move/right-click:
- arrow
- one pulse on destination
- summary update
- no blocking animation

Support:
- line draw/pulse
- summary update

Hold:
- lightweight marker

Cancel/change:
- visual order removed/faded immediately

## E. Phase banner

Short 300–600ms banner, nonblocking after entrance.

Use human Japanese labels.

## F. Important gameplay reward feedback

SC capture:
- ring transition
- own +1 SC microfeedback

Enemy initial SC:
- victory-progress pulse

Build/disband:
- simple enter/exit motion

Equipment pickup:
- inventory count pulse

Do not add arbitrary screen shake.
Do not celebrate ordinary successful movement excessively.

## G. Final result presentation

Winner:
- faction-accented hero
- restrained trophy/crown icon
- no mandatory confetti

Others:
- rank-led neutral hero

All:
- final ranking
- reason
- stats
- log download

## H. Optional SFX slots

Keep current audio.
Prepare optional file paths if audio architecture permits:
```
apps/web/public/audio/sfx/select.mp3
apps/web/public/audio/sfx/order-confirm.mp3
apps/web/public/audio/sfx/sc-capture.mp3
apps/web/public/audio/sfx/support-success.mp3
apps/web/public/audio/sfx/standoff.mp3
apps/web/public/audio/sfx/victory.mp3
```

Do not add audio files.
Missing files safe.
Do not fetch external assets.

## I. Performance

Map has ~190 enabled regions.
Do not attach expensive filters/blur to all SVG regions.

Prefer transform/opacity and memoized highlight sets.

## J. Accessibility

- respects reduced motion
- focus-visible
- keyboard escape
- aria-label icon buttons
- no color-only states

## K. Visual regression

Playwright screenshots:
- 1920x1080 main game
- 1280x720 main game
- own unit selected + command dock
- support wizard
- previous-result drawer open while next unit is selectable
- retreat required + drawer open
- winner result
- nonwinner result
- event focus
- neutral SC

## L. Behavior tests

Critical:
1. animation finished + result drawer open => next input works
2. no close requirement
3. current winner sees 勝利
4. current loser sees rank, not GAME OVER
5. shared winner sees 共同勝利
6. spectator sees 対局終了
7. UI state does not affect server phase
8. reduced-motion works
9. missing optional SFX safe

## M. Completion

Run:
```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
npm.cmd run test:browser
npm.cmd run map:validate
```

Create:
`docs/PHASE5C_REPORT.md`

Report:
1. non-modal adjudication result
2. personalized match result
3. design system
4. command microinteractions
5. phase transition
6. SC/build/equipment feedback
7. result visual treatment
8. audio hooks
9. performance
10. accessibility
11. screenshots/tests
12. remaining polish issues

Stop after Phase5C.
