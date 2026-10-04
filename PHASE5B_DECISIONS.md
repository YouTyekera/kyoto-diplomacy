# Phase 5B 仕様差分 — 初回試遊UX改善・裁定演出・Audio・勝利条件調整

Status: Phase 5B 実装前の決定事項
Date: 2026-10-03

この文書は既存の `spec.md` と Phase 1.5 / 2A / 2B / 3A / 3B / 4A / 4B / 5A / 5A.1 の決定事項に対する追加・変更である。
矛盾する場合、この文書を優先する。

Phase 5Bでは初回対人試遊で明確になった「操作の分かりづらさ」「盤面情報の発見しづらさ」「裁定の味気なさ」を改善する。
大規模な美術刷新やDiscord Activity化はまだ行わない。

# 1. 初回試遊から確認した優先課題

今回の3人試遊では、ゲーム開始時のSC/軍は以下だった。
- 26102: SC6 / Army6
- 26104: SC6 / Army6
- 26111: SC5 / Army5

1年目春は全員確定まで約437.5秒、秋は約183.7秒を要した。
春の17命令はMove15 / Hold2、秋の17命令はMove6 / Hold11で、Support命令は記録されなかった。
春はstandoff 1 / dislodgement 0、秋はstandoff 0 / dislodgement 0。
1年目冬には合計7軍のBuildが発生した。

これを踏まえ、Phase 5Bは「ルール追加」より、地図操作・支援入力・イベント発見・裁定演出を最優先する。

# 2. 公開イベントを地図上で発見しやすくする

現在「道路工事: 柏野 ↔ 乾隆」のように名称だけ表示されても、広い京都マップ上で位置が分かりにくい。

全ての位置を持つ公開イベントに以下を実装する。

対象:
- Roadwork
- Temporary Bus
- Ground Bicycle
- Ground Barricade
- Active Barricade

## 2.1 Event card

イベントカードへ:
- 地域名
- 行政区名
- 効果
- `地図で見る`
を表示する。

例:
`道路工事: 柏野（北区） ↔ 乾隆（上京区）`

## 2.2 Hover

イベントカードhover中:
- 対象regionを強調
- edge eventなら両regionとedgeを強調
- その他の地図要素を完全に隠さない

## 2.3 Click / 地図で見る

クリック:
- 対象が見える位置へmap pan
- 必要なら適度にzoom
- 1～2秒程度pulse
- edge eventは対象境界を目立たせる

Roadwork:
- 工事edgeを太めのconstruction-style線または明確な×/ストライプで表示

Bus:
- 2点を結ぶ臨時路線を明確に表示

Ground Equipment:
- markerを中心へfocus

Active Barricade:
- edge + 残り季節をfocus

# 3. 自軍識別

現在、自分の担当区は分かっても、盤面の多数のArmy pinの中から「どれが自軍か」が直感的でない。

## 3.1 Own Army marker

自分のArmyだけ、勢力色に加えて色以外の追加識別を持つ。

推奨:
- 1～2pxの明るいouter halo / double outline
- 小さなself marker notch

敵軍には付けない。

文字「YOU」を全Armyへ常時描かない。

## 3.2 Header

Top HUDに:
`あなた: 西京区`
+ 勢力色swatch
を常時表示する。

## 3.3 Hover

自軍hover:
`自軍 / 地域名`

他軍hover:
`○○区軍 / 地域名`

# 4. 右クリックでMove

通常Ordersフェイズで:

1. 自軍unitを左クリックして選択
2. 移動可能regionを表示
3. 移動可能regionを右クリック
4. 即座にMove orderを作成

とする。

Map内ではcontextmenuを抑止する。

条件:
- own unit selected
- command wizard（Support/Bicycle/Barricade等）の途中ではない
- right-click targetがlegal Move destination

成功後:
- Move arrowを即表示
- order summaryを更新
- toast例: `修徳 → ○○へ移動`

invalid right-click:
- orderを変更しない
- 短い非modal feedback
- raw rule codeを表示しない

Touch/mobileはBottom Action Barによる従来操作を維持。

# 5. 2手先の移動理解

選択中Armyの直接隣接だけでなく、
「その移動先から、さらにどこへ接続しているか」を地図上で理解できるようにする。

## 5.1 Normal Move

Army Aを選択:
- immediate legal destinations = primary highlight

Primary destination Bをhover:
- Bから現在のeffectiveAdjacency上で隣接するregion = secondary highlight
- primaryとsecondaryは明確に違うstyle

表示文:
`次の一歩の参考（現在の通行条件基準）`

将来の季節にはイベントで道路状況が変わりうるため、
「次ターン確実に行ける」とは表示しない。

## 5.2 Bicycle

BicycleMove選択時は同じ2段表示を実際のA→B→C選択に利用する。
この場合secondaryはactual legal second legとして扱う。

# 6. Support入力を二段階で直感化

現状のSupport UIは「軍を支援するのか、移動先を支援するのか」が分かりにくい。

新しいSupport wizard:

1. 支援する自軍を選択
2. `支援`を押す
3. Step 1: `どの軍を支援しますか？`
4. map上の支援候補unitを強調
5. target unitをクリック
6. Step 2:
   - `この軍の現在地を守る`
   - `この軍の移動を支援する`
   を明示
7. Move supportの場合、legal destinationだけ強調して選択

## 6.1 Support Hold

`現在地を守る`:
- target unit current regionを選択済みとして扱う
- supporter -> target regionへsupport line

## 6.2 Support Move

`移動を支援する`:
- target unitが移動可能
- supporterがsupport可能
の両条件を満たすdestinationだけ表示する。

自軍targetに既にMove orderがある場合:
- そのdestinationを「現在の移動命令」として推奨表示
- ワンクリックでSupport Moveを設定可能

他勢力unit:
- その勢力の秘密命令を絶対に表示しない
- プレイヤーが「この軍がこの地域へ動く」という意図を手動指定する

## 6.3 Summary

設定後:
`○○の △△ → □□ を支援`
または
`○○を現在地で支援`
と自然言語で表示。

dashed support lineを盤面へ描く。

Escape / キャンセルでwizard解除。

# 7. 裁定Presentation

現在は裁定計算直後に最終状態へ飛ぶため、結果を見る余韻がない。

ゲームルール/サーバー裁定結果は変更せず、
Client presentation layerを追加する。

## 7.1 Snapshot

裁定前にpresentation用に:
- pre-resolution unit positions
- submitted orders（裁定後公開可能なもの）
- support relations
- result success/fail
- standoff
- dislodgement
- post-resolution unit positions
を保持する。

server authoritative resultが正本。

## 7.2 Animation sequence

既定約3～4秒。設定値化する。

推奨:
- 0.0～0.4s: Move arrows / Support lines表示
- 0.4～2.0s: Move unitをslide
- failed Moveは目的地方向へ約40%進んで戻る
- successはdestinationへ到達
- support lineはpulse
- 2.0～2.6s: standoff flash / dislodged shake
- 2.6～3.4s: final boardへsettle
- その後結果summary表示

`スキップ`ボタンを用意する。

複数unit移動は同時にanimateし、先着順処理に見せない。

Reconnect時、古いanimationの再生を強制しない。
final authoritative boardへ復帰できる。

# 8. Audioを今回のUX改善へ統合

以前の細かいAudio専用フェーズは行わず、Phase 5Bの裁定Presentationへ最低限追加する。

ユーザー制作音源を利用しやすいslotだけ作る。

推奨配置:
`apps/web/public/audio/`

```text
audio/
├─ bgm/
│  ├─ domestic.mp3
│  └─ adjudication.mp3
└─ sfx/
   └─ march.mp3
```

第三者素材やダミー音源をCodexが追加してはならない。
ファイル未配置でも無音でゲーム続行。

## 8.1 BGM

`domestic`
- Orders / Retreat / Winter / 通常盤面操作

`adjudication`
- 裁定Presentation開始から結果summary終了まで

同じdomestic context内でSpring→Autumn等へ変わっても頭から再生しない。

domestic ↔ adjudicationは短いfade/crossfade。

## 8.2 March SFX

unit slide中:
- `march.mp3` を一つのgroup SFXとして再生
- unit数分を同時多重再生しない
- animation skip時は停止
- animation終了時は停止

## 8.3 Minimal settings

Audio設定は最小限:
- 音楽 ON/OFF
- BGM音量
- 効果音 ON/OFF
- 効果音音量

localStorage保存。

ブラウザautoplay blockでゲームを止めない。

# 9. Neutral Supply Center表示

SC markerの表示色は `supplyCenterOwnerWardId` だけを正本とする。

`controllerWardId` をSC marker色へ流用しない。

## 9.1 Neutral SC

`supplyCenterOwnerWardId === null`:
- white / light neutral fill
- dark neutral border
- faction color ringなし
- 自勢力領土内でも必ずneutral appearance

Tooltip:
`補給拠点: 中立（未所有）`

## 9.2 Owned SC

ownerあり:
- 同じ基本SC geometry
- owner faction color ring
- tooltipにowner

Army有無によるSC size差は禁止（Phase 5A.1維持）。

# 10. 少人数の勝利条件

現行3人戦ではSC総数72に対し勝利目標23。
3×23=69で総SC72以下なので、理論上は3人全員が勝利目標相当のSCを持ちうる。
少人数時のneutral expansionだけで即時勝利へ近づく問題を抑える。

## 10.1 SC thresholdは維持

既存の人数別 `victoryTargetSC` はPhase 5Bでは原則維持する。

## 10.2 Rival SC conquest requirement

SC目標による「即時勝利」には追加条件を入れる。

- `victoryTargetSC` 以上を所有
AND
- ゲーム開始時に **別のactive playerが所有していたSC** を現在2個以上所有

を満たす必要がある。

設定:
`requiredRivalInitialSupplyCentersForInstantWin = 2`

これはconfigurableにする。

inactive ward由来のSC、中立SCはこの2個へ数えない。

同じ敵から2個でもよい。
「2人の別敵から1個ずつ」は要求しない。

## 10.3 Fixed-year winner

規定年数終了・脱落終了時の最多SC勝利には、このrival SC条件を要求しない。

つまり追加条件は早期instant victoryだけ。

## 10.4 HUD

勝利進捗:
`SC 18 / 23`
`敵初期SC 1 / 2`

と表示する。

# 11. 試遊ログ拡張

次回比較のためMatchLogへ追加:

- supportHoldCount
- supportMoveCount
- rightClickMoveCount（telemetry optional）
- adjudicationPresentationSkipped count
- rivalInitialSC count by ward
- neutralSC owned count by ward
- orders duration

privacyを壊さない。
right-click等のUX telemetryは個人識別を増やさずgame session内部の集計だけでよい。

# 12. 今回変更しないもの

- Map geometry
- 補給拠点のcapture timing
- controller rules
- 自転車ルール
- バリケードルール
- 公開イベント抽選
- Build location
- Discord Activity
- public deployment
- 本格的なUI美術
