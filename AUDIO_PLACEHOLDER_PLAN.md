# Audio Placeholder Plan

短い仮効果音は ChatGPT 側でも支援可能です。

## 役割分担

### Codexに向いていること
- どのタイミングで鳴らすかの実装
- 音量設定
- ON/OFF
- 未配置ファイル時の安全処理
- 将来差し替えしやすい構造づくり

### ChatGPTに向いていること
- どんな音が適切かの設計
- 効果音一覧の仕様化
- シンプルな仮音源（短いbeep/click/chime/step等）の生成支援
- 音量バランスや長さの目安決め

## 推奨する最初の効果音
- select: 40〜80msの軽いclick
- order-confirm: 80〜150msの少し強いconfirm音
- march: 200〜400ms程度の短い移動音
- support-success: 120〜220msの補助感ある音
- sc-capture: 180〜350msの小さな上昇音
- standoff: 120〜220msの軽い詰まり音
- victory: 600〜1200msの短い勝利ジングル

## 注意
- 今は“本番音源”でなくてよい
- 仮音源はあとで差し替え前提
- まずは無音より分かりやすくすることが目的
