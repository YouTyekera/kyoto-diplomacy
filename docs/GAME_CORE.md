# 年間進行API（Phase 4B）

最新の終了規則はspec第25節です。`GameSessionState.status`は`playing / finished`、`maxYears`の既定値は中央設定の5、`endResult`は理由・年・季節・同率勝者・最終順位・脱落理由を保持します。`yearLimit`と旧`end`は互換用のフィールドで、現在の表示は`endResult`を参照します。第4引数がnullでも無期限にはせず、既定年数を採用します。

`evaluateGameEnd(map, state, checkpoint, previouslyEliminated?)`はpure関数です。春秋SC更新後は目標達成時の最多SC、冬清算後は新規脱落、次に規定年数を判定します。全終了で最高SC同数は同率勝者。`finalStandings`はSCだけのcompetition ranking（12/12/10 → 1/1/3）を返し、地域数・軍数によるタイブレークをしません。終了後の全操作は拒否します。

`match-log.ts`は年間状態とは別のログ層です。`startMatchLog / recordMatch / beginMatchPhase / logTransition`へ外部時刻を渡し、同じ入力と時刻なら同じtimelineになります。`summarizeMatch`をオンラインとローカルで共用します。`exportMatchLog`は厳格な共有schemaで検証したコピーだけを返します。以下のPhase 2Bの説明にある年数null・同点TODO・脱落時の勝者未確定は、Phase 4Bで置き換えています。

Phase 4AでGameSessionStateへ`events`、movementへ`equipmentResults`を追加しました。`createGameSession`の第6引数は`{seed?, settings?}`で、既定では第1年春から公開イベントを生成します。`adjudicateGameOrders`は通常命令に加えてGameOrderの自転車・設置命令を受けます。現在のイベントAPI・取得タイミングは [EVENTS_AND_EQUIPMENT.md](EVENTS_AND_EQUIPMENT.md) を参照してください。以下は年間進行の基礎APIの説明です。

`packages/game-core/` はUI・通信から独立した年間進行層です。Phase 2Aの `rules-core` の移動/撤退裁定を呼び出し、支配・SC所有・冬清算・年末判定を処理します。静的MapDefinition・設定JSON・表示専用Previewの形式は変更しません。

## モジュール

| ファイル | 役割 |
| --- | --- |
| `model.ts` | GameSessionState、季節/フェイズ、冬入力、変更一覧、終了情報 |
| `control.ts` | Move成功時の支配反映、SC所有更新、勢力集計 |
| `winter.ts` | 初期地点の合法性、増減員数、一括検証・確定 |
| `session.ts` | セッション作成、移動/撤退/冬裁定の統合、フェイズ遷移と終了 |
| `index.ts` | 公開API |
| `game.test.ts` | 年間進行のルールと状態不変の検証 |

## 呼び出し方

```ts
const created = createGameSession(map, preview, participantWardIds, yearLimit, victoryTargetSC);
// 全ての処理は { ok: true, result } / { ok: false, errors } を返す。
// 成功時だけ呼び出し側が現在状態をresultへ置き換える。
const movement = adjudicateGameOrders(map, state, orders);
const retreat = adjudicateGameRetreats(map, state, privateRetreatSubmissions);
const next = advanceGame(map, state);
const winter = adjudicateGameWinter(map, state, {
  builds: [{ ownerWardId, regionId }],
  disbands: [unitId],
});
const budget = winterBudget(map, state, ownerWardId);
```

開始時にPreviewの形式・参照・配置・最終隣接を検証します。参加勢力は呼び出し側が明示し、現在軍の所有勢力は全て含めます。未参加区を脱落候補へ含めません。最終採用範囲、無所属区抽選、正式初期配置/支配の生成は行いません。UIは現在Previewのコピーを検証用初期盤面に使います。

初期地点は、そのシナリオ開始時の静的MapDefinitionのstartingUnitから導出し、勢力別地域ID集合として保存します。homeWardId・元行政区・その後の軍位置で書き換えません。呼び出し側も開始時MapDefinitionを固定して使います。

## 状態と遷移

GameSessionStateは独立した `board`（地域支配/SC所有/軍）、参加勢力、初期地点、第何年か、季節/フェイズ、任意の規定年数、移動/撤退結果、SC変更一覧、冬結果、終了情報を保持します。移動と支援の入力不足はエラーです。

移動裁定後は必ずretreatsへ進みます。軍位置とMove成功先の支配を反映します。移動元の支配を消しません。撤退結果の反映では支配を変更しません。秘密撤退入力はUIの非公開状態に収集し、解決関数へ一括で渡します。セッションの盤面/矢印へ解決前の入力を保存しません。

撤退を解決してadvanceGameするとsc-updateへ進みます。次のadvanceGameでSC所有をcontrollerへ更新し、15SC判定を行います。中立controllerはnull所有となります。春の更新後は秋orders、秋の更新後は冬adjustmentsへ進みます。春秋どちらのSC更新前も、移動・撤退だけでSC所有を変更しません。

冬の入力は一括検証します。増員はSC数と軍数の差を上限にし、空いた自勢力所有の初期地点SCに限ります。上限を全て使う義務は設けません。必要解散数は必ず満たし、過剰解散・重複・不正軍・不正増員先を拒否します。エラーなら元状態を保持し、自動で解散対象を選びません。新軍IDは決定的な連番で既存IDとの重複を避け、armyだけを作成します。

冬を確定するとend-of-yearへ進み、その次のadvanceGameで参加勢力の脱落を判定します。SCゼロまたは非SC支配ゼロならその年で終了します。勝者/順位を独断で確定せず、最終年と脱落理由を返します。脱落なしでユーザー指定の規定年数へ到達した場合は最多SCを判定します。規定年数nullなら年数による終了は行いません。同数は候補と `tieUnresolved` を返し、独自タイブレークを使いません。15SCへ複数勢力が同時到達した場合も候補のままにします。

終了条件がなければ第N+1年の春ordersへ進みます。終了後にadvanceGameで再開はできません。開始時状態へのresetはUIの明示操作です。実暦の年や正式な年数の初期値を決めず、画面は第1年からのカウンターを使います。

## 保存と実装範囲

Phase 2BのWeb画面は年間状態と開始時地図をメモリ内に保持します。モード切替では状態と入力を保持します。データセットの切替・再読み込みでは終了します。年間状態のExport/Import・ブラウザ自動保存は追加していません。既存の設定/Previewの保存と独立しています。

規定年数の最終値・同点処理・終了順位・脱落時の完全な結果画面はTODOです。イベント/装備/自転車、締切、Discordは対象外です。

## Phase 3Aからの利用

createGameSessionの第5引数は固定SC勝利目標です。省略時は従来ローカル検証の15を維持します。state.victoryTargetSCを春秋の判定へ利用します。オンライン開始時は外側のRoomManagerが専用createOnlineBoardとseed付き区割当を使い、3～11人に応じた目標を渡します。正式初期化をPreview初期化へ置き換えていません。

coreは従来の段階遷移を維持します。サーバー側が全員確定時に移動・必要な撤退・SC更新・冬/年末を呼び、不要な中間フェイズを自動通過します。直前の公開結果と秘密提出は外側のOnlineGameSessionへ分離して保持します。通信・復帰認証の詳細は [ONLINE_CORE.md](ONLINE_CORE.md)。
