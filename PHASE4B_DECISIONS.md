# Phase 4B 仕様差分 — 試遊可能版の完成・シナリオ読込・終了処理・プレイログ

Status: Phase 4B 実装前の決定事項
Date: 2026-10-03

この文書は既存の `spec.md` と Phase 1.5 / 2A / 2B / 3A / 3B / 4A の決定事項に対する追加・変更である。
矛盾する場合、この文書を優先する。
Codexは実装開始前にこの内容を `spec.md` へ反映すること。

# 1. Phase 4Bの目的

Phase 4Aまでで、通常Diplomacy裁定・年間進行・オンライン対戦・公開イベント・装備まで実装された。

Phase 4Bでは新しいゲームメカニクスを増やさず、
**実際に3～11人で試遊し、結果を比較・改善できる状態**を完成させる。

主対象:
- 正式な京都シナリオJSONをオンラインルームへ読み込む仕組み
- ゲーム開始前のシナリオ検証
- 固定年数・終了条件の完成
- 最終順位/勝者表示
- プレイテスト用ログ
- 終了後のデータ出力

Discord Activity化、フォント/美術面の最終UI調整、新規イベント追加はPhase 4Bの対象外。

# 2. 正式シナリオの扱い

現在、repoに含まれる初期京都設定は未採用状態であり、ユーザーが地図エディタで保存したMapConfig JSONが実際のシナリオ正本になる。

Phase 4Bでは、オンラインルーム作成者が **保存済みMapConfig JSONを読み込んで、そのroomのシナリオとして使用** できるようにする。

## 2.1 Hostによるシナリオ読込

Lobby開始前にHostだけが:
- 「京都シナリオJSONを読み込む」
- JSONファイル選択
を行える。

ClientでJSONを読むだけでゲーム状態を確定せず、Serverへ送信しServer側でruntime validationとcompileを実行する。

Serverが正本として保持する:
- scenario id
- map config
- compiled MapDefinition
- validation summary
- checksum/hash

ゲーム開始後はscenarioを変更できない。

## 2.2 シナリオ表示

Lobbyに:
- シナリオ名
- 採用地域数
- SC総数
- 初期軍総数
- 更新/読込状態
を表示する。

# 3. ゲーム開始前Preflight

Start前にServerが必ず検証する。

Hard error（開始不可）:
- enabled region 0
- SC 0
- initial unit 0
- invalid adjacency
- starting unitがdisabled/impassable
- starting unit regionがSCでない
- 1regionに複数starting unit
- active候補11区のうち、初期軍が0の区がある
- active候補11区のうち、初期SCが0の区がある
- active候補11区のうち、enabled regionが0の区がある
- current player count用 `victoryTargetSC` がシナリオSC総数を超える
- MapConfig/MapDefinition validation error

Warning（開始可能だが表示）:
- wardごとの初期軍数差
- wardごとの初期SC数差
- wardごとのregion数差
- disconnected component
- 元KML MultiPolygon warning
- obstacle split warning
- degreeが極端に低いregion
- SCや初期軍が国境付近へ集中している等、既存客観値から表示可能なもの

バランスを「良い/悪い」と自動採点しない。

Start button付近へ:
- Error数
- Warning数
- 詳細を見る
を表示する。

# 4. 規定年数

初回試遊用の仮ルールとして **5年** を採用する。

設定:
- `maxYears = 5`

これはconfigurableとし、試遊後に変更可能。
コードへ散在するmagic numberにしない。

1年 = Spring + Autumn + Winter。

第5年Winterの清算・脱落判定が終了した時点で、他の終了条件が先に発生していなければゲーム終了。

# 5. 終了条件と優先順位

## 5.1 SC目標到達

Spring / AutumnのSC Update後に、`victoryTargetSC` 以上を所有する勢力が存在すれば即終了。

同一SC Updateで複数勢力がtarget以上になった場合:
1. SC所有数が最も多い勢力を勝者とする。
2. 最高SC数が同数なら、その勢力を同率勝者とする。

## 5.2 脱落発生

既存仕様どおり、脱落判定はWinter Adjustments後。

脱落条件:
- owned SC = 0
- または controlled non-SC region = 0

そのWinterに1人以上の新規脱落が発生した場合、
**その年を最終年として、そのWinter終了時点でゲーム終了**。

勝者は最終時点のSC所有数最多勢力。
同数なら同率勝者。

## 5.3 規定年数

SC勝利も脱落終了も発生しなければ、第5年Winter終了時点で終了。

勝者:
- final SC count最多
- 同数なら同率勝者

## 5.4 順位

最終順位は原則SC所有数の降順。
同数は同順位とする。

Phase 4BではSC以外のタイブレークを設けない。

表示例:
1位 A区 12SC
1位 B区 12SC
3位 C区 10SC

# 6. Game Over State

GameSessionに明確な終了理由を保持する。

例:
- `supply-target`
- `elimination-final-year`
- `max-years`

最低限:
- endReason
- endedYear
- endedSeason
- winners
- final standings
- final SC counts
- final controlled region counts
- final unit counts

終了後:
- 新しいordersを受け付けない
- boardは閲覧可能
- last adjudication/resultも閲覧可能
- match logをdownload可能

# 7. プレイテストログ

試遊改善のため、GameSessionとは別に決定的なMatchLogを蓄積する。

各phase/重要イベントにrecord:
- timestamp
- year
- season
- phase
- submitted order count
- finalizedまでに要した秒数
- resolved orders（裁定後のみ）
- SC count by ward
- controlled region count by ward
- unit count by ward
- equipment inventory count by ward
- generated public events
- equipment pickups
- barricade deployments / expirations
- standoff count
- dislodgement count
- build/disband count
- elimination
- victory/end reason

Draft中の秘密命令履歴は記録しない。
最終提出命令は裁定後にlogへ保存してよい。

## 7.1 交渉時間の近似

ゲーム内VCを持たないため、実際の会話時間は測定できない。
代わりに:
- Orders phase開始時刻
- 各player finalized時刻
- 全員finalized時刻
をlogし、ターン所要時間の参考にする。

# 8. Match Log Export

HostおよびGame Over画面から:
- `match-log.json`
をDownloadできる。

JSONに含める:
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

Reconnect token等の秘密認証情報は絶対に含めない。

# 9. 試遊サマリーパネル

Game Over画面で最低限:
- 勝者
- 終了理由
- 経過年数
- 最終SC
- 最終region数
- 最終unit数
- 各Orders phaseの平均所要時間
- standoff総数
- dislodgement総数
- 各イベント発生回数
- 自転車/バリケード取得・使用回数
を表示する。

これはゲームの面白さを自動評価するものではない。
ユーザーとChatGPTが試遊後に判断するための客観値。

# 10. 試遊用UIの範囲

Phase 4Bではフォントや装飾の最終調整を行わない。

直すのは、試遊不能になるUIのみ:
- Game Overに進めない
- startできない理由が不明
- Scenario未読込が分からない
- Result/log downloadが見つからない
など。

地図のフォント、装備アイコンの美術、余白、最終レイアウト等は後のUI polishフェーズへ回す。

# 11. ローカル年間進行

オンラインだけでなくローカル年間進行でも:
- maxYears 5
- SC target
- elimination final year
- final standings
を同じgame-core関数から利用する。

終了ロジックをReact側とServer側で二重実装しない。

# 12. テスト

最低限:

## Scenario
- valid saved MapConfig -> server compile success
- invalid JSON rejected
- invalid MapConfig rejected
- start blocked with missing initial ward setup
- start blocked if target > SC total
- warnings do not block

## End rules
- target reached spring -> finish
- target reached autumn -> finish
- two target achievers, one higher -> higher wins
- equal target achievers -> shared winners
- winter elimination -> same year finish
- maxYears=5 -> finish after year5 winter
- SC tie -> shared rank
- no orders accepted after finish

## Logging
- phase duration recorded
- resolved orders only after adjudication
- no reconnect token
- events/pickups recorded
- export schema valid
- final summary consistent with GameState

## Online
- 3-browser scenario load / start
- game over state broadcast
- all clients see same standings
- host downloads match log

# 13. Phase 4B対象外

- Discord Activity
- UI最終デザイン
- 新規イベント
- event重み調整
- server restart永続化
- spectator
- timer / AFK skip
- AI player
