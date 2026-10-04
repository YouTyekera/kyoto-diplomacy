# Phase 3A 完了報告

Date: 2026-10-03（日本時間）  
Status: Phase 3A完了。イベント・装備・自転車・Discord Activityへ進んでいません。

指定されたspec、README、Phase 1/1.5/2A/2B報告、全DECISIONS、RULES_CORE/GAME_CORE、CODEX_PHASE3A_PROMPTを全文確認し、実装より先にPHASE3A_DECISIONSをspecへ反映しました。正本は0.6-draftです。旧差分と報告は過去フェイズの記録として保持しています。

## 1. architecture

Node.js + TypeScript + Socket.IOのサーバーを追加しました。唯一のゲーム正本はサーバーです。既存rules-core/game-coreの純粋裁定を利用し、ブラウザで割当・裁定・支配・SC所有・終了を確定しません。

| 主要ファイル | 責務 |
| --- | --- |
| `apps/server/main.ts` / `server.ts` | Dataset読込、Socket.IO、接続者別配信、起動/停止 |
| `packages/online-core/initial.ts` | seed付き割当、正式初期盤面、SC目標設定 |
| `packages/online-core/room-manager.ts` | room/player、認証資格、秘密提出、ready、自動進行 |
| `packages/shared/online.ts` | 双方向イベント型、Zod request/response/public/private schema |
| `packages/game-core/model.ts` / `session.ts` | 固定victoryTargetSCとSC更新時の判定 |
| `apps/web/src/useOnline.ts` / `OnlineGame.tsx` | 接続/復帰、ロビー、自軍命令、秘密撤退・冬、公開結果 |
| `apps/web/src/App.tsx` / `MapCanvas.tsx` / `style.css` | モード導線、初期SC説明、共通hover/細い選択 |
| `scripts/dev-online.mjs` / `vite.config.ts` | 一括起動、同一origin proxy、任意ポート |
| `packages/online-core/online.test.ts` / `server.test.ts` | 42単体テストと実Socket.IO統合テスト |
| `tests/browser/phase3a.spec.ts` | 3ブラウザ対戦、冬/撤退、既存モードhover |
| `README.md` / `docs/ONLINE_CORE.md` / `NOTICE.md` | Windows操作、API、出典/ライセンス |

npm packageは従来の1つを維持します。Socket.IOとsocket.io-client 4.8.4のMITを確認し、NOTICEへ通知を保存しました。追加のプロセス管理ライブラリは使いません。ビルドはNOTICE・licensesを同梱します。

## 2. room/lobby

6文字コード、nickname、任意の希望1区、接続状態、ホスト、人数、開始理由を表示します。3～11人、全員接続中、ホスト操作のみで開始できます。2人開始・12人目・開始後の新規参加を拒否します。開始前は退出・希望変更が可能です。他人の希望を送信しません。

開始前のホスト切断時は接続中playerId順に移譲します。開始後の進行は自動で、ホストに裁定・強制skip権限を設けていません。京都の採用地域ゼロの初期設定では理由を表示して開始を止めます。地図の採用範囲や初期軍数を独自に追加していません。

## 3. ward assignment

サーバーがcryptoでseedを発行します。希望区別に集め、単独希望を優先、競合は希望者から1人だけ抽選します。未割当参加者と未割当区をそれぞれseed付きshuffleして対応させます。残る11−人数区が無所属です。

ソート済みplayerId/wardId、FNV-1aによるseed初期化、Mulberry32、Fisher–Yatesを使い、同じseed・参加者・希望で入力順に関係なく再現できます。割当、seed、無所属一覧、開始時人数はOnlineGameSessionへ固定保存します。Math.randomへ依存しません。

## 4. initial state

createOnlineBoardはPreview初期化から独立した関数です。採用・侵入可能地域だけにゲーム状態を作ります。

- active区の地域は初期controllerをその元行政区にします。
- 無所属区の地域を削除せず、controllerとSC所有をnullにします。
- active区内のSCでhomeWardIdがその元行政区と一致する場合だけ、その区が初期SC所有者です。null・不一致は中立です。
- startingUnit.ownerWardIdがactiveな初期軍だけ配置します。disabled/領域全消失へ配置しません。
- homeWardIdをBuild・現在支配・撤退・脱落規則へ流用しません。Build地点は従来のstartingUnit由来の集合です。

サーバー自身のDatasetと作成者のMapConfigをcompile・検証して地図を固定します。京都KML、元geometry、御苑設定は変更していません。設定/Preview/ローカル年間状態とオンライン状態は独立しています。

## 5. victory target

baseVictoryTargetSC=15、referencePlayerCount=11、missingPlayerSCBonus=1を設定オブジェクトへ集約しました。開始時に15+(11−人数)を計算しGameSessionState.victoryTargetSCへ固定保存します。3人23、4人22、…、11人15をテストしています。切断・脱落で再計算しません。

ロビーの開始見込みとゲームヘッダーに表示します。春秋SC更新時に既存coreが固定目標で判定します。3人15SCでは継続し、23SCで即勝利することも検証しました。従来のローカル年間検証は目標省略時の15を維持します。規定年数初期値はnull、同点・脱落年の完全な勝者決定はTODOです。

## 6. secret orders

PublicRoom/PublicGameとPrivatePlayerを型とruntime schemaで分離しました。公開serializerは許可フィールドだけを明示列挙し、内部Room/Game/PlayerSessionを丸ごとJSON化しません。公開は盤面・所有・支配・SC・割当・接続・提出状況・解決済み結果です。

本人用は自軍のdraft/確定命令、合法候補、自軍の撤退入力、冬draft/予算です。他軍の命令を送ってもサーバーが拒否します。支援の合法候補に他軍を含めることと、その軍の秘密命令を見ることは別です。tokenは作成/参加ackだけで本人へ渡します。

京都の静的地図は参加・復帰時に各socketへ配信し、その後は盤面/提出状況だけを送ります。固定地図を命令編集のたびに再配信せず、クライアントも地図投影をmemoizeします。開始前退出後の同じ部屋への再参加でも地図を再配信することを通信テストで確認しました。

## 7. ready/auto adjudication

Ordersでは各生存プレイヤーが命令書を明示確定します。軍がない場合も空命令書を確定します。確定時に自軍の未入力だけサーバーでHold補完し、UIに未入力数を示します。rules-coreの入力不足エラーと不正命令の拒否を維持しました。

全required確定の検査、ロック、裁定を同期トランザクションとして実行します。通し番号入りphaseKeyを検証し、最後の確定後の解除・重複再送・古いフェイズ入力を拒否します。全員前なら解除できます。実通信で同時に最後の提出と重複再送を行い、裁定1回だけを確認しました。

Retreatは排除軍所有者だけrequired、Winterは必要解散または合法な空き初期地点SCへのBuildがある人だけrequiredです。0Buildも明示確定が必要です。不要な中間フェイズを自動通過し、春秋SC更新、冬、年末/終了を既存coreで処理します。軍ゼロの設定が自動ターンの無限ループに入らないこともテストしています。

公開結果は次フェイズにも保持します。Move/Supportと理由、standoff、排除、撤退、SC変更、冬の増減員を表示します。撤退の交渉禁止表示を維持します。表示からゲーム結果を決める処理はありません。

## 8. reconnect

crypto playerId/tokenを本人へ発行し、タブごとのsessionStorageへ保存します。同じタブの再読込でオンラインへ戻り、同じ本人の公開状態と秘密入力を復元します。不一致token・別playerId・不存在部屋を拒否します。復帰で操作資格を新socketへ移し、古いsocketの操作を拒否します。

切断した確定済み提出は維持し、未確定者は待ちます。強制Hold・skip・AFK/ターンtimerを追加していません。サーバー再起動後の復元はありません。複数参加者を同じPCの新規タブで扱うためsessionStorageを選択しました。タブ終了時は通常credentialを失い、タブ複製はcredentialを共有する場合があるという限界をREADMEへ記載しました。

## 9. UI hover/selection fix

編集・Preview・Sandbox・ローカル年間・オンラインでMapCanvasを共用し、採用/侵入可能地域の国勢統計区名を主表示、元行政区名を副表示とするtooltipを追加しました。カーソル付近・pointer-events:none・viewport端へclampし、ピン/SC上でも同じ地域を示します。退出hoverで隠れます。タッチでは選択地域の詳細を表示します。

選択地域は1.8pxのaccent strokeと少し明るい塗りです。non-scaling-strokeを維持し、SVGに出るブラウザの太いfocus outlineを除きました。キーボードfocusは細いaccentで識別できます。隣接/hover枠も細くし、pin/SCと連動します。元境界やArmy/SCの区別、御苑塗りを維持しました。

## 10. tests/results

| チェック | 結果 |
| --- | --- |
| npm.cmd run lint | 成功 |
| npm.cmd run typecheck | 成功 |
| npm.cmd run test | 157件成功（既存114 + オンライン42 + 実通信統合1） |
| npm.cmd run build | 成功、NOTICE/licensesを含むdist生成 |
| npm.cmd run test:browser | 開発画面の18シナリオ成功（既存15 + 追加3） |
| E2E_PREVIEW=1のtest:browser | 最終本番ビルドの18シナリオ成功 |
| npm.cmd run map:validate | エラー0・警告9、MapDefinition生成 |
| dev:onlineの起動/停止 | 独立ポート5180/3011でWeb/HTTP/Socket.IO proxy応答確認、停止確認 |

追加単体テストは人数制限、希望・seed・無所属数、正式初期化、3～11人のSC目標、Auto Hold、他軍/不正命令の拒否、秘密serializer、確定解除/phaseKey/一度だけ裁定、Retreat/Winter required、0Build、必要Disband、token、切断待ち/確定保持、軍ゼロをカバーします。別の統合テストコマンドは増やさず、実Socket.IOテストもnpm testへ含めました。

元KML227件のSHA-256、内部アンカー、旧JSON、既存裁定・年間処理のテストも全て維持しました。警告9件は以前と同じ御苑交差4、滋野2部分化1、原本MultiPolygon3、採用未設定1です。Zod内部コメントのRollup警告は従来のコメント除去で、ビルドは成功しています。Windowsのpreviewでブラウザ切断時にproxyのECONNABORTEDが出る場合がありますが、再接続と全シナリオは成功し、ページ実行エラーはありません。

## 11. browser verification

実Chromiumの3独立contextでロビー、2人開始不可、ホスト開始、希望優先、23SC表示、本人ユニットだけの入力、他人にはreadyのみ、解除、全員確定、自動春秋進行、次フェイズ秘密入力、再読込復帰を確認しました。京都のテスト用MapConfigをメモリ/一時ブラウザだけで使用し、公式227地域の実地図を描画しました。

さらにBuildの秘密draftと0Build確定、翌年、Move/Supportによる排除、本人だけの秘密撤退、撤退draftの再読込復元、必要解散不足の拒否、手動Disband、脱落年で終了を検証しました。架空サンプルでもロビー退出と全ローカルモードのhover/細い選択を確認しています。

スクリーンショット: `test-results/phase3a-kyoto-selection.png`、`phase3a-online-result.png`、`phase3a-retreat-result.png`。目視で地名tooltip、細い選択、軍/SC、ready、自軍フォーム、結果パネルを確認しました。

## 12. known limitations

サーバーとroom stateはメモリのみで、再起動時に失われます。復帰は同じタブのsessionStorageで、アカウント登録・タブ終了後の恒久復帰・観戦・チャット・ゲーム保存はありません。切断した未確定者を強制処理しません。LAN手順をREADMEへ追加しましたが、複数の物理PCによるLAN実機検証やインターネット配備は行っていません。

本番frontendのpreview + 別Node serverで検証しています。Nodeから静的frontendを直接配信する機能は任意項目として未実装です。既存5173番のユーザー用サーバーは止めず、一括起動確認は独立ポートを使いました。通常はREADMEのdev:onlineで5173/3001を使用します。

京都初期設定は全227地域未採用・SC0・初期軍0です。オンラインの最終シナリオは人が設定する必要があります。試験用採用・配置・隣接を京都初期設定へ保存していません。御苑・元KML・既存地図編集と保存/読込は維持しました。11人の割当/参加制限は自動テスト済みですが、11端末同時負荷測定は今回の範囲外です。

## 13. decisions needed before next phase

最終採用範囲、SC総数/配置、初期軍数/配置、御苑分断と隣接の最終調整、人数別SC目標の試遊、非SC支配ゼロ脱落の試遊、規定年数・同点処理・脱落年の勝者/順位の仕様が残っています。将来の永続復旧・切断者処理・専用初期SC所有フィールドへのmigrationは別途判断が必要です。

これらを独断で決定していません。**Phase 3Aで停止し、イベント・装備・自転車・Discord Activityへ進んでいません。**
