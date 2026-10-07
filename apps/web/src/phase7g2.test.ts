import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import {legalOrders} from '../../../packages/rules-core';
import {compileMap} from '../../../packages/map-core/compile';
import {sampleConfig,sampleDataset} from '../../../packages/map-core/sample';
import {BottomActionBar,supportAtRegion,supportRegions,type MapCommands} from './BottomActionBar';
import {readMusicSettings} from './audio/audio-manager';
import geography from '../../../data/config/kyoto-geography.json';
import {OptimisticOrders,type OrderPatch} from './optimistic-orders';
import type {GameOrder} from '../../../packages/shared/events';

const map=compileMap(sampleDataset,sampleConfig).map;
map.adjacency={'sample-a':['sample-b','sample-d'],'sample-b':['sample-a','sample-c'],'sample-c':['sample-b'],'sample-d':['sample-a']};
const units=[{unitId:'A',ownerWardId:'26101' as const,regionId:'sample-a',type:'army' as const},{unitId:'B',ownerWardId:'26102' as const,regionId:'sample-c',type:'army' as const},{unitId:'C',ownerWardId:'26102' as const,regionId:'sample-d',type:'army' as const}];
const choices=legalOrders(map,units,'A');
describe('7G.2 region-first support and unchanged rules',()=>{
  it('delayed patch acknowledgements keep the latest optimistic sheet; finalize waits for FIFO patches',async()=>{
    const patches:OrderPatch[]=[],acks:((ok:boolean)=>void)[]=[],finalized:GameOrder[][]=[];
    const controller=new OptimisticOrders([],async(orders,finalize)=>{expect(finalize).toBe(true);finalized.push(orders);return true;},patch=>{patches.push(patch);return new Promise(resolve=>acks.push(resolve));});
    const a:GameOrder={type:'move',unitId:'A',destination:'sample-b'},b:GameOrder={type:'support-move',unitId:'B',targetUnitId:'A',destination:'sample-b'};
    const first=controller.choose(a),second=controller.choose(b),remove=controller.remove('A'),finish=controller.finalize();
    expect(controller.snapshot().orders).toEqual([b]);expect(patches).toEqual([{unitId:'A',order:a}]);expect(finalized).toEqual([]);
    acks[0](true);await first;expect(controller.snapshot().orders).toEqual([b]);expect(patches[1]).toEqual({unitId:'B',order:b});
    acks[1](true);await second;expect(controller.snapshot().orders).toEqual([b]);expect(patches[2]).toEqual({unitId:'A',order:null});expect(finalized).toEqual([]);
    acks[2](true);await remove;expect(await finish).toBe(true);expect(finalized).toEqual([[b]]);expect(controller.snapshot().rollback).toBe(0);
  });
  it('Support Hold requires adjacency to the target current region',()=>{
    expect(choices).toContainEqual({type:'support-hold',unitId:'A',targetUnitId:'C'});
    expect(choices).not.toContainEqual({type:'support-hold',unitId:'A',targetUnitId:'B'});
  });
  it('Support Move needs both destination edges, but no A-B edge',()=>{
    expect(map.adjacency['sample-a']).not.toContain('sample-c');
    expect(choices).toContainEqual({type:'support-move',unitId:'A',targetUnitId:'B',destination:'sample-b'});
    expect(choices.some(o=>o.type==='support-move'&&o.destination==='sample-c')).toBe(false);
  });
  it('only legal regions highlight, and region X contains only its legal armies',()=>{
    expect(supportRegions(choices,units).sort()).toEqual(['sample-b','sample-d']);
    expect(supportAtRegion(choices,units,'sample-c')).toEqual([]);
    expect(supportAtRegion(choices,units,'sample-b')).toEqual([{type:'support-move',unitId:'A',targetUnitId:'B',destination:'sample-b'}]);
    expect(supportAtRegion(choices,units,'sample-d')).toEqual([{type:'support-hold',unitId:'A',targetUnitId:'C'}]);
    const commands={unit:units[0],choices,primary:['sample-b'],action:'support',supportRegion:'sample-b',supportOrders:supportAtRegion(choices,units,'sample-b'),inventory:[],feedback:'',locked:false} as unknown as MapCommands;
    const html=renderToStaticMarkup(createElement(BottomActionBar,{commands,units,regionName:(id:string)=>id}));
    expect(html).toContain('sample-c → sample-bへの移動を支援');expect(html).not.toContain('sample-dを現在地で支援');
  });
  it('new BGM volume is 5; saved preferences and non-river geography survive',()=>{
    expect(readMusicSettings({getItem:()=>null})).toEqual({enabled:true,volume:5});
    expect(readMusicSettings({getItem:()=>JSON.stringify({enabled:false,volume:38})})).toEqual({enabled:false,volume:38});
    expect(geography.lines.map(line=>line.name)).toEqual(['地下鉄烏丸線','地下鉄東西線']);expect(geography.station.name).toBe('京都駅');
  });
});
