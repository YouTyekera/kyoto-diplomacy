# Phase 3A 仕様差分 — オンライン対戦基盤・区割当・秘密命令・UI微修正

Status: Phase 3A 実装前の決定事項
Date: 2026-10-03

この文書は既存の `spec.md`、Phase 1.5 / 2A / 2B の決定事項に対する追加・変更である。
矛盾する場合、この文書を優先する。
Codexは実装開始前にこの内容を `spec.md` へ反映すること。

## 1. Phase 3Aの目的

Phase 2Bまでのローカルゲームを、3～11人がブラウザから同じルームへ参加して遊べるサーバー権威型オンラインゲームへ拡張する。

Phase 3Aの中心:
- ルーム作成・参加
- 3～11人
- 行政区の割当
- 欠場区の中立化
- 秘密命令
- 提出状況の公開
- 全員提出時の自動裁定
- Retreat / Winterのオンライン同期
- 再接続
- 動的SC勝利目標
- 地域名hover
- 選択地域UIの改善

イベント・装備・自転車はまだ実装しない。

## 2. プレイヤー人数

正式なゲーム開始可能人数は3～11人。

- 2人以下では正式ゲームを開始できない。
- 12人以上は参加できない。
- 開発用fixtureやrules-core単体テストでは人数制限を適用しなくてよい。

参加人数を `activePlayerCount` とする。

## 3. 行政区割当

京都市の11行政区を最大11勢力として利用する。

### 3.1 基本はランダム

各プレイヤーは1つの任意の「希望区」を提出できる。

- 希望なしも可能。
- 希望は保証されない。
- Phase 3Aでは希望は1人1区まで。順位付き複数希望は将来拡張。
- 他プレイヤーの希望内容をロビーで公開する必要はない。

### 3.2 割当アルゴリズム

サーバー側のRNG seedを用い、決定的に再現可能な割当を行う。

1. 希望区ごとに希望者をまとめる。
2. その区を希望したプレイヤーが1人だけなら、そのプレイヤーへ割り当てる。
3. 同じ区を複数人が希望した場合、その希望者の中からseed付き乱数で1人を選び、その区へ割り当てる。
4. 希望で割り当てられなかったプレイヤーと希望なしプレイヤーをseed付きでshuffleする。
5. 残りの未割当行政区もseed付きでshuffleし、1対1でランダム割当する。
6. 最後まで誰にも割り当てられなかった行政区を「無所属区」とする。

同じseed・同じ参加者・同じ希望入力からは同じ割当結果を再現できること。

### 3.3 無所属区

11 - activePlayerCount 個の区が無所属になる。

無所属区:
- プレイヤーなし
- startingUnitなし
- その区に属するenabled regionの初期controllerはnull
- その区内のSCの初期ownerはnull
- 地域は通常通り侵入・支配可能
- mapから削除しない

## 4. 正式ゲーム開始時の初期状態

### 4.1 controller

プレイヤーが割り当てられた行政区について:
- その行政区に属するenabled regionの初期 `controllerWardId` をその行政区にする。

無所属区:
- 初期 `controllerWardId = null`

### 4.2 SC所有者

SCの `homeWardId` は「ホーム領域」ルールには使用しないが、既存シナリオの初期SC所有者メタデータとしてPhase 3Aでは利用する。

- activeな区にあるSCで、`homeWardId` がその区なら、その区を初期ownerとする。
- `homeWardId = null` のSCは、active区内であっても中立開始。
- 無所属区のSCは `homeWardId` があっても中立開始。

将来は `initialSupplyOwnerWardId` のような専用フィールドへmigrationしてよいが、Phase 3Aで既存JSONを破壊しない。

### 4.3 初期ユニット

- activeな区の `startingUnit.ownerWardId` に一致する初期軍だけを配置する。
- 無所属区の初期軍は配置しない。

## 5. 動的なSC勝利目標

11人時の15SC勝利を基準に、参加人数が少ないほど無所属区のSCを獲得しやすくなるため勝利目標を上げる。

Phase 3Aの仮ルール:

`victoryTargetSC = 15 + (11 - activePlayerCount)`

すなわち:

- 11人: 15
- 10人: 16
- 9人: 17
- 8人: 18
- 7人: 19
- 6人: 20
- 5人: 21
- 4人: 22
- 3人: 23

これは試遊調整前の仮ルール。

実装では魔法数値へ散らさず、scenario/game settingsとして:
- `baseVictoryTargetSC = 15`
- `referencePlayerCount = 11`
- `missingPlayerSCBonus = 1`
を持つか、同等に設定変更可能な構造にする。

ゲーム開始時にtargetを計算してGameSessionへ固定保存する。
途中の切断や脱落でtargetを再計算しない。

## 6. ロビー

最低限:
- ルーム作成
- 短いroom code
- room codeで参加
- player nickname
- optional preferred ward
- 接続状態
- host表示
- 参加人数
- ゲーム開始

開始条件:
- 3～11人
- 全参加者が接続中
- nicknameが有効
- hostだけが開始可能

開始後は新規プレイヤーを参加させない。
観戦機能はPhase 3A対象外。

Hostがゲーム開始前に切断した場合、接続中の別プレイヤーへhostを移譲してよい。
ゲーム開始後は進行が自動のためhost固有権限を増やさない。

## 7. サーバー権威

ゲーム状態の唯一の正本はサーバー。

サーバーが保持:
- room
- players
- ward assignment
- inactive wards
- RNG seed
- GameSessionState
- orders
- ready/finalized status
- retreat submissions
- winter submissions
- victory target

クライアントだけで:
- 命令裁定
- ward割当
- SC更新
- controller更新
- victory/elimination
を確定しない。

既存 `rules-core` / `game-core` をサーバーから利用する。

## 8. 秘密命令

各プレイヤーは自分のユニットの命令だけを編集できる。

他プレイヤーへ送信してよい情報:
- nickname
- assigned ward
- connected / disconnected
- orders status: editing / finalized / not-required
- eliminated status

送信してはいけない情報:
- 他プレイヤーのMove先
- Hold内容
- Support対象
- 未確定order
- finalized orderの詳細
- retreat先
- winter adjustment内容（解決前）

サーバー側でもroom broadcast payloadに秘密情報を混入させない。

## 9. 自動Hold

Orders phaseで「命令書を確定」した時点で、そのプレイヤーの未入力ユニットへサーバーがHoldを補う。

- 確定前に「未入力N軍はHoldになります」とUIで明示する。
- プレイヤー自身には、補完されたHoldを含む最終提出内容を表示してよい。
- 他プレイヤーには詳細を見せない。
- rules-core自体の「全軍にOrderが必要」という厳密性は維持する。
- Auto Holdはonline orchestration層の機能として実装する。

## 10. 提出状況と自動裁定

Civ系ゲームのターン待ち表示のように、全員の提出状況を公開する。

表示例:
- 入力中
- 確定済み
- 不要
- 切断
- 脱落

命令内容は表示しない。

### Orders
- 各生存プレイヤーが自分の命令書を確定する。
- 全てのrequired playerが確定した瞬間、サーバーが自動で裁定する。
- hostの裁定ボタンは不要。

### 確定解除
- 全員確定して自動裁定が始まる前なら、確定済みプレイヤーは「確定解除」できる。
- 最後のrequired playerが確定して裁定処理が開始された後は解除不可。
- 解除後は自分の命令を再編集できる。

### Retreat
- dislodged unitを持つプレイヤーだけrequired。
- requiredでないプレイヤーは「不要」。
- required全員の秘密入力が確定したら自動同時解決。
- 撤退中は交渉禁止表示を維持。

### Winter
- Build/Disbandで操作が必要なプレイヤーをrequiredとする。
- Build可能だが0体Buildを選ぶ場合も「冬調整を確定」が必要。
- 何も調整できず必要もないプレイヤーは「不要」。
- required全員確定後にサーバーが一括適用する。

## 11. 結果の表示と次フェイズ

自動裁定後も直前の裁定結果をGameSession内に保持し、次フェイズ中に確認できるようにする。

Phase 3Aでは複雑な戦闘アニメーションは必須ではない。

少なくとも:
- 成功/失敗した移動
- support
- standoff
- dislodgement
- retreat
を結果ログ/盤面で確認できるようにする。

## 12. 再接続

ブラウザ再読込や一時切断へ対応する。

- serverがplayerIdとランダムなreconnect tokenを発行
- clientはtokenをlocalStorage等へ保存
- 再接続時にroom code + playerId + tokenで同じplayerへ復帰
- tokenを他プレイヤーへbroadcastしない
- token不一致ならなりすまし復帰を拒否

切断中:
- ready statusを「切断」と表示
- 既にfinalized済みならその提出は保持
- 未finalizedならゲームはそのプレイヤーを待つ
- Phase 3Aではhostによる強制Hold/強制skipを実装しない

サーバープロセス自体が再起動した場合の永続復旧はPhase 3A対象外。

## 13. 地域名hover表示

本番ゲーム画面を含む地図表示で、マウスカーソルをregion上へ置いたとき土地名を確認できるようにする。

要件:
- enabled/playable regionをhoverするとtooltip
- 主表示: 国勢統計区名 / 地域名
- 副表示: 行政区名
- tooltipはcursor付近だが地図操作を邪魔しない
- 画面端ではviewport内へ収める
- unitやSCの上にhoverしても、その下のregion名を確認できる
- hover中のregionを軽く強調
- mobile/touchではclick/select時の詳細表示で代替

編集モード、Preview、Sandbox、Online Gameで共通利用できるようにする。

## 14. 選択地域の表示改善

現在のクリック選択時に出る太く大きな黒枠は廃止する。

新方針:
- region fillをわずかに明るく/半透明overlayで強調
- 1.5～2px程度の細いaccent stroke
- `vector-effect: non-scaling-stroke` 等でzoomしても極端に太くしない
- 真っ黒で太いoutlineを使わない
- 元のregion境界を隠さない
- selected marker/unitも軽いhalo等で連動して強調してよい

目的は「どこを選んだか分かる」ことであり、地図形状を覆うことではない。

## 15. 技術方針

既存WebクライアントへNode.js + Socket.IO等のサーバーを追加する。

推奨:
- TypeScript
- Node.js
- Socket.IO
- existing rules-core
- existing game-core

サーバーとクライアント間のイベントpayloadを型定義・runtime validationする。

Phase 3AではDB導入は不要。
room stateはサーバーメモリ保持でよい。

本番ビルドで同一Nodeサーバーから静的frontendを配信できる構成が容易なら対応してよいが、開発時はVite + server別ポートでもよい。

## 16. Phase 3Aで実装しないもの

- 公開ランダムイベント
- 装備
- 自転車
- Discord Activity
- Steam
- spectator
- server再起動後のroom永続化
- chat / DM
- 強制skip / AFK timer
- turn timer
- 2人以下の正式ゲーム
