import { WARDS, type MapConfig,type RegionDataset } from '../packages/shared/model';
/** Technical fixtures only. Never imported by the application or written to its initial configuration. */
export function completeKyotoTestScenario(dataset:RegionDataset,config:MapConfig) {
  for(const w of WARDS.slice(3)) {
    const group=dataset.regions.filter(r=>r.wardId===w.id).slice(0,3);
    for(const [i,r] of group.entries())config.regions[r.regionId]={enabled:true,isSupplyCenter:true,homeWardId:w.id,startingUnit:i===0?{ownerWardId:w.id,type:'army'}:null};
  }
  for(const setting of Object.values(config.regions))if(setting.startingUnit)setting.isSupplyCenter=true;
  return config;
}
export function completeSyntheticScenario(original:RegionDataset,originalConfig:MapConfig) {
  const dataset=structuredClone(original),config=structuredClone(originalConfig);
  for(const s of Object.values(config.regions))if(s.startingUnit){s.isSupplyCenter=true;}
  for(const [i,w] of WARDS.entries()) {
    const existing=dataset.regions.filter(r=>r.wardId===w.id&&config.regions[r.regionId]?.enabled);
    const ownedSC=existing.some(r=>config.regions[r.regionId].isSupplyCenter&&config.regions[r.regionId].homeWardId===w.id);
    const army=Object.values(config.regions).some(s=>s.enabled&&s.startingUnit?.ownerWardId===w.id);
    if(ownedSC&&army)continue;
    const r=structuredClone(original.regions[0]),id=`extra-setup-${w.id}`,x=136+i*.02,y=36;
    r.regionId=id;r.name=`架空準備${w.name}`;r.wardId=w.id;r.sourceAreaNumber='99';r.geometry={type:'Polygon',coordinates:[[[x,y],[x+.01,y],[x+.01,y+.01],[x,y+.01],[x,y]]]};dataset.regions.push(r);
    config.regions[id]={enabled:true,isSupplyCenter:true,homeWardId:w.id,startingUnit:army?null:{ownerWardId:w.id,type:'army'}};
  }
  let sc=Object.values(config.regions).filter(s=>s.enabled&&s.isSupplyCenter).length;
  for(let i=0;sc<24;i++,sc++) {
    const r=structuredClone(original.regions[0]),id=`extra-sc-${i}`,x=136+i*.02,y=37;
    r.regionId=id;r.name=`架空中京SC${i}`;r.wardId='26104';r.sourceAreaNumber=String(100+i);r.geometry={type:'Polygon',coordinates:[[[x,y],[x+.01,y],[x+.01,y+.01],[x,y+.01],[x,y]]]};dataset.regions.push(r);
    config.regions[id]={enabled:true,isSupplyCenter:true,homeWardId:'26104',startingUnit:null};
  }
  return {dataset,config};
}
