# 仮効果音（Phase 6B）

7種類のWAVを同梱しています。`scripts/generate-placeholder-sfx.mjs` で正弦波・倍音・滑らかな音量包絡を合成した、このプロジェクト用の独自プレースホルダーです。第三者素材・サンプル音・ダウンロード音源は使用していません。PCM 16bit / mono / 22050Hz、最大振幅は約0.42です。ゲーム内ではさらにSE音量×0.45を適用します。

| ファイル | 用途 | 仮音の長さ |
| --- | --- | --- |
| select.wav | 自軍選択 | 65ms |
| order-confirm.wav | 命令受理 | 130ms |
| march.wav | 移動演出中の単一グループloop | 320ms |
| support-success.wav | 支援成功 | 200ms |
| sc-capture.wav | 自分のSC増加 | 300ms |
| standoff.wav | スタンドオフ | 180ms |
| victory.wav | 本人の勝利・共同勝利 | 900ms |

BGMと効果音のON/OFF・音量は独立し、ブラウザへ保存します。「音量・設定」→「効果音を試す」で各音を確認できます。進軍の試聴は一度だけ、本番移動は従来どおり一つのloopで、終了・skip・画面退出・SE OFFで停止します。

未配置・404・再生拒否でもゲームは続行します。音源を差し替えるときは自作・利用許諾のあるファイルをpublic/audio/sfxへ置き、`apps/web/src/audio/sfx-manifest.ts` のsrcを変更してください。MP3へ差し替えても構いません。長さの目安はmanifestとAUDIO_PLACEHOLDER_PLAN.mdにあります。入力や裁定を待たせるタイマーではありません。

再生成: `npm.cmd run audio:generate`。この操作は表の仮WAVを上書きします。独自音源は別名で保存してください。本番previewはbuild後に反映されるので、distを直接編集しません。BGMは未同梱で、既存のdomestic/adjudication slotを維持しています。
