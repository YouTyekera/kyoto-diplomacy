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
