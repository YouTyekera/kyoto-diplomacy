# Codex Phase 6C 実装プロンプト

作業前に確認:
- spec.md
- docs/PHASE6B_REPORT.md
- 最新PLAYTESTING
- 全DECISIONS
- PHASE6C_DECISIONS.md

Phase 6Cは公開前の小規模UI整理です。
ゲームルール・server裁定・MapConfig・KMLを変更しないでください。

最初にPHASE6C_DECISIONSをspecへ反映。

実装:
1. 全域表示付近の中立補給拠点markerをsemantic zoomで約70%へ縮小。
   クリックhit targetは縮めない。
2. player-facing UIから `SC` 略称を撤去し、`補給拠点` に統一。
   内部field名は変更しない。
3. 全player-facing日本語を棚卸しし、不自然・直訳調・開発者向け表現を修正。
   特に
   `全撤退後の占有軍が取得`
   を
   `撤退処理が終わった時点で、その地域にいる軍の勢力が装備を獲得します。`
   にする。
4. Top HUDから開けるnon-modalの勝利条件drawerを追加。
   現在のvictoryTarget、requiredRival、maxYears、脱落条件をGameSessionから動的表示。
5. 最大ズームアウトを `全域を表示` fit + 3〜5%安全余白にclamp。
   wheel、minus button、resize後すべてで効くこと。
6. `全プレイ範囲` 等の日本語も自然な表記へ整理。

必須:
- player-facing文字列にSC略称が残っていないことをtest
- normal/wide neutral supply marker visual regression
- clickability維持
- zoom-out clamp E2E
- rule drawer values E2E
- drawer open while map remains interactive

実行:
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test
npm.cmd run build
npm.cmd run test:browser
npm.cmd run map:validate

docs/PHASE6C_REPORT.md を作成。
Phase 6C完了後は停止。公開デプロイへ自動で進まないこと。
