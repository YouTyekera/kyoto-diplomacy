# 地図データと依存ライブラリの帰属

© 京都市

出典: [京都市オープンデータ Dataset 00670 — 令和2年度国勢調査 国勢統計区・行政区の領域ポリゴンデータ（KMLファイル WGS84）](https://data.city.kyoto.lg.jp/dataset/00670/)

ライセンス: [Creative Commons Attribution 4.0 International（CC BY 4.0）](https://creativecommons.org/licenses/by/4.0/)

原データは京都市が政府統計の総合窓口（e-Stat）の地図で見る統計（jSTAT MAP）の境界データを加工して作成したものです。

原本は `data/source/kyoto-2020-wgs84/` に保存し、変更しません。`manifest.json` は個別リソースURLを記録します。

変更内容: KMLからPolygon/MultiPolygon GeoJSONへの変換、表示用の局所投影、国勢統計区単位への統合（複数Placemarkの場合）、人が編集した採用・除外・拠点・初期配置の付加、障害物差し引き、隣接生成と手動差分適用。元形状も変換後データへ保持します。

架空のサンプル地図・障害物・KML fixtureは本プロジェクトの動作検証用です。京都御苑の境界ではありません。

御苑のゲーム用境界案は `data/maps/kyoto-urban/kyoto-gyoen-obstacle.geojson` に保存しています。出典: [地理院タイル（標準地図）](https://maps.gsi.go.jp/development/ichiran.html)、[環境省 御苑案内図](https://www.env.go.jp/garden/kyotogyoen/2_guide/map.html)。[地理院コンテンツ利用規約](https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html)に基づく参照。2026-10-03に目視で概略化しました。Phase 2Aのユーザー指定により、上辺・左右辺の基本形を保ち、下側2頂点を滋野原形状の南端（緯度35.0173548653）へ延長しています。正確な実敷地ポリゴンではなく、参照地図の画像をアプリへ組み込んで配布していません。設定のsourceに参照元と変更内容を保持します。

陸軍裁定は [Hasbro公式Diplomacyルール](https://www.hasbro.com/common/instruct/diplomacy.pdf)と[DATC](https://webdiplomacy.net/doc/DATC_v3_0.html)を参照して独自実装しています。既存adjudicatorのコードや外部テスト群の大量転載はしていません。トークンはSVGの単純な図形で独自作成しています。参照範囲・API・検証の限界は [docs/RULES_CORE.md](docs/RULES_CORE.md) に記録しています。

依存ライブラリはnpmから利用します。採用バージョンは `package-lock.json` に固定されます。React、Vite、TypeScript、Vitest、ESLint、Zod、fast-xml-parser、TurfはMIT、PlaywrightはApache-2.0、polylabelはISC。各配布物のLICENSEと依存先のライセンスを維持してください。polylabelはクライアントとWorkerのビルドへ含まれるため、以下の通知を配布物にも保持してください。

## polylabel

```text
ISC License
Copyright (c) 2026 Mapbox

Permission to use, copy, modify, and/or distribute this software for any purpose
with or without fee is hereby granted, provided that the above copyright notice
and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND ISC DISCLAIMS ALL WARRANTIES WITH REGARD TO
THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS.
IN NO EVENT SHALL ISC BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR
CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA
OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS
ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS
SOFTWARE.
```

## Socket.IO / socket.io-client

Socket.IOとsocket.io-clientはMITライセンスです。npm配布物のLICENSEを確認し、以下の通知を保持します。クライアント配布物の依存ライセンスはdist/licenses.mdにも生成されます。

```text
The MIT License (MIT)
Copyright (c) 2014-present Guillermo Rauch and Socket.IO contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```
