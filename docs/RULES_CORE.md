# Phase 2A 陸軍裁定APIと参照ルール

Phase 4Aの年間進行では、イベント層が隣接を差し替えたMapDefinitionを渡して同じ裁定を再利用します。`adjudicate(input, {unsupportedUnitIds})`の任意第2引数で自転車軍への支援を不成立にします。通常呼び出しの挙動は従来どおりです。2段階移動や装備の状態管理は [EVENTS_AND_EQUIPMENT.md](EVENTS_AND_EQUIPMENT.md) を参照してください。

`packages/rules-core/` はReact・DOM・通信・地理演算から独立したTypeScriptモジュールです。静的なMapDefinitionの最終隣接と陸軍・命令を入力し、新しい盤面と説明情報を返します。入力は変更しません。共有の型・Zod検証を再利用しています。

## API

```ts
import {
  validateOrderSet, legalOrders, adjudicate, resolveRetreats,
  type Unit, type Order, type RetreatOrder,
} from '../packages/rules-core';

const orders: Order[] = [
  { type: 'hold', unitId: 'army-a' },
  { type: 'move', unitId: 'army-b', destination: 'region-c' },
  { type: 'support-hold', unitId: 'army-d', targetUnitId: 'army-a' },
  { type: 'support-move', unitId: 'army-e', targetUnitId: 'army-b', destination: 'region-c' },
];
// map / unitsは呼び出し側が保持する、検証対象の盤面データ。
const checked = validateOrderSet({ map, units, orders });
const response = adjudicate({ map, units, orders });
if (response.ok) {
  const privateSubmissions: RetreatOrder[] = []; // 各軍の撤退・解散を収集して一括送信
  const retreat = resolveRetreats(map, response.result, privateSubmissions);
  // response.result.unitsは排除された軍を含まない。
  // 排除軍はresponse.result.dislodgedUnitsに保持され、撤退成功時に盤面へ戻る。
  // 合法な撤退先がある軍が未入力なら、retreat.okはfalseになる。
}
```

- `validateOrderSet(input: unknown)` は形式、盤面、最終隣接、ユニット、全命令を検証し、検証済みOrderまたはコード付きエラーを返します。
- `legalOrders(map, units, unitId)` はGUIの合法候補を返します。支援対象の実命令との一致は裁定時に判定します。
- `adjudicate(input)` は内部で検証も実施し、`{ ok: true, result }` または `{ ok: false, errors }` を返します。
- `resolveRetreats(map, movementResult, submissions)` は全軍分を同時解決します。非排除軍の命令、重複、不正な撤退先、必要な入力の不足を拒否します。保存された候補配列を信用するだけでなく、最終隣接・占有・攻撃元・スタンドオフから合法性を再確認します。

全入力軍に移動命令が必要です。不正命令・未入力をHoldへ置き換えません。撤退先のない軍の解散は陸軍撤退ルールとして実行します。冬の軍数調整は扱いません。

## 裁定の構造

移動成功と支援有効性を相互に依存する真偽条件として構成します。強さが未確定の間は最小値・最大値で比較し、確定できる条件を伝播します。残る依存関係は仮定して解き、全条件との整合を確認します。移動成功の仮定を先に試すことで、妨げのない3軍以上の循環移動を成立させます。2軍の交換はhead-to-headの別条件で判定します。

攻撃・防御・阻止の強さは分離しています。自己排除と守備側の自軍支援による排除を防ぎ、移動先の競合では阻止力を比較します。通常の攻撃による支援カット、支援先からの攻撃の例外、支援軍が実際に排除された場合を扱います。head-to-headで排除された軍と、別方向から排除された軍の攻撃が及ぼす影響も区別します。

結果はユニットID順などで安定化します。解決済みユニットとは別に、排除軍、排除した軍、攻撃元、合法撤退先を保持します。`orderResults` には命令・成功/失敗・ReasonCode・攻撃/防御/阻止の数値・有効支援IDを返し、全体の有効支援・カット支援・スタンドオフも返します。日本語の表示文は `packages/shared/rules-explanations.ts` に分離しています。

撤退入力は呼び出し側で非公開に収集し、一括で渡します。競合先へ向かう全軍を解散し、残る合法な軍だけを戻します。ネットワークの認証・秘密保持・締切制御はこのAPIの責務に含みません。

## 参照と検証範囲

- [Hasbro公式Diplomacyルール](https://www.hasbro.com/common/instruct/diplomacy.pdf): 基本の陸軍移動・支援・排除・撤退。
- [Diplomacy Adjudicator Test Cases（DATC 3.0）](https://webdiplomacy.net/doc/DATC_v3_0.html): 特に5.Bの依存条件・強さの区別、6.D/6.Eの支援とhead-to-headの論点を参考にしました。

参照日: 2026-10-03。既存adjudicatorの実装をコピーしていません。テストは本プロジェクトの架空地域と勢力で作成し、外部テスト群を大量転載していません。独自SVGトークンも他ゲームの画像を使用していません。

`rules.test.ts` の51件は必須ケースと陸軍の追加境界ケースを検証し、固定seedの200組の合法命令でも決定性・入力不変・単一占有・軍数保存を確認します。これはDATC全体の適合認証ではありません。fleet / sea / coast / convoyとそのパラドックスは対象外です。

SC所有者・controller・年・季節・Build・冬のDisband・勝利・脱落はrules-coreへ混ぜず、`packages/game-core/`で処理します（[GAME_CORE.md](GAME_CORE.md)）。Phase 3AではサーバーがこのAPIを利用します。命令書確定時の自軍未入力Holdはオンライン進行層だけで補完し、rules-coreの全軍命令必須を維持します。秘密提出・通信・再接続は [ONLINE_CORE.md](ONLINE_CORE.md)。イベントは未実装です。
