import { describe, expect, it } from 'vitest';
import { compileMap } from '../map-core/compile';
import { sampleDataset, sampleConfig } from '../map-core/sample';
import type { MapDefinition, WardId } from '../shared/model';
import { adjudicate, resolveRetreats, validateOrderSet, legalOrders, type Unit, type Order, type AdjudicationResult } from './index';

const red:WardId='26101',blue:WardId='26102',green:WardId='26103';
function map(ids:string[], edges?:[string,string][]):MapDefinition {
  const original=compileMap(sampleDataset,sampleConfig).map, template=original.regions[0];
  return {...original,regions:ids.map(regionId=>({...template,regionId,name:regionId,startingUnit:null,isSupplyCenter:false})),
    adjacency:Object.fromEntries(ids.map(id=>[id,edges?edges.flatMap(([a,b])=>a===id?[b]:b===id?[a]:[]):ids.filter(other=>other!==id)])),obstacles:[]};
}
const u=(regionId:string, ownerWardId:WardId=red):Unit=>({unitId:regionId,regionId,ownerWardId,type:'army'});
const h=(unitId:string):Order=>({type:'hold',unitId});
const m=(unitId:string,destination:string):Order=>({type:'move',unitId,destination});
const sh=(unitId:string,targetUnitId:string):Order=>({type:'support-hold',unitId,targetUnitId});
const sm=(unitId:string,targetUnitId:string,destination:string):Order=>({type:'support-move',unitId,targetUnitId,destination});
function run(units:Unit[],orders:Order[],ids:string[]=['a','b','c','d','e','f','g','h','i','j']):AdjudicationResult {
  const response=adjudicate({map:map(ids),units,orders});
  if(!response.ok) throw new Error(JSON.stringify(response.errors));return response.result;
}
const positions=(result:AdjudicationResult)=>Object.fromEntries(result.units.map(unit=>[unit.unitId,unit.regionId]));
const outcome=(result:AdjudicationResult,id:string)=>result.orderResults.find(o=>o.order.unitId===id)!;
describe('陸軍Movement: 同時裁定',()=>{
  it('無抵抗の隣接Moveが成功する',()=>expect(positions(run([u('a')],[m('a','b')]))).toEqual({a:'b'}));
  it('空地域への同戦力2軍は双方bounceしstandoffになる',()=>{
    const result=run([u('a'),u('b',blue)],[m('a','c'),m('b','c')]);
    expect(positions(result)).toEqual({a:'a',b:'b'});expect(result.standoffRegions).toEqual(['c']);
  });
  it('支援で強いMoveが競合に勝つ',()=>{
    const result=run([u('a'),u('b',blue),u('d')],[m('a','c'),m('b','c'),sm('d','a','c')]);
    expect(positions(result)).toEqual({a:'c',b:'b',d:'d'});expect(outcome(result,'a').attackStrength).toBe(2);
  });
  it('有効Support Holdは同戦力の支援攻撃に耐える',()=>{
    const result=run([u('a'),u('b',blue),u('c',blue),u('d')],[m('a','b'),h('b'),sh('c','b'),sm('d','a','b')]);
    expect(positions(result)).toEqual({a:'a',b:'b',c:'c',d:'d'});expect(outcome(result,'b').defenseStrength).toBe(2);
  });
  it('無支援MoveはSupported Holdに失敗する',()=>{
    expect(outcome(run([u('a'),u('b',blue),u('c',blue)],[m('a','b'),h('b'),sh('c','b')]),'a').status).toBe('fail');
  });
  it('同戦力head-to-headは直接交換せず双方失敗する',()=>{
    const result=run([u('a'),u('b',blue)],[m('a','b'),m('b','a')]);
    expect(positions(result)).toEqual({a:'a',b:'b'});expect(outcome(result,'a').reason).toBe('head-to-head');
  });
  it('支援付きhead-to-headは強い側が排除する',()=>{
    const result=run([u('a'),u('b',blue),u('c')],[m('a','b'),m('b','a'),sm('c','a','b')]);
    expect(positions(result)).toEqual({a:'b',c:'c'});expect(result.dislodgedUnits[0]).toMatchObject({unit:{unitId:'b'},attackerOrigin:'a'});
  });
  it('3軍の循環Moveは全軍同時に移動する',()=>{
    expect(positions(run([u('a'),u('b',blue),u('c',green)],[m('a','b'),m('b','c'),m('c','a')]))).toEqual({a:'b',b:'c',c:'a'});
  });
  it('循環先のstandoffが循環全体を阻止する',()=>{
    const result=run([u('a'),u('b',blue),u('c',green),u('d',blue)],[m('a','b'),m('b','c'),m('c','a'),m('d','a')]);
    expect(positions(result)).toEqual({a:'a',b:'b',c:'c',d:'d'});
  });
  it('循環の強いMoveが確定すると他のMoveも連鎖成功する',()=>{
    const result=run([u('a'),u('b',blue),u('c',green),u('d')],[m('a','b'),m('b','c'),m('c','a'),sm('d','a','b')]);
    expect(positions(result)).toEqual({a:'b',b:'c',c:'a',d:'d'});
  });
  it('空地域へ抜ける成功Moveの連鎖を解決する',()=>{
    expect(positions(run([u('a'),u('b'),u('c')],[m('a','b'),m('b','c'),m('c','d')]))).toEqual({a:'b',b:'c',c:'d'});
  });
  it('同軍の自己排除は支援が多くても禁止する',()=>{
    const result=run([u('a'),u('b'),u('c')],[m('a','b'),h('b'),sm('c','a','b')]);
    expect(result.dislodgedUnits).toEqual([]);expect(outcome(result,'a').reason).toBe('self-dislodgement');
  });
  it('同軍のhead-to-headも強い側が自己排除できない',()=>{
    expect(positions(run([u('a'),u('b'),u('c')],[m('a','b'),m('b','a'),sm('c','a','b')]))).toEqual({a:'a',b:'b',c:'c'});
  });
  it('他勢力ユニットへのSupport Moveも有効',()=>{
    const result=run([u('a'),u('b',blue),u('c',green)],[m('a','b'),h('b'),sm('c','a','b')]);
    expect(result.effectiveSupports).toEqual(['c']);expect(positions(result)).toEqual({a:'b',c:'c'});
  });
  it('防御側の自軍支援は自軍排除にも競合突破にも加算しない',()=>{
    const result=run([u('a'),u('b',blue),u('c',blue),u('d'),u('e',green),u('f',green)],
      [m('a','b'),h('b'),sm('c','a','b'),sm('d','a','b'),m('e','b'),sm('f','e','b')]);
    expect(result.dislodgedUnits).toEqual([]);expect(outcome(result,'a').attackStrength).toBe(2);
    expect(outcome(result,'a').preventStrength).toBe(3);expect(outcome(result,'e').status).toBe('fail');
  });
  it('排除されたhead-to-head敗者は攻撃元へのstandoffを起こさず後続が入れる',()=>{
    const result=run([u('a'),u('b',blue),u('c'),u('d',green)],[m('a','b'),m('b','a'),sm('c','a','b'),m('d','a')]);
    expect(positions(result)).toEqual({a:'b',c:'c',d:'a'});expect(result.standoffRegions).not.toContain('a');
  });
  it('別の地域から排除された軍の攻撃は他地域のstandoffへ影響する',()=>{
    const result=run([u('a'),u('b',blue),u('c',green),u('d',green),u('e',blue)],
      [m('a','f'),m('b','f'),m('c','a'),sm('d','c','a'),h('e')]);
    expect(result.dislodgedUnits.map(d=>d.unit.unitId)).toEqual(['a']);expect(result.standoffRegions).toContain('f');
    expect(positions(result).b).toBe('b');
  });
  it('非head-to-headで失敗したMoveは防御時にMove支援を受けない',()=>{
    const result=run([u('a'),u('b',blue),u('c'),u('d',green),u('e',green),u('f',blue)],
      [m('a','b'),h('b'),sm('c','a','b'),m('d','a'),sm('e','d','a'),sh('f','b')]);
    expect(result.dislodgedUnits.map(d=>d.unit.unitId)).toEqual(['a']);expect(positions(result).d).toBe('a');
  });
  it.each([3,4])('head-to-head敗者を相手以外の%d戦力が攻撃しても、その敗者は別地域の阻止力を保つ',otherStrength=>{
    const units=[u('a'),u('b',blue),u('c'),u('d'),u('e',blue),u('f',green),u('g',green),u('h',green),u('i',green),u('j',green)];
    const orders=[m('a','b'),m('b','a'),sm('c','a','b'),sm('d','a','b'),sm('e','b','a'),m('f','b'),sm('g','f','b'),sm('h','f','b'),m('i','a'),sm('j','i','a')];
    if(otherStrength===4) {units.push(u('k',green));orders.push(sm('k','f','b'));}
    const result=run(units,orders,['a','b','c','d','e','f','g','h','i','j','k']);
    expect(positions(result).i).toBe('i');expect(outcome(result,'b').preventStrength).toBe(2);
    expect(result.dislodgedUnits.map(d=>d.unit.unitId)).toEqual(otherStrength===4?['b']:[]);
  });
  it('自軍unitが移動成功して空く地域には自軍側の支援も攻撃戦力に使える',()=>{
    const result=run([u('a'),u('b',blue),u('c',blue),u('d',green)],
      [m('a','b'),m('b','f'),sm('c','a','b'),m('d','b')]);
    expect(positions(result)).toEqual({a:'b',b:'f',c:'c',d:'d'});expect(outcome(result,'a').attackStrength).toBe(2);
  });
});
describe('Support: 成立、cut、例外',()=>{
  it('Support HoldはHold以外のSupport命令にも防御支援できる',()=>{
    const result=run([u('a'),u('b',blue),u('c',blue),u('d',blue)],[m('a','b'),sh('b','d'),sh('c','b'),h('d')]);
    expect(outcome(result,'b').defenseStrength).toBe(2);expect(result.effectiveSupports).toContain('c');
  });
  it('敵の失敗攻撃でもSupport Holdをcutする',()=>{
    const result=run([u('a'),u('b',blue),u('c',blue),u('d'),u('e')],
      [m('a','b'),h('b'),sh('c','b'),sm('d','a','b'),m('e','c')]);
    expect(result.cutSupports).toContain('c');expect(result.dislodgedUnits[0].unit.unitId).toBe('b');
  });
  it('敵の攻撃はSupport Moveをcutする',()=>{
    const result=run([u('a'),u('b',blue),u('c'),u('d',blue)],[m('a','b'),h('b'),sm('c','a','b'),m('d','c')]);
    expect(result.cutSupports).toEqual(['c']);expect(positions(result).a).toBe('a');
  });
  it('自軍の攻撃は支援をcutしない',()=>{
    const result=run([u('a'),u('b',blue),u('c'),u('d')],[m('a','b'),h('b'),sm('c','a','b'),m('d','c')]);
    expect(result.effectiveSupports).toEqual(['c']);expect(positions(result).a).toBe('b');
  });
  it('支援先provinceからの攻撃は例外として支援をcutしない',()=>{
    const result=run([u('a'),u('b',blue),u('c')],[m('a','b'),m('b','c'),sm('c','a','b')]);
    expect(result.effectiveSupports).toEqual(['c']);expect(result.dislodgedUnits[0].unit.unitId).toBe('b');
  });
  it('例外方向からでもsupporterが排除されれば支援は無効になる',()=>{
    const result=run([u('a'),u('b',blue),u('c'),u('d',blue),u('e',green)],
      [m('a','b'),m('b','c'),sm('c','a','b'),sm('d','b','c'),m('e','b')]);
    expect(result.cutSupports).toContain('c');expect(result.dislodgedUnits[0].unit.unitId).toBe('c');
    expect(result.standoffRegions).toContain('b');
  });
  it('排除された攻撃軍でも他地域の支援をcutできる',()=>{
    const result=run([u('a'),u('b',blue),u('c',green),u('d',green),u('e',blue)],
      [m('a','b'),sh('b','e'),m('c','a'),sm('d','c','a'),h('e')]);
    expect(result.cutSupports).toContain('b');expect(result.dislodgedUnits[0].unit.unitId).toBe('a');
  });
  it('移動命令へSupport Holdしても移動失敗時を含め無効',()=>{
    const result=run([u('a'),u('b',blue),u('c')],[m('a','b'),h('b'),sh('c','a')]);
    expect(outcome(result,'c').reason).toBe('support-mismatch');expect(result.effectiveSupports).toEqual([]);
  });
  it('Support Moveと実際のMove先が不一致なら明示的に失敗する',()=>{
    const result=run([u('a'),u('c')],[m('a','b'),sm('c','a','d')]);
    expect(outcome(result,'c').reason).toBe('support-mismatch');expect(positions(result).a).toBe('b');
  });
});
describe('入力検証: 黙ってHoldへ変換しない',()=>{
  it.each([
    {name:'不存在unit',orders:[h('unknown')],code:'unknown-unit'},
    {name:'重複命令',orders:[h('a'),m('a','b')],code:'duplicate-order'},
    {name:'未入力命令',orders:[],code:'missing-order'},
    {name:'自己Move',orders:[m('a','a')],code:'self-reference'},
    {name:'不存在region',orders:[m('a','unknown')],code:'invalid-region'},
    {name:'自己Support',orders:[sh('a','a')],code:'self-reference'},
    {name:'非法支援先',orders:[sm('a','b','c'),h('b')],code:'non-adjacent'},
  ])('$name を明示エラーにする',({orders,code})=>{
    const input={map:map(['a','b','c'],[['a','b']]),units:[u('a'),u('b')],orders};
    const result=validateOrderSet(input);expect(result.ok).toBe(false);
    if(!result.ok) expect(result.errors.map(e=>e.code)).toContain(code);
    expect(adjudicate(input).ok).toBe(false);
  });
  it('非隣接Moveと除外・侵入不能regionを拒否する',()=>{
    const board=map(['a','b','c'],[['a','b']]);board.regions[2].enabled=false;
    for(const destination of ['c','unknown']) expect(adjudicate({map:board,units:[u('a')],orders:[m('a',destination)]}).ok).toBe(false);
    board.regions[1].playableGeometry=null;
    expect(adjudicate({map:board,units:[u('a')],orders:[m('a','b')]}).ok).toBe(false);
  });
  it('重複配置・unitId・非対称隣接・不正型を拒否する',()=>{
    const board=map(['a','b']);
    expect(validateOrderSet({map:board,units:[u('a'),u('a')],orders:[h('a')]}).ok).toBe(false);
    board.adjacency.b=[];expect(validateOrderSet({map:board,units:[u('a')],orders:[h('a')]}).ok).toBe(false);
    expect(validateOrderSet({map:board,units:[{...u('a'),type:'fleet'}],orders:[h('a')]}).ok).toBe(false);
  });
  it('GUI候補は最終adjacencyの合法命令だけを返す',()=>{
    const board=map(['a','b','c'],[['a','b']]),units=[u('a'),u('b',blue)];
    for(const order of legalOrders(board,units,'a')) expect(validateOrderSet({map:board,units,orders:[order,h('b')]}).ok).toBe(true);
    expect(legalOrders(board,units,'a')).not.toContainEqual(m('a','c'));
  });
});
describe('Retreat: 同時解決と対象外region',()=>{
  const movement=()=>run([u('a'),u('b',blue),u('c')],[m('a','b'),h('b'),sm('c','a','b')]);
  it('合法な隣接空地域へretreatする',()=>{
    const result=resolveRetreats(map(['a','b','c','d','e','f','g','h','i','j']),movement(),[{type:'retreat',unitId:'b',destination:'d'}]);
    expect(result.ok).toBe(true);if(result.ok) expect(result.result.units.find(u=>u.unitId==='b')?.regionId).toBe('d');
  });
  it.each(['a','b','c'])('攻撃元/占有地域 %s へretreatできない',destination=>{
    expect(resolveRetreats(map(['a','b','c','d']),movement(),[{type:'retreat',unitId:'b',destination}]).ok).toBe(false);
  });
  it('同じ移動フェイズのstandoff地域へretreatできない',()=>{
    const result=run([u('a'),u('b',blue),u('c'),u('d'),u('e',blue)],
      [m('a','b'),h('b'),sm('c','a','b'),m('d','f'),m('e','f')]);
    expect(result.dislodgedUnits[0].legalRetreatDestinations).not.toContain('f');
    expect(resolveRetreats(map(['a','b','c','d','e','f']),result,[{type:'retreat',unitId:'b',destination:'f'}]).ok).toBe(false);
  });
  it('2軍が同じretreat先を選べば両方disbandする',()=>{
    const result=run([u('a'),u('b',blue),u('c'),u('d'),u('e',blue),u('f')],
      [m('a','b'),h('b'),sm('c','a','b'),m('d','e'),h('e'),sm('f','d','e')]);
    const retreat=resolveRetreats(map(['a','b','c','d','e','f','g']),result,
      [{type:'retreat',unitId:'b',destination:'g'},{type:'retreat',unitId:'e',destination:'g'}]);
    expect(retreat.ok).toBe(true);if(retreat.ok) expect(retreat.result.disbandedUnitIds).toEqual(['b','e']);
  });
  it('撤退不能は自動disband、候補がある未入力はエラー',()=>{
    const result=run([u('a'),u('b',blue),u('c')],[m('a','b'),h('b'),sm('c','a','b')],['a','b','c']);
    const retreat=resolveRetreats(map(['a','b','c']),result,[]);
    expect(retreat.ok).toBe(true);if(retreat.ok) expect(retreat.result.outcomes[0].reason).toBe('no-retreat');
    expect(resolveRetreats(map(['a','b','c','d']),movement(),[]).ok).toBe(false);
  });
  it('任意の合法候補があっても明示Disbandを選べる',()=>{
    const retreat=resolveRetreats(map(['a','b','c','d']),movement(),[{type:'disband',unitId:'b'}]);
    expect(retreat.ok).toBe(true);if(retreat.ok) expect(retreat.result.disbandedUnitIds).toEqual(['b']);
  });
  it('除外・侵入不能・非隣接先と重複・不正命令を拒否する',()=>{
    const board=map(['a','b','c','d','e','f'],[['a','b'],['b','c'],['b','d'],['b','e']]);
    board.regions.find(r=>r.regionId==='e')!.enabled=false;board.adjacency.b=board.adjacency.b.filter(id=>id!=='e');board.adjacency.e=[];
    for(const destination of ['e','f','unknown']) expect(resolveRetreats(board,movement(),[{type:'retreat',unitId:'b',destination}]).ok).toBe(false);
    expect(resolveRetreats(board,movement(),[{type:'disband',unitId:'b'},{type:'disband',unitId:'b'}]).ok).toBe(false);
    expect(resolveRetreats(board,movement(),[{type:'disband',unitId:'a'}]).ok).toBe(false);
  });
});
describe('純粋性・決定性・盤面のinvariant',()=>{
  it('入力を変更せず、命令・units順によらず、移動後も排除軍と合わせ軍数を保存する',()=>{
    const input={map:map(['a','b','c','d']),units:[u('a'),u('b',blue),u('c')],orders:[m('a','b'),h('b'),sm('c','a','b')]};
    const before=structuredClone(input),result=adjudicate(input);expect(input).toEqual(before);expect(result.ok).toBe(true);
    expect(adjudicate({...input,units:[...input.units].reverse(),orders:[...input.orders].reverse()})).toEqual(result);
    if(result.ok) {
      expect(new Set(result.result.units.map(u=>u.regionId)).size).toBe(result.result.units.length);
      expect(result.result.units.length+result.result.dislodgedUnits.length).toBe(input.units.length);
    }
  });
  it('決定的に生成した多数の合法盤面でも占有一意・軍数保存・入力不変',()=>{
    const board=map(['a','b','c','d','e','f','g']);let seed=17;
    const random=(n:number)=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
    for(let i=0;i<200;i++) {
      const units=['a','b','c','d','e'].map((id,n)=>u(id,[red,blue,green][n%3]));
      const orders=units.map(unit=>{const choices=legalOrders(board,units,unit.unitId);return choices[random(choices.length)];});
      const input={map:board,units,orders},before=JSON.stringify(input),response=adjudicate(input);
      expect(response.ok,JSON.stringify(orders)).toBe(true);expect(JSON.stringify(input)).toBe(before);
      if(response.ok) {
        expect(new Set(response.result.units.map(u=>u.regionId)).size).toBe(response.result.units.length);
        expect(response.result.units.length+response.result.dislodgedUnits.length).toBe(units.length);
        expect(adjudicate({...input,orders:[...orders].reverse()})).toEqual(response);
      }
    }
  });
});
