# Phase 5C 再開時の実装監査

確認日: 2026-10-04。再開時に既存の `TODO.md` は見つからなかったため、この一覧を新規作成した。仕様正本は `spec.md` 第29節。ゲームルール変更・次フェーズは対象外。

## 再開時点の一覧

| 区分 | 確認結果 | 実装根拠 |
| --- | --- | --- |
| 完了済み | Phase 5C仕様のspec反映、design tokens、command dock、軍選択・Move/Support/Hold反応、命令変更、フェイズbanner、確定表示、イベントカード、個人別終了見出し・順位・統計・ログ、任意6効果音slot、reduced motion、focus-visible、地図highlightのmemo化 | spec第29節、design-tokens.css、player-polish.css、BottomActionBar.tsx、GameOver.tsx、EventsPanel.tsx、sfx-manager.ts、MapCanvas.tsx |
| 未実装 | Phase 5C完了報告、Phase 5Cに合わせたREADME・試遊・音源配置説明 | PHASE5C_REPORT.mdなし。既存説明は結果を閉じる必要があるPhase 5Bのまま |
| 途中実装 | 非モーダル結果drawer・次入力の全体回帰検証、SC/Build/Disband/装備feedbackの確認、10種類の画面確認 | drawerを閉じずに撤退・冬調整する検証は成功。実京都の次命令検証は演出待ちで失敗し、該当画像が未保存 |
| 追加修正 | 装備取得位置の誤表示、背景タブから戻った際の演出終了確認、旧ブラウザテストの文言期待値 | 取得演出が移動した全軍に付く処理。前回38件中6件失敗（5件は旧文言、1件は演出終了待ち）。継続監査で命令変更後のpulse残留、毎フレームの地図形状再計算、SC反応の早期消失、撤退をBuildと誤判定する処理も確認 |

## Phase 5B報告と実ソースの照合

報告のイベントfocus、右クリック移動、自軍表示、二次候補、対象軍からの支援、裁定snapshot・秘密装備ID除去、BGM/march、中立SC、敵初期SCの即勝利条件、試遊ログ集計はソースに存在する。再開時点の全312件のユニット・統合テストでも確認した。報告上の機能が存在しない項目は見つからなかった。

「結果を閉じるまで入力停止」「サマリー中も裁定BGM」はPhase 5B当時の記録で、Phase 5Cで変更する仕様。過去の完了報告を改変せず、現在の説明を更新する。Phase 5B報告の302件/36件という数字も当時の検証記録である。

## 残作業

- [x] 装備取得の表示先を実際の公開装備消失地点と取得勢力に限定する。
- [x] 命令変更時に強調を解除し、SC feedbackを演出後まで保持する。Build/Disbandは実際の冬結果と照合する。
- [x] 地図形状の再計算を減らし、独立した撤退地点表示とローカルの装備数pulseを補う。
- [x] 画像確認で見つかった1280×720の地図圧迫を修正し、オンラインの前回結果を左パネルへ移す。
- [x] 演出の背景タブ復帰処理を確認し、drawerを閉じずに実京都の次命令を登録する。
- [x] Phase 5Cで変わった終了理由・期限表記を既存テストへ反映する。
- [x] lint / typecheck / unit・integration / build / 全browser / map:validateを完了する。
- [x] 1920・1280画面と、命令・支援・drawer・撤退・終了・イベント・中立SCの画像を確認する。
- [x] README・PLAYTESTING・音源配置説明を更新し、PHASE5C_REPORT.mdを作成する。
- [x] Phase 5C作業用の一時編集スクリプトを片付ける。

完成済みのルール、サーバー、原本KML、地図設定、既存の完了報告は編集しない。Phase 5Cで停止する。

## 最終状態

Phase 5Cの未実装・途中実装・追加修正は完了。lint・typecheck・build成功、unit/integrationは20ファイル318件成功、browserは38件成功、map:validateはError 0 / Warning 9。10種類の画像を確認した。残る人による対人試遊・実音源の確認は `docs/PHASE5C_REPORT.md` 第12節に記載し、今回の実装作業はPhase 5Cで終了した。
