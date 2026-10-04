# Phase 5C 完了報告

実施日: 2026-10-03〜04。仕様正本は `spec.md` 第29節、決定資料は `PHASE5C_DECISIONS.md`、表示方針は `UI_UX_GAME_FEEL_GUIDE.md`。中断前の実装を監査して、未完了のPhase 5Cだけを継続した。最終検証結果は第11節に記載する。

## 1. 非モーダルの前回裁定結果

裁定animation中だけ盤面入力を止め、終了・スキップ後はサーバーの現在フェイズに対応する命令・撤退・冬調整を入力できる。`AdjudicationPresentation.tsx` の `active` は演出時間だけを表す。結果drawerにはbackdropや画面全体のpointer blockがない。

オンラインの左側「イベント・結果」パネルの「前回の裁定」は開いたまま操作できる。「結果を閉じる」は表示を畳むだけで、chipから再表示できる。左パネルを畳んだ場合も地図下のchipから戻せる。ローカルでは地図下に表示する。開閉はクライアント内の状態で、readyやサーバーフェイズには送信しない。撤退が必要な案内と地図上の「撤退」表示は別に出す。再接続時には古い裁定を再生しない。

背景タブでRAFが抑制される場合に備え、時間による演出終了とタブ復帰時の時刻確認を追加した。実京都3クライアントの終了待ちは対象ページを前面に戻して検証する。

## 2. 個人別の対局結果

`GameOver.tsx` は自分の行政区とサーバーのwinners/standingsを照合し、単独勝者「勝利」、同率勝者「共同勝利」、非勝者「第N位」、担当勢力不明「対局終了」を表示する。共通小見出しは「対局結果」。脱落した本人には脱落badgeと最終順位を付ける。

終了理由を「勝利条件達成」「脱落発生により終了」「規定年数終了」にした。順位・統計・勝者判定は変更していない。ローカルの全勢力操作で一つの担当区を仮定しない。

## 3. デザインシステム

`design-tokens.css` にspacing、角丸、文字サイズ、背景・surface・文字・境界・accent・success/warning/danger、影、motion時間とeasingをまとめた。warm neutralとoff-whiteを使い、`player-polish.css` でmenu・lobby・HUD・command dock・イベント・drawer・対局結果へ適用した。

勢力色は既存のゲームデータを利用する。大きなUI frameworkや外部画像は追加していない。完成済みの開発ツール全体の再設計は行っていない。

## 4. 命令の操作反応

選択Armyの現在地・現在命令・操作ボタンをcommand dockへ整理した。軍選択180ms、Moveの矢印と移動先pulse、Supportの破線pulse、Holdの小さな盾記号を表示する。サーバーが受理した命令に反応を出し、命令候補と秘密情報の境界は既存処理を使う。

「命令を変更」は下書きを取り消し、既存の装備予約処理も更新する。取消後に移動先pulseが残る不具合を修正した。Escape・キャンセルは操作wizardを解除する。短い反応は次の操作を待たせない。

## 5. フェイズと確定状態

600msの短いbannerに年・春秋冬・命令/撤退/軍備調整を表示し、常設HUDに情報を残す。bannerはpointer-events:none。提出済みは本人の「確定済み」と参加者一覧のチェック・文字で示し、解除できる間は確定解除ボタンを維持する。全員確定後に400msの案内を挟んで既存の約3.4秒の裁定演出を表示する。

## 6. SC・増減員・装備取得

`GameFeel.tsx` は確定した公開盤面の差分を表示用に保持する。SCリングの色変更、本人のSC増加数、敵初期SC進捗へ短い反応を付けた。新しい裁定snapshotは最初のrenderから演出中として扱い、SC反応が演出中に期限切れになる問題を修正した。

BuildとDisbandはサーバーの冬結果に明記された軍を550msのfade/raise-in・fade/shrinkで表示する。戦闘排除や、撤退して盤面に戻った軍を増減員と誤判定しない。

装備取得は、公開装備が消えた地点と実際に占有する取得勢力の軍を照合する。無関係な移動軍に取得表示が付く処理を修正した。地図に短い右上方向の取得表示を出し、オンラインとローカルの装備数をpulseさせる。inventoryの画面位置まで駒を飛ばす大きな演出は用いていない。

## 7. 対局結果の視覚表現

本人が勝者なら勢力色のaccent、単純なSVGトロフィー、900msの控えめなhero revealを表示する。非勝者は中立surfaceと順位を中心にする。全員に順位、終了理由、SC・支配地域・軍数、試遊サマリー、ログダウンロードを残す。confettiや追加の画面揺れはない。

## 8. Audio

既存のdomestic・adjudication・marchを維持する。裁定演出終了・スキップ後は現在の通常盤面のdomesticへ戻り、結果drawerの開閉で曲を止めない。終了時は従来のresult contextを利用し、音源未設定なら無音。

任意SFXは `apps/web/public/audio/sfx/` の `select.mp3`、`order-confirm.mp3`、`sc-capture.mp3`、`support-success.mp3`、`standoff.mp3`、`victory.mp3`。自分で配置した場合だけ再生できる。404・再生拒否はゲームを止めず、OFF・画面離脱で停止する。第三者音源・ダミー音源は追加していない。READMEと音源フォルダーの配置説明を更新した。

## 9. 地図と性能

約190採用地域の盤面で、highlight用Setとregion描画をmemo化した。pointer座標だけの変更で全地域のpathを作り直さない。裁定中に重いgeometry投影を毎フレーム繰り返していた箇所を、compiled region配列・表示モードが変わった場合の再計算に限定した。季節の有効隣接もUI側でmemo化した。

反応はtransform/opacityを中心とし、大量の地域に新しいblur/filterは追加していない。プレイヤーの全体表示は採用・侵入可能領域をfitする。原本形状、displayAnchor、SC寸法、Army先端、勢力色、地図採用設定は維持する。

## 10. アクセシビリティ

OSのprefers-reduced-motion変更をその場で反映する。移動量・短いCSS animationを抑え、結果や撤退表示を残す。裁定スキップ、Escape解除、focus-visible、既存のアイコンボタンのaria-labelを維持する。自軍の輪郭、二次候補の破線、待機盾、撤退・確定の文字など、色以外の情報も使う。

## 11. 検証と画像

- lint・typecheck・build: 成功。
- unit/integration: 20ファイル318件成功。Phase 5Cの16件は個人別終了見出し・統計保持・任意SFXの拒否/OFF・実際の装備取得地点・冬結果と撤退の区別を検証する。
- browser: 最終38件すべて成功（3.7分、終了コード0）。命令変更でpulseが消えること、SC反応が演出終了後に出ること、結果を閉じずに次命令・撤退・Build/Disbandが入力できること、増減員の反応、左パネル開閉によるフェイズ不変性、縮小画面でも地図が圧迫されないことを確認した。
- map:validate: Error 0 / Warning 9。京都227原本地域・採用0・SC0・軍0の初期設定を維持。警告は従来の御苑との重なり・分断、原本MultiPolygon、採用なし。
- 下記10種類の画像を保存し、すべて目視確認した。1280×720でも命令ドック・確定ボタン、撤退案内・地図・撤退入力が利用できる。

既存のZodコメントと500KB超bundleのbuild警告がある。最終bundleは585.04KB（gzip 178.69KB）。ブラウザcontextを閉じる際のVite proxy ECONNABORTEDログとNO_COLOR警告もあるが、テストの失敗は0件。

再開時に残っていた5件の旧文言期待値を更新した。装備操作の検証では、裁定スキップのログ送信後、確定ボタンが有効になるまで待つようにした。通信中に軍選択が無効だった瞬間へ入力していたテストを修正し、単独検証は成功した。既存の通信・秘密命令処理は変更していない。

PlaywrightはChromiumの独立contextを3つ使い、テスト用の5185/3025で実行する。実京都の検証用MapConfigは190採用地域・72SC・59初期軍、担当区26102/26104/26111。小さい撤退・冬調整シナリオも検証専用で、本番初期設定へ適用していない。

画像の保存先は `test-results/`。テスト再実行時に作り直される。

| 画面 | ファイル |
| --- | --- |
| 1920×1080通常盤面 | phase5c-main-1920.png |
| 1280×720通常盤面 | phase5c-main-1280.png |
| 自軍選択・命令dock | phase5c-command-dock.png |
| 支援wizard | phase5c-support-wizard.png |
| 前回結果を開いたまま次命令 | phase5c-drawer-next-command.png |
| 撤退必須・前回結果 | phase5c-retreat-drawer.png |
| 本人の勝利 | phase5c-winner.png |
| 本人の非勝者順位 | phase5c-nonwinner.png |
| イベントfocus | phase5c-event-focus.png |
| 中立SC | phase5c-neutral-sc.png |

## 12. 再開監査と残る確認

再開時の4分類とチェックリストを新規の `TODO.md` に保存した。既存TODOは見つからなかった。`PHASE5B_REPORT.md` とソースを照合し、報告された機能が存在しない項目は見つからなかった。当時の「サマリーを閉じるまで入力停止」はPhase 5Cで更新する仕様であり、過去の完了報告は変更していない。

再開後は、装備取得の誤表示、命令変更後の強調残留、SC反応の早期消失、撤退と増減員の混同、地図投影の再計算を修正した。撤退地点とローカル装備数の反応を補い、文言変更に対応するテスト・現在の試遊説明を更新した。完成済みのtokens・対局結果・イベントカード・Audio managerなどの再実装は行っていない。作業用の一時編集スクリプトを削除した。

人による複数PC対人試遊、操作時間・支援利用率の比較、実音源での試聴は未実施。小地域の近接Army/SCとズーム時のラベルは、hover・ズーム・パネル開閉を併用して確認する。画像確認で1280×720の撤退画面の地図が圧迫されていたため、オンラインの結果を左パネルへ移し、撤退・冬調整の地図領域を広げた。自動の性能スコアやFPS保証は行っていない。

ゲームルール・勝利条件・イベント生成・装備規則・Build/Disband規則、サーバー、原本KML、地図設定は変更していない。Discord Activity・公開デプロイ・次フェーズへ進まず、Phase 5Cで停止する。

再開時のSHA-256と比較し、rules-core・game-core・online-coreの実装、server、data/configの23ファイルが一致することを確認した。再開後に変更した既存ソースは `AdjudicationPresentation.tsx`、`App.tsx`、`GameFeel.tsx`、`GameSessionPanel.tsx`、`MapCanvas.tsx`、`OnlineGame.tsx`、`player-polish.css` とPhase 5Cテスト。完成済みの他のソースを編集していない。
