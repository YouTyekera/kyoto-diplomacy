# Codex Phase 7A 実装プロンプト — Render Free 公開URL化

Phase 6C完了後に実行してください。

最初に:
- spec.md
- README
- docs/PHASE6C_REPORT.md
- docs/PHASE6B_REPORT.md
- online/server architecture docs
- package.json / workspace config
- PHASE7A_RENDER_DEPLOYMENT.md
を確認。

目的:
React/Vite frontendとNode/Socket.IO backendを
友達がインターネットからHTTPS URLで遊べる状態にする。

採用:
- Render Static Site Free: frontend
- Render Web Service Free: backend
- GitHub
- render.yaml

ゲームルールは変更しない。

実装:
1. backend production entryをRender対応:
   - process.env.PORT
   - host 0.0.0.0
   - /health
   - exact production CORS origin
   - SIGTERM graceful shutdown
2. frontendへproduction backend URL envを導入。
   localhost hardcodeを除去。
3. Socket.IO reconnect/backoffをproduction向けに確認。
4. backend health/wake UI:
   - server sleeping/waking/retrying/online
   - raw connection errorsを直接見せない
   - wake中もfrontendは操作説明を表示
5. invite URLはfrontend public originを使う。
6. productionではLOCAL/LANではなく公開サーバー表示へ。
7. root render.yamlを作成:
   - frontend static site
   - backend free web service
   - healthCheckPath
   - pinned runtime assumptions
   実際のnpm scriptsを調べた上で正しいbuild/start commandsを設定。
8. Node major versionとlockfileによる再現性を確保。
9. production security:
   - debug endpoint非公開
   - reconnect tokenをlogへ出さない
   - CORS wildcard禁止
   - client secretをbundleしない
10. READMEへ初心者向けRender公開手順を書く。
11. 本番公開後に不用意な自動更新を避ける方法として
    autoDeployTrigger off / checksPass の説明を加える。

重要:
- 永続DBを勝手に導入しない。
- Render Free Postgresを長期データ保存前提にしない。
- server restartでroomが失われる現行制約はREPORTへ明記。
- Discord Activityには進まない。

検証:
- lint/typecheck/test/build/test:browser/map:validate
- production buildでlocalhost参照なし
- CORS test
- WebSocket public-origin integration test
- health/retry UI test

作成:
docs/PHASE7A_REPORT.md
docs/DEPLOY_RENDER.md

REPORTに:
- architecture
- public URL env
- Render config
- security
- cold start behavior
- reconnect
- tests
- known limitation: in-memory room
- exact manual deploy steps

Phase 7Aで停止。
