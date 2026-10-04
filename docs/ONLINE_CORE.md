# オンラインAPIと秘密情報（Phase 7A）

Phase 7Aで通信の公開設定を追加した。公開版はFrontend Static SiteとBackend Web Serviceを分離し、VITE_ONLINE_SERVER_URLのHTTPS接続先へSocket.IO/WSSで接続する。BackendはproductionのFRONTEND_ORIGINと完全一致するoriginだけCORSとWS handshakeで許可する。PORT/0.0.0.0、health、SIGTERMを本番entryで扱い、debug endpointは登録しない。health確認・約90秒の起動待ち/backoffは接続開始・復帰中だけ行う。復帰tokenをログに出さない。Room/Gameはメモリのみで、Backend再起動・redeploy・休止で失われる可能性がある。詳細は [DEPLOY_RENDER.md](DEPLOY_RENDER.md)。以下のAPI・秘密状態・裁定は継承し、末尾のPhase 3A時点の対象外記録は現在の実装範囲とは異なる。

Hostはロビーで`{action:'scenario', json:string}`を送信できます。サーバーが厳格にparseして自身のDatasetからcompileし、成功時だけroomのscenario/config/map/report/hashを置換します。開始後と非Hostは拒否します。公開scenarioは名・hash・読込状態・客観数・Preflight errors/warningsを含みます。hashは設定と元Datasetをキー順正規化してSHA-256にしたものです。

`validateScenarioForOnlinePlay`はpureな開始前検証で、全11区の採用地域・初期軍・正式初期所有SC、軍のSC配置、地図検証、人数別SC目標を確認します。Startでも必ず実行し、warningだけなら開始できます。規定年数は中央設定の既定5年またはHost指定をsnapshotします。

`OnlineGameSession.matchLog`はGameSessionと分離しています。サーバー時計（テストでは注入時計）でphase開始・確定・全員確定・解決を記録します。公開Gameには`status / maxYears / endResult / summary`を追加しました。終了判定・順位はgame-coreの共通関数です。終了後は提出全種を拒否し、再接続と閲覧を許可します。

`{action:'export-log'}`のackは厳格schemaの`matchLog`を返します。進行中はHost限定、終了後は全参加者が利用できます。現在の秘密命令・予約を含めず、裁定後だけ最終命令を記録します。復帰token・socket ID・下書き履歴は含めません。静的地図の配信キャッシュはroom codeとscenario hashで識別し、読込成功後は全接続へ新しい地図を再送します。以下のPhase 3A時点の未確定な終了規則はこの節で更新しています。

Phase 4Aで公開viewへ`events`と勢力別`inventoryCounts`、本人viewへ`inventory`と`reservations`を追加しました。ordersのruntime schemaはGameOrderへ拡張し、自転車経路・設置対象・予約を本人だけに返します。裁定後の公開movementは`equipmentResults`に両区間または設置の説明を含みます。詳細は [EVENTS_AND_EQUIPMENT.md](EVENTS_AND_EQUIPMENT.md)、HTTPによる起動確認はREADME第16節を参照してください。

Nodeサーバーがゲーム状態の正本です。ブラウザから送れるのは希望・自軍の命令・撤退・冬の選択・確定状態です。盤面、軍所有者、割当、SC目標、裁定結果をクライアント入力で上書きするAPIはありません。

`packages/online-core/initial.ts` は希望優先のseed付き区割当と正式初期盤面を生成します。参加者IDと区IDをソートしてからFNV-1a / Mulberry32、Fisher–Yatesで抽選し、入力順に依存しません。seedと復帰tokenの発行にはNodeのcryptoを使います。PRNGは割当再現用です。設定値は `defaultGameSettings` に集約し、RoomManagerのコンストラクターから変更できます。

`RoomManager` はルーム、参加者、本人専用のSubmission、年間状態、割当、seed、固定参加人数、フェイズ通し番号、直前の公開結果を保持します。開始時地図はサーバーが自身のDatasetと作成者のMapConfigからcompile・検証して固定します。地理形状をクライアントから受け取って正本にする処理はありません。軍がない生存プレイヤーもOrdersでは空命令書を確定します。Retreatは排除軍所有者、Winterは必要解散または空いた初期地点SCへのBuildが可能な参加者だけがrequiredです。これにより何も操作できない冬は自動通過しますが、新しいOrdersは全員の明示確定を待ちます。

自動Holdはオンライン確定時に自軍の不足だけ補います。不正なMoveや他軍の命令をHoldへ置換しません。rules-coreは引き続き全軍分の命令を必須とします。全required確定の検査からロック・裁定まで同期処理で行い、awaitを挟みません。通し番号入りphaseKeyが一致しない再送・確定解除を拒否します。全員確定後は移動、必要なら撤退、春秋SC更新、冬、年末まで既存coreを使います。現在の終了条件と未確定の同点処理を維持します。

通信イベントは `request`（ack付き）、`publicState`、`privateState` です。[共有型/schema](../packages/shared/online.ts)をクライアントとサーバーが共用し、Zodで入力・出力を検証します。公式の[Socket.IO TypeScriptドキュメント](https://socket.io/docs/v4/typescript/)にある型付きイベントと別途runtime validationを採用しています。接続はVite/previewの `/socket.io` proxy経由なので同一originです。ゲームサーバーの標準候補は127.0.0.1:3001、Webは5173です。Phase 3Bのdev:onlineは未指定ポートが使用中なら+20まで空きを選び、実ONLINE_PORTを両方の子プロセスへ渡します。明示指定したポートは変更しません。起動・Windows用cmd・診断の手順はREADME第16節を参照してください。

`serializePublicState` は公開フィールドを明示列挙します。Room/Game/PlayerSessionそのものをJSONへ渡しません。割当、盤面、提出状況、解決済みの公開裁定だけを含めます。`serializePrivateState` は認証済み本人の下書き・確定済み入力と合法候補だけを返します。支援対象に他軍を含められますが、その軍の秘密命令を含めません。接続socketごとに本人viewを配信し、tokenは作成/参加のackだけで本人へ渡します。

保存した本人draftを配信してからrequest ackを返すため、画面の応答待ちが終わった直後の確定でも直前の編集が反映されます。単なるack到着を先に返して古いdraftを確定する競合を避けます。冬のチェック選択は応答待ち中にも見えるよう表示だけ先に更新し、エラーなら戻します。

復帰情報はタブごとのsessionStorageへ保存し、同じタブの再読込に対応します。複数タブで別々に参加できます。再接続はroomCode/playerId/32-byte crypto tokenを検証し、正しい本人だけへ公開/本人状態を再配信します。既存接続がある場合は新socketへ参加資格を移し、古いsocketの操作資格を外します。タブ複製はsessionStorageをコピーするブラウザがあるので、新しいタブを普通に開いてください。切断済みの確定入力は維持し、未確定者は待ちます。強制Hold・skip・timerはありません。ゲーム開始前のホスト切断時は接続中のplayerId順で移譲します。

部屋・ゲーム・draftはサーバーのメモリのみです。サーバー再起動復元・DB・アカウント認証・観戦・チャットは対象外です。接続/復帰credentialの認証は実装済みです。イベント・装備・自転車は後続フェーズで追加済み、Phase 7Aでは公開配備用コードと手順を追加しました。実公開は利用者のRender操作で行います。Discord Activityは追加していません。

静的MapDefinitionは各socketの参加/復帰時だけ送信し、以後のpublicStateではmapを省略します。クライアントは同じroomCodeの検証済み静的地図を保持して公開盤面を更新します。退出後に同じ部屋へ参加し直すときも地図を再送します。これにより京都227地域のgeometryを命令編集のたびに全参加者へ送信しません。
