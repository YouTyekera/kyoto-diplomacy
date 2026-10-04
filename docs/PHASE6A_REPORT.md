# Phase 6A 完了報告

確認日: 2026-10-04。Phase 6Aの実装・検証を完了し、本フェーズで停止。

## 1. 仕様と作業範囲

`spec.md`、README、Phase 5C完了報告、これまでのDECISIONS全12ファイル、`UI_UX_GAME_FEEL_GUIDE.md`、`AUDIO_PLACEHOLDER_PLAN.md`、Phase 6Aプロンプト、最新PLAYTESTINGを全文確認した。最初にPhase 6Aの仕様差分をspec第30節へ反映し、入力・盤面表示・情報の出し方・任意SEの整理を実装した。

ゲームルール、裁定、勝利条件、イベント抽選、装備規則、SC更新、Build/Disband、KML・MapConfigは変更していない。作業開始時のSHA-256と比較し、Web以外の保護対象287ファイル（server・packages・data/source・data/maps・data/config）に変更がないことを確認した。過去のDECISIONSと完了報告も編集していない。

## 2. 右クリックMoveの根本原因

「機能がソースにある」「既存テストが通る」だけでは判断せず、画面を持つChromiumで実際のpointer入力を調べた。既存の右クリックテストはEnterで軍を選び、`dispatchEvent('contextmenu')`で命令入力していたため、マウスの押下・移動・離上と実際の重なり判定を通っていなかった。

確認できた入力不具合は次の2つ。

1. **右ボタンの移動を地図ドラッグとして扱う。** 左クリック時のdrag状態が離上後も残り、pointer moveの条件は「何かのボタンが押されている」だった。自軍をクリックしたあと、合法地域で右ボタンを押して少し動かすと、古い左クリック地点を基準に地図がずれ、pointer captureも干渉した。旧版の実操作では、viewBoxが `514.7662 493.8027 60.9115 48.7292` から `507.1962 498.7166 60.9115 48.7292` へ変化した。静止した右クリックでは登録できる場合もあり、常に全地域で失敗する不具合とは区別する。
2. **地面の装備マーカー上では移動先の地域IDを取得できない。** 装備のSVGには `data-ground-region` があるが、contextmenuのclosest検索対象から抜けていた。マーカーの四角を右クリックすると合法地域でも空の地域IDになり、Moveが見つからなかった。旧セレクターだけをブラウザの応答差し替えで再現した比較では、実マウスの自軍左クリック→合法地域Bの装備右クリックで「命令未入力」、矢印0本、「移動できる地域を右クリックしてください。」となった。同一の検証シナリオで修正版は「移動 → 架空地域B」、矢印1本になった。

ユーザーが失敗した元のクリック位置・ブラウザ設定を完全に再現したとは断定しない。上記は今回実ブラウザで確認した具体的な不具合と再現条件であり、その条件を修正して検証した。

## 3. 入力の修正と実ブラウザ確認

- ドラッグの開始・継続を左ボタンに限定し、pointer upで状態とcaptureを解放する。右クリック時にも古いdrag状態を捨てる。
- 左ドラッグによる地図移動を維持し、ドラッグ終了を地域選択として誤処理しないようにする。
- 共有のエディタでも、pointer up時にdragの移動済み状態を保存してから解放する。表示アンカー設定モードで左ドラッグした前後の保存JSONが一致し、その後の意図的な左クリックだけがアンカーを設定する回帰テストを追加した。
- region / Army / SC / 地面装備の各マーカーから地域IDを取得し、ブラウザのcontextmenuを抑止する。
- 地図ラベル・命令線・選択アンカーなど、表示専用要素のpointer event干渉を減らす。トレイ全体を覆う透明な入力遮断層は置かない。
- 右クリックの成功メッセージは命令の受理後に出す。別軍の選択・命令変更・操作キャンセルでは古い移動メッセージを消す。最終の画像確認で見つかった短時間の表示残留も修正した。
- Moveは従来の合法命令一覧から選ぶ。確定済み・演出中の入力制限、支援・自転車・バリケード操作中の右クリック禁止、ボタン→左クリックの操作を維持する。

新規E2Eは自軍ピンを実際にクリックし、移動先でright down→1px移動→right upを送る。地図が動かないこと、サーバーのprivateStateにMoveが登録されること、矢印とcommand dockが更新されることを確認する。左右トレイの閉・開の両方を検証する。装備マーカー上への右クリックと、明示的な「移動」→左クリックも検証した。

**E2Eとは別の、画面を持つChromiumセッションでも確認した。** localhostの通常サーバーで実京都の検証用JSONをUIから読み込み、3人の部屋を作成・開始した。1280×720で桃薗の自軍を左クリック→聚楽を右クリックし、dock「移動 → 聚楽」と矢印1本を確認した。手振れを加えてもviewBoxは変化しなかった。左右トレイを開いて桃薗→小川へ変更し、dock「移動 → 小川」と矢印1本を確認した。装備マーカーの旧判定と修正版の比較も別ブラウザ操作として実施した。ゲーム状態の直接書き換えは行っていない。

## 4. UIレイアウトと地図領域

通常のオンライン対局は左右トレイを閉じて開始する。上部は約48pxの薄いHUDと約30pxのトレイボタン・簡略ready表示に整理し、地図を横いっぱいに配置した。冗長な接続範囲・シナリオ件数・説明を常時表示から外し、必要時に詳細を開く。切断時のフィードバックは維持する。

3人対局・通常表示でのSVG表示領域を実ブラウザで測定した。

| 画面 | 地図の幅×高さ | 画面幅に対する割合 | 画面高に対する割合 |
| --- | --- | --- | --- |
| 1920×1080 | 1904×916px | 99.2% | 84.8% |
| 1366×768 | 1350×604px | 98.8% | 78.6% |
| 1280×720 | 1264×556px | 98.8% | 77.2% |

修正前の1280画面では左右パネルが常時幅を取り、地図は約820px幅だった。軍選択時には下のdockも高さを取り、保存した修正前画像のSVGは約260px高だった。修正後は幅が約54%増え、選択時も556px高を維持する。これは描画キャンバスの寸法であり、全ての地理ポリゴンが画面いっぱいに広がるという意味ではない。ズーム・全体復帰・行政区拡大と出典表示を維持した。

トレイは地図を縮める常設列から、小さい浮動面へ変更した。トレイを開くとその見えている箱が地図の一部に重なる。両方を開いた状態でも箱の外側を操作でき、閉じれば全面が戻る。撤退・冬調整の専用入力と終了結果は維持する。ローカル試行も右側を260pxへ軽量化したが、全勢力を操作する検証機能を残している。開発者向け詳細フォームは従来どおり。

## 5. 左右トレイとcommand dock

- 左「イベント・結果」: 今季公開イベント、地面の装備、持続効果、前回の裁定。常時の説明を減らし、全勢力の所持数表は折りたたむ。イベントの「地図で見る」とhostの試遊ログ保存を維持する。
- 右「参加者・装備」: ready、参加者、自分の装備・秘密予約、選択地域とSC所有、自分の命令数・一覧。シナリオ詳細・無所属区・命令一覧は初めから折りたたむ。
- どちらも上部ボタンとトレイ内の「閉じる」で開閉できる。1280画面の開いた幅は各238px。前回結果を開いたまま次命令・撤退・冬調整を操作できる。
- command dockは地図下部中央へ重ね、現在地・現在命令・待機/移動/支援/自転車/バリケード/命令を変更/キャンセルを中心にした。所持していない装備のボタンは従来どおり表示しない。支援・装備の段階入力、合法候補、サーバー受理後の反応を維持する。
- 命令書の確定は画面下の一定位置に残す。未入力軍がHoldになる説明も維持する。

## 6. Army / SC / 中立 / hover / selection

プレイヤー向けArmyとSCを同じ倍率で約18%大きくした。同じズームで軍の有無によりSCの円が変わらない構造、足元の円とArmyの関係、正規アンカーは維持する。自軍は明るいhalo、選択軍は明るい縁取りと軽いglowで見分ける。SC所有色と領土色は別のまま、中立SCを淡い空円・灰緑の破線で示す。

選択地域は白い細線とglow、hoverは明るい細線、合法移動先は青い実線、二次候補は破線で示す。太い黒枠は復活させていない。ラベルの詳細表示をズーム・hover・selectionへ寄せ、小さい地域インスペクタに地域名・行政区・支配・SC所有を表示する。右トレイを開いたときは、背後の小インスペクタを隠して重複を減らす。

## 7. Audio / SEフック

既存のBGMの曲・切替・音量・保存設定は変更していない。SEはゲーム進行から独立した補助演出で、7slotのパス・目安・用途を `audio/sfx-manifest.ts` へ集約した。音源は同梱・生成・ダウンロードしていない。

| SE | フック | 音源差し替え時の長さの目安 |
| --- | --- | --- |
| select | 自軍を選択したとき | 40〜80ms |
| order-confirm | 合法命令が受理されたとき | 80〜150ms |
| march | 移動演出中の単一グループ、終了・スキップで停止 | 200〜400ms |
| support-success | 公開裁定の支援成功 | 120〜220ms |
| sc-capture | 自分のSC増加 | 180〜350ms |
| standoff | 公開裁定のスタンドオフ | 120〜220ms |
| victory | 自分の勝利・共同勝利 | 600〜1200ms |

長さは `AUDIO_PLACEHOLDER_PLAN.md` の配置目安で、裁定タイマーではない。marchは既存のグループloopを維持し、ピンの数だけ同時再生しない。BGMとSEのON/OFF・音量は独立。未配置・404・自動再生拒否・遅れたplay promiseを安全に扱い、画面の反応と命令入力だけで遊べる。音源の配置READMEと試遊説明を更新した。

## 8. 検証結果

| コマンド | 結果 |
| --- | --- |
| `npm.cmd run lint` | 成功 |
| `npm.cmd run typecheck` | 成功 |
| `npm.cmd run test` | 20ファイル・318件成功 |
| `npm.cmd run build` | 成功 |
| `npm.cmd run test:browser` | 41件成功・失敗0件（最終実行3.9分） |
| `npm.cmd run map:validate` | 成功・Error 0 / Warning 9 |

ブラウザは製品buildのpreviewと検証用サーバー、Chromiumの独立contextを使う。実京都190採用地域・SC72・初期軍59、3勢力を用いた。小さい装備・撤退・冬調整シナリオとイベントseedは検証専用で、本番MapConfigへ適用していない。右クリック、左クリックfallback、支援、自転車、バリケード、秘密予約、結果を開いたまま次命令、撤退、冬Build/Disband、勝者・非勝者、再接続、音源未配置、reduced motionを含む。

初回全体実行は38成功・2失敗。旧Phase 5Aのテスト2件が「結果トレイは初めから開いている」「再読込後も開いている」という前提で待っていたため、新しい初期状態に合わせてトレイを明示的に開く手順へ修正した。ゲーム進行を変更して解決していない。画面付き実行では背景タブの演出終了を待つ手順も調整した。

map警告は既存の御苑との重なり・分断、原本MultiPolygon、採用なし。227地域・採用0・SC0・軍0という未確定の京都初期設定を維持する。buildには既存のZodコメントと500KB超bundle警告がある。最終JSは588.05KB（gzip 179.38KB）。ブラウザの終了時のVite proxy ECONNABORTEDとNO_COLORのログも出る。

## 9. 保存画像・目視確認

保存先は [screenshots/phase6a](screenshots/phase6a)。`test-results`の自動再作成で失わないように最終実行の報告用画像17点をコピーした。独立実ブラウザ・旧版比較の画像13点と合わせて保存している。1920×1080・1366×768・1280×720の通常盤面、選択とdock、Move、トレイ開閉、イベント、中立SC、撤退と結果、勝者・非勝者を目視確認した。

| 画面 | 画像 |
| --- | --- |
| 1920通常盤面 | [main-1920.png](screenshots/phase6a/main-1920.png) |
| 1366通常盤面 | [main-1366.png](screenshots/phase6a/main-1366.png) |
| 1280通常盤面・左右閉 | [main-1280.png](screenshots/phase6a/main-1280.png) |
| 左トレイ閉・右トレイ開 | [left-tray-closed.png](screenshots/phase6a/left-tray-closed.png) |
| 右トレイ閉 | [right-tray-closed.png](screenshots/phase6a/right-tray-closed.png) |
| 左右トレイ閉 | [trays-closed.png](screenshots/phase6a/trays-closed.png) |
| 自軍選択・command dock | [selected-closed.png](screenshots/phase6a/selected-closed.png) |
| 右クリックMove・hoverインスペクタ | [move-closed.png](screenshots/phase6a/move-closed.png) |
| 両トレイを開いてMove | [move-open.png](screenshots/phase6a/move-open.png) |
| 公開イベント | [event.png](screenshots/phase6a/event.png) |
| 中立SC | [neutral-sc.png](screenshots/phase6a/neutral-sc.png) |
| 前回結果を開いたまま次命令 | [drawer-next-command.png](screenshots/phase6a/drawer-next-command.png) |
| 撤退必須・前回結果 | [retreat-drawer.png](screenshots/phase6a/retreat-drawer.png) |
| 勝者 | [winner.png](screenshots/phase6a/winner.png) |
| 非勝者 | [nonwinner.png](screenshots/phase6a/nonwinner.png) |

独立した実ブラウザの記録は `manual-selected-1280.png`、`manual-move-closed-1280.png`、`manual-move-open-1280.png`、`manual-equipment-old-resolver.png`、`manual-equipment-fixed.png`。最後のdock表示修正後も実ブラウザで再確認し、`manual-final-main-1920.png`、`manual-final-main-1280.png`、`manual-final-move-closed.png`、`manual-final-move-open.png`、`manual-final-equipment-move.png`を保存した。旧UIの手振れ再現は `repro-before.png`、`repro-after.png`。装備の旧判定比較は旧版全体の再起動ではなく、旧セレクターだけを再現したもの。

## 10. 変更ファイルと残るUI課題

既存ソースの変更は `MapCanvas.tsx`、`OnlineGame.tsx`、`EventsPanel.tsx`、`BottomActionBar.tsx`、`main.tsx`、`audio/sfx-manager.ts`。新規に `board-first.css` と `audio/sfx-manifest.ts`、右クリック回帰の `tests/browser/phase6a.spec.ts` を追加した。Phase 5A/5B/5Cのブラウザテストは、新しいトレイ初期状態と表示に必要な部分を調整した。README・PLAYTESTING・任意SEのREADMEを更新した。

残る確認・改善候補は以下。

- 複数PCでの実際の交渉・長時間試遊と、参加者11人時の情報密度の評価。今回の画面比較は3人対局が中心。
- 小地域で近接したArmy/SCや、深いズームでの地名の重なり。hover・ズーム・トレイ開閉を併用できるが、全ケースのラベル衝突を自動解消したわけではない。
- 両トレイを開くと覆われる端の地域は、トレイを閉じるか地図を移動して操作する。モバイル全面最適化は今回の対象外。
- 音源は未配置なので、実音源の音量バランス・聞こえ方は未確認。無音・404・SE OFFの動作は検証済み。
- 実ユーザーのブラウザ・OS・マウス設定の全組合せでの確認、FPSの計測・保証は行っていない。

Phase 6Aで停止する。Discord Activity化・公開デプロイ・新ルール・次フェーズには進まない。
