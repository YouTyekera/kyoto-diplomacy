# Phase 5A.1 修正報告

日付: 2026-10-03。指定されたspec、Phase 4B報告、Phase 5A / 5A.1 DECISIONSと関連コードを確認し、最初にPhase 5A.1 DECISIONSの全文をspec第27節へ反映した。Online読込・件数診断とSC/Army表示の修正・回帰検証を完了した。今回の修正後に停止し、UI全体の追加整理・BGM・Discord Activity・公開デプロイへ進んでいない。以前に実装済みのPhase 5A機能は保持した。

**確認範囲:** 申告された「正常な京都ルームへ読んでも0/0/0」の症状そのものは、現行コードと今回見つかった実ファイルでは修正前にも再現しなかった。一方、作成時Datasetの取り違えによる読込失敗と、SC円の軍の有無による寸法差は、修正前に失敗するテストで確認した。元の症状と確認したDataset不整合が同一原因とは断定しない。

## 1. 確認した根本原因と修正前の再現

### Online読込

旧 `RoomManager.request` のscenario処理は `compileScenario(this.datasets[room.datasetKind], request.json)` を呼んでいた。アップロードしたJSONの地域一覧を照合せず、ルーム作成時のDatasetを固定使用する。

京都JSONを京都Datasetでcompileした場合、共有schema後も設定は残り、190/72/59になった。Zodがregionsをstripする処理、標準blank設定の再読込、mapIdのみのcompileキャッシュ、正しい京都uploadのblankへのfallbackは確認できなかった。

サンプルDatasetで作成したルームへ同じ京都JSONを送ると、compileはsample-a等の地域を対象にし、京都の227設定キーと一致しない。地域の設定が見つからない箇所には `emptySettings()` が入り、その後の参照検証でuploadを拒否する。既存のルーム設定が保持されるため、ロビーにはアップロード前の件数・開始前エラーが残る。

この経路を `phase5a1.test.ts` に追加して修正前に実行し、京都作成ケースは成功、サンプル作成ケースは「存在しない地域/地域設定がない」で失敗することを確認した。現行クライアントでは正常な京都データ配信時は京都ルームを作るが、サンプルへの切替・変換データ未配信時やサンプルの既存ルームではこの不整合が起こりうる。

今回の修正はこの確認済みの不整合と、件数が失われた場合の検知・診断に対するもの。元の0件症状については、当時の実ファイル、起動プロセスの版、requestログがないため原因未確定である。

### マーカー

旧MapCanvasは軍のあるSCを半径11、軍のないSCを半径6とし、所有者リングも9 / 3.8で切り替えていた。Armyのtipは同じtoken座標のy=9なので、SCをArmyの外周背景に拡大していた。

修正前ビルドで新しいPlaywright寸法テストを実行し、SC半径の種類数が期待1に対して2となり失敗することを確認してから変更した。

## 2. Editorとの違い

Editorは読み込んだ設定を現在のDatasetと参照照合してから採用する。京都Datasetを表示している場合、実ファイルの227地域キーと一致して成功する。Onlineはサーバー側でルーム作成時のDatasetを使い続けていたため、作成モードが異なる場合だけ別のgeometryに結合しようとしていた。

MapConfigのfield解釈は従来も共有 `configSchema` であり、別のenabled / SC / 軍の解釈はなかった。今回 `parseMapConfig` を共有helperとして追加し、Editorの保存設定復元・JSON読込、Onlineのクライアント検証、サーバーcompileで同じparserを使う。

Onlineのクライアントはファイル・JSON解析・設定形式・サーバー処理の失敗を分ける。サーバーが読込を拒否した場合は、その段階とvalidation issueをHostのファイル読込欄へ表示する。通常画面の汎用エラーだけで読込結果が分からない状態を避ける。

## 3. 修正したdata flow

1. `<input type=file>` から文字列を読み、JSONを解析。
2. 共有 `parseMapConfig` でruntime validation。
3. `mapConfigCounts` の地域レコード数・採用数・SC数・初期軍数をrequest metadataとしてJSONとともに送信。
4. 共有request schemaでpayloadとcountsを検証。
5. サーバーでJSON解析・同じMapConfig parserを実行。
6. アップロードの全地域キーが一致するサーバー所有Datasetを選択。作成時Datasetに一致すればそのDatasetを継続し、一致しなければ別のサーバーDatasetを照合する。mapIdだけでは選択しない。
7. アップロードしたMapConfigそのものを `compileScenario` → `compileMap` へ渡す。
8. サーバーの元geometryを結合し、障害物差し引き・隣接生成・override・地図検証を実行。
9. compile後のPreflight件数をraw設定の集計・クライアントmetadataと比較。
10. ルーム人数で既存Preflightを実行し、候補scenario/map/Datasetをまとめて置換。public summaryとhashを配信。

`regions / enabled / isSupplyCenter / homeWardId / startingUnit / adjacency / adjacencyAdd / adjacencyRemove / obstacles` はアップロード値を使用する。原本KMLや標準blank MapConfigをアップロード設定の代わりに使用しない。クライアントのMapDefinitionを正本にする方式へ変更していない。

Preflightのゲーム開始条件は変更していない。設定としてcompile可能でも開始前の不足があるJSONは、従来どおりロビーでその不足を表示し、Startを拒否する。件数照合自体が失敗した場合は読込を成功扱いにしない。

## 4. 実ファイル・fixtureの件数

Downloads / Desktop / Documents内で見つかったファイルは `C:\Users\zikke\Downloads\kyoto-urban-config.json`。その内容を加工せず `tests/fixtures/phase5a1-kyoto-map-config.json` へコピーした。DECISIONSにある `(3)` 付きファイル名の実ファイルは見つからなかったため、同一ファイルとは断定しない。今回のファイルは要求された件数と一致する。

コピー元・fixtureのSHA-256はともに `0890799a41e08e9049a1c6709b74437acdaf22b38022811561d5766665359652`。

| 段階 | region records | enabled | SC | starting units |
| --- | ---: | ---: | ---: | ---: |
| 実ファイルのJSON集計 | 227 | 190 | 72 | 59 |
| Editor共有parser | 227 | 190 | 72 | 59 |
| Online requestのJSON・metadata | 227 | 190 | 72 | 59 |
| サーバー共有parser / compile input | 227 | 190 | 72 | 59 |
| サーバーcompile / Preflight | 227 | 190 | 72 | 59 |
| ロビーのpublic summary | 227（配信map） | 190 | 72 | 59 |

原本Datasetはサーバー側の00670・227地域。fixtureはユーザーが編集した設定の回帰用保存であり、repo標準の採用範囲・配置へ昇格していない。標準設定は採用0 / SC0 / 軍0を保持する。

ロビーでは既存RoomCardに採用190地域 / SC72 / 初期軍59、設定ファイル名、短縮scenario hashを表示する。全文hashは従来の開発用詳細へ保持する。

## 5. Atomic replacementと診断

共有compile helperは候補scenarioを生成するだけで、既存ルームへ途中書込みを行わない。JSON解析、schema、Dataset照合、地図compile、件数照合のいずれかが失敗したら既存scenario・map・Datasetをすべて保持する。default blankへ戻さない。

クライアントcountsとサーバーcountsはバグ検知のために比較し、正本はサーバーでcompileした結果。クライアントmetadataだけでゲーム状態を採用しない。不一致時には「アップロード設定とサーバーコンパイル結果が一致しません」を返す。

Socket.IO serverはscenario requestにrequest IDを発行し、`json / schema / dataset / compile / preflight / room-preflight / replaced` または失敗したstageを `[scenario-upload]` としてログ出力する。解析後のcounts、compile後counts、Dataset種別を記録する。JSON全文・地域一覧・復帰tokenは出さない。JSON解析以前の失敗ではcountsは取得できない。

既存のHost限定、開始後変更禁止、room code + scenario hashによる地図再配信も維持する。

## 6. SCのgeometry

`MapMarkers.tsx` に独立した `SupplyCenterMarker` を追加。この部品はArmyの有無を入力として受け取らない。

同一zoomでSC円は半径6・stroke 1.6、所有者リングは半径3.8・stroke 2で共通。中心は既存の地域displayAnchor。neutral / ownerの色だけを従来の意味で変える。軍のあるSCだけ巨大なhaloへ変更する分岐は削除した。

既存semantic zoomのscale・min/maxは継続する。同じzoomとviewportでは占有の有無によるSC直径・strokeの差はない。地域fill、現在支配、SC所有ルール、地域anchorは変更していない。

## 7. Armyの配置とlayer順

既存の独自teardrop pathの形状・勢力色・陸軍記号は保持し、`ArmyMarker` のローカル座標を上へ9移動する。pathのtipがy=9なので、変換後の尖端は地域anchorのy=0になる。bodyはSCの上側へ伸びる。

SVGでは全SCを `supply-layer` に描いた後、全Armyを `army-layer` に描く。地域・障害物・命令線・公開イベントは既存の表示を保持する。SCをArmy全体の外周リングへ拡大せず、ArmyがSC上に立つ位置関係とした。

SC layerでもhover・click・キーボード選択を維持する。Armyの選択・tooltip・細い強調も維持する。テストのSC参照は独立した `data-supply-region` に更新し、Armyの `data-marker-region` は保持する。

## 8. テスト結果

| コマンド | 結果 |
| --- | --- |
| `npm.cmd run lint` | 成功 |
| `npm.cmd run typecheck` | 成功 |
| `npm.cmd run test` | 17ファイル・282件すべて成功（既存271 + 追加11） |
| `npm.cmd run build` | 成功。NOTICE、licenses、地図データ配信を保持 |
| `E2E_PREVIEW=1 npm.cmd run test:browser` | 32件すべて成功（既存29 + 追加3）、build済みpreviewで実施 |
| `npm.cmd run map:validate` | エラー0、既存警告9。標準227地域・採用0 / SC0 / 軍0 |

修正前にシナリオのDataset不整合テストとSC寸法テストの失敗を確認した。修正後は実JSON・共有parser・request schema・compile入力の設定保持、190/72/59、default未混入、障害物・隣接override、失敗時の参照同一性、件数不一致の診断、複数zoomでのSC同寸法・tip位置・描画順を追加検証した。

過去のSC寸法テストは旧halo方針を期待していたため、最新DECISIONSに合わせて「SCがArmy外周より小さい独立円」へ更新した。所有者色・支配色・アンカー・ズーム・パン・選択など他の回帰assertionは保持する。既存ゲームルール・秘密情報・装備・再接続・終了・音声のテストもすべて成功。

既存のZod注釈除去・500kB超bundle警告、接続を閉じた際のVite ws proxy ECONNABORTEDは残るが、buildと全テストは成功する。

## 9. 実ブラウザ・画面確認

Playwrightの実Chromiumで次を確認した。

1. 実ファイルをEditorで読み、採用190を確認。再保存したJSONの設定値が元ファイルと一致。
2. 京都ルームとサンプル作成ルームの両方で同じ実ファイルをupload。
3. 採用190地域 / SC72 / 初期軍59と読込済み表示、3人の京都ロビーでError 0を確認。
4. 不正な地域一覧をuploadするとDataset照合の失敗理由が見え、以前のsummaryを保持。
5. 3人で実京都シナリオを開始し、227地域とSC72個の描画を確認。「採用地域0」のエラーは出ない。
6. 1280×720の同じ地図・zoomで軍ありSCと軍なしSCを並べ、半径・stroke・実描画幅が一致。3段階zoomでtipがSC内、SC layerがArmy layerより背面であることを確認。

生成画像を目視確認した。Armyが小さいSC円の上へ立つ形を確認できる。低zoomの実京都全体での都市中心部のマーカー密集は既存の制限であり、今回は配置・zoom設計の追加変更を行っていない。

- [SC/Army比較・zoom 1](../test-results/phase5a1-marker-zoom-1.png)
- [実京都オンライン・1280](../test-results/phase5a1-kyoto-online-1280.png)

画像はtest-results内の生成物で、次回テストで再生成する。手動の長時間対人試遊・物理LAN検証は今回実施していない。申告された `(3)` の実ファイルや当時のrequestが今回のfixtureと異なる場合、その条件での再確認は残る。今回の修正・回帰検証を終え、追加フェーズへ進まず停止した。
