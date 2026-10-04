# Phase 6B 完了報告

確認日: 2026-10-04。Phase 6B実装・検証完了。本フェーズで停止。対象は盤面の視認性・自然背景・色味・カメラ・仮SEのみ。

## 確認資料・変更範囲

spec.md、README、PHASE6A_REPORT、最新PLAYTESTING、これまでのDECISIONS全12ファイル、UI_UX_GAME_FEEL_GUIDE、試遊ログ2件を確認した。新規のPhase 6B DECISIONS/プロンプトファイルはなかったため、今回のユーザー指示をspec第31節へ最初に反映した。旧フェーズの仕様・報告は履歴として保持した。

最新の実試遊ログは `match-log (1).json`。3人・第1年冬の規定年数終了、山科区8SC・伏見区7SC・北区5SC。春は約201.8秒、Move3 / Hold11 / Support Move1、排除1件。秋は約146.0秒、Move1 / Hold14。以前の `match-log.json` は春437.5秒・秋183.7秒で、別の試遊として確認した。これらにはクリック座標や選択表示の描画情報がないため、SCの不具合判定は実ブラウザで行った。自動テストで生成されるログとは区別している。

ゲームルール・裁定・勝利・イベント・装備・SC更新・Build/Disbandは変更していない。開始時のSHA-256と比較し、server、packages、data/source、data/maps、data/configの保護対象287ファイルに変更なし。KML/MapConfigの採用地域・形状・アンカー・隣接を変更せず、自然背景をMapDefinitionや通常グラフへ登録していない。

## 1. SC選択表示

画面を持つChromiumで、下京区「修徳」の軍なし中立SCを実際にクリックし、大きな黒い表示を再現した。SC本体のfillは淡色のままだったが、SCを包む `supply-region-marker` のfocusは **`rgb(16,16,16) auto 5px`** だった。地域とArmyには既定outlineを抑止するCSSがあり、SCの独立グループには欠けていた。SVGのズーム下でブラウザ既定の黒いフォーカス表示が大きく見え、SC・地名を覆っていた。

- SCグループの既定outlineを明示的に抑止した。修正版の実クリックではoutline-styleはnone。
- 選択・hoverを外側の細い青緑リングで示す。リングはfillなし、strokeは画面上1.3px、pointer-eventsなし。キーボードfocusは同じリングを破線にする。
- SC本体と選択リングを別レイヤーにした。SC半径6、所有リング半径3.8という従来geometryと、Armyあり／なしで同寸法という構造を維持する。
- SC選択でArmyや地域名を黒塗りしない。所有色と中立破線、自軍haloも維持する。
- プレイヤー盤面の地名はhoverまたは選択中の1地点を優先する。ズームだけで大量のマーカー名を同時表示せず、所属・支配・SC所有はtooltip、インスペクタ、トレイで確認できる。
- SVG文字の白い縁取りをnon-scaling-strokeへ変更し、イベント地名などがズーム時に大きな白い塊になる表示も抑えた。

SCの実マウス・Tab/Enter、軍密集部、ArmyとSCの重なりを両解像度で確認した。

## 2. 山地・非プレイ領域背景

`TerrainBackdrop.tsx` に独自SVGの山、樹木、緩い等高線、紙の粒子を実装した。淡いセージ色の背景を盤面より低いコントラストで描き、パン・ズームに合わせて地形記号が盤面へ追従する。

全採用地域の `playableGeometry` と既知の障害物形状をSVG maskで保護する。非採用領域の旧灰色塗りはプレイヤー画面だけ透明にし、地域追加なしで外周の自然背景を見せる。背景はaria-hidden・pointer-events:noneで、クリックや右クリックMoveを妨げない。エディタの採用／除外表示は維持する。

京都御苑の下に山の記号が透けた箇所を目視で見つけ、障害物も背景マスクへ含めた。御苑は従来の濃い緑・境界・ハッチングで示す。実京都の確認シナリオでは採用190形状＋障害物1形状のマスク。御苑の通行不可・形状・隣接の意味は変更していない。

山・森はゲーム用の象徴的な装飾で、現実の標高・植生の復元ではない。参照画像の「3枚目」は今回のメッセージに添付されていなかったため、文章で指定された方向性に基づき制作した。他作品の画像・素材・UIや第三者素材は使用していない。

## 3. 色味

`operation-board.css` でプレイヤー用の色を調整した。

| 対象 | 表現 |
| --- | --- |
| 盤面下地 | 温かい紙色 `#eee9d7` |
| 中立のプレイ地域 | 紙色 `#e9e5d6` |
| 外周の自然背景 | セージ `#b9cbb7`、控えめな山・森・等高線 |
| HUD・トレイ・dock | `#eee9db` / `#f6f2e6` 系の薄い面 |
| 地域境界 | 灰緑 `#748d7a`、0.85pxの画面固定線 |
| 選択・合法移動先 | 明るい2px輪郭／青緑の実線、二次候補は破線 |

勢力の基準色は既存データのまま。SCかどうかで領土のfillを変えず、controllerとSC ownerの表示分離を維持する。白い管理画面風の面を減らし、領土・駒・命令線へ視線が向く構成にした。左右トレイの折りたたみとcommand dockの操作内容はPhase 6Aを維持する。

## 4. 仮SEの生成・配置・再生

`scripts/generate-placeholder-sfx.mjs` で7つのWAVをローカル生成し、`apps/web/public/audio/sfx/` へ同梱した。外部取得・録音サンプルを使わず、正弦波と倍音・滑らかな音量包絡を合成する。PCM 16bit / mono / 22050Hz、peak約0.42。既存再生側でさらにSE音量×0.45を適用する。再生成は `npm.cmd run audio:generate`。再生成は仮WAVを上書きするので、差し替え音源は別名＋manifest変更を推奨する。

| slot / ファイル | 長さ | 既存フック |
| --- | --- | --- |
| select.wav | 65ms | 自軍選択 |
| order-confirm.wav | 130ms | 命令が受理された後 |
| march.wav | 320ms | 移動演出中の単一グループloop、終了・skipで停止 |
| support-success.wav | 200ms | 公開裁定の支援成功 |
| sc-capture.wav | 300ms | 自分のSC増加 |
| standoff.wav | 180ms | 公開裁定のスタンドオフ |
| victory.wav | 900ms | 本人の勝利・共同勝利 |

manifestの参照を生成済みWAVへ変更した。BGM slot・切替・保存設定は維持し、BGM音源は追加していない。BGM/SEのON/OFF・音量は独立。未配置・404・再生拒否・遅延play promiseの安全処理を維持する。Audioは演出で、ゲームの進行条件へ使わない。

設定に「効果音を試す」を追加した。進軍の試聴は一度だけ鳴り、本番の単一グループloopと区別する。SE OFF・音量0では試聴ボタンを無効にする。

ブラウザ検証ではHTMLAudioElementのplayを偽物に置換せず、7種類すべてで音源200応答、readyState、duration、currentTimeの進行を確認した。独立した画面付きChromiumでも全7音を試聴操作から再生し、readyState=4、既定volume=0.315を確認した。Web Audioの実出力経路でも非ゼロの信号を測定した。記録は `manual-audio-proof.json` と `manual-audio-signal.json`。機器・スピーカー別の聴感や長時間の音量バランスを保証するものではない。

## 5. 初期表示・fit・構図

大きな外周ポリゴンと固定1.25の縦横比に合わせる方式から、画面の実際の縦横比でSC・軍を中心にfitする方式へ変更した。`board-camera.ts` は表示用の座標だけを扱う。

- 初期表示: 全SCと初期軍のアンカー＋16%の余白。都市部を大きくしつつ、自然背景も見える構図。
- 「全体に戻す」: 全SCと現在の軍を含める。移動後の軍を復帰表示から除外しない。
- 「全プレイ範囲」: 全採用ポリゴンへ10%の余白でfit。通常表示で切れる無人の外周も確認できる。
- SC・初期軍のアンカーが1点以下の小さな検証地図は、採用領域全体へfitし、合法地域や地面装備を画面外へ取り残さない。
- パン・ホイール・＋/−・行政区拡大・イベントfocusを維持する。操作や演出のたびに強制的に初期構図へ戻さない。

同じ実京都シナリオで通常表示の地理スケールを測定した。

| 画面 | SVG領域 | 以前のviewBox高 | 新しい作戦表示高 | 地理形状の拡大比 |
| --- | --- | --- | --- | --- |
| 1920×1080 | 1904×916px | 350.49 | 232.14 | 約1.51倍 |
| 1280×720 | 1264×556px | 350.49 | 232.14 | 約1.51倍 |

キャンバス寸法はPhase 6Aの広さを維持し、その中の都市部を約51%大きくした。この比率は地理形状の表示スケールで、駒の画面サイズを51%増やしたという意味ではない。全SC・初期軍の表示位置が作戦表示内に入ることも検証した。地域・SC・Armyの削除やアンカー変更はない。

右クリックMoveはE2Eに加え、画面付きブラウザで両解像度の自軍左クリック→合法な「小川」へ右クリックを実施した。サーバーprivateStateのMove、矢印1本、dock「移動 → 小川」を確認。右ボタン押下中に1px動かしてもviewBoxは変わらない。左ドラッグ、地面装備への右クリック、フォームを使わない左クリックfallback、支援・装備wizardも回帰検証している。

## 6. テスト結果

| コマンド | 結果 |
| --- | --- |
| npm.cmd run lint | 成功 |
| npm.cmd run typecheck | 成功 |
| npm.cmd run test | 21ファイル・328件成功 |
| npm.cmd run build | 成功 |
| npm.cmd run test:browser | 43件成功・失敗0件。最終実行4.3分 |
| npm.cmd run map:validate | 成功・Error 0 / Warning 9 |

ブラウザは製品buildのpreviewで検証し、独立した画面付きChromiumでも最終版を目視・実操作した。テスト用京都190地域 / SC72 / 初期軍59を使用し、3勢力の対局を確認した。本番MapConfigに検証配置を適用していない。

初回ブラウザ実行は38成功・5失敗。選択リングをSC本体の中へ含めてgeometryの測定と所有リングの参照を変えてしまった箇所は、リングを独立レイヤーへ移して修正した。地域の選択線は従来の細い2pxを維持した。単一SCの検証地図を寄せすぎるfitは全採用領域へのfallbackで修正した。新規テストの2回目の試聴UIが閉じたままになる操作手順も修正した。これらの修正後は全43件成功。最後に目視で見つかった御苑下の装飾透けを補正し、最終版でも全43件の成功と両解像度の実操作を確認した。

既存のmap警告9件は御苑との重なり・分断、原本MultiPolygon、採用未設定。標準設定は227地域・採用0・SC0・初期軍0を維持する。buildには既存のZodコメントと500KB超bundle警告が残る。最終JSは591.31KB（gzip 180.65KB）、CSS36.73KB。終了時のVite proxy ECONNABORTEDとNO_COLORのログも出る。

## 7. スクリーンショット

保存先は [screenshots/phase6b](screenshots/phase6b)。最終版のE2E14枚、独立した実ブラウザ14枚、修正前比較2枚、計30枚。SE実再生のJSON記録2件も保存した。test-resultsの再作成で消えない場所へコピーしている。

| 画面 | 1920×1080 | 1280×720 |
| --- | --- | --- |
| 通常盤面 | [normal-1920.png](screenshots/phase6b/normal-1920.png) | [normal-1280.png](screenshots/phase6b/normal-1280.png) |
| 全範囲・自然背景 | [nature-1920.png](screenshots/phase6b/nature-1920.png) | [nature-1280.png](screenshots/phase6b/nature-1280.png) |
| SC選択 | [sc-selected-1920.png](screenshots/phase6b/sc-selected-1920.png) | [sc-selected-1280.png](screenshots/phase6b/sc-selected-1280.png) |
| 軍密集・command dock | [army-dock-1920.png](screenshots/phase6b/army-dock-1920.png) | [army-dock-1280.png](screenshots/phase6b/army-dock-1280.png) |
| 実右クリックMove | [move-1920.png](screenshots/phase6b/move-1920.png) | [move-1280.png](screenshots/phase6b/move-1280.png) |
| イベントfocus | [event-1920.png](screenshots/phase6b/event-1920.png) | [event-1280.png](screenshots/phase6b/event-1280.png) |
| SE試聴・設定 | [sfx-1920.png](screenshots/phase6b/sfx-1920.png) | [sfx-1280.png](screenshots/phase6b/sfx-1280.png) |

独立した画面付きブラウザの画像は、上表と同じ名前へ `manual-` を付けた14枚。修正前比較は `before-normal-1920.png`、`before-sc-selected-1920.png`。実画面を見て、黒いSC枠の解消、駒・SC・地名の識別、自然背景、dock、イベント、音量設定の見え方を確認した。

## 8. 残るUI課題

- 3勢力の画面を中心に検証している。11人同時操作・長時間試遊・複数PCで、情報密度と仮SEの頻度を評価する余地がある。
- 近接アンカーのSC・Armyそのものは自動で押し出さない。今回ラベル密度は下げたが、密集地ではズーム・hoverを併用する。全ての衝突を自動解消したわけではない。
- トレイ・dock・tooltipの箱が近くの別地域を覆う場合は、閉じる／パンで確認する。モバイル全面最適化は対象外。
- 自然背景は象徴的な反復パターン。標高や実際の植生に沿った地形表現ではなく、美術的な最終仕上げではない。
- 採用された大きな外周地域の無人部分は、通常のSC・軍中心表示では切れる場合がある。「全プレイ範囲」で確認できる。ルール上の地域を省略したものではない。
- 仮SEは差し替え可能な簡易音。実際の交渉音声との混ざり方、機器別の聞こえ方は次の試遊で確認する。BGMは未配置のまま。
- FPSの保証や全ブラウザ・全OS・全入力機器の動作保証は行っていない。

Phase 6Bで停止する。公開デプロイ・Discord Activity化・新ルールには進まない。
