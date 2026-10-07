import {useEffect,useRef,useState} from 'react';
import type {GameOrder} from '../../../packages/shared/events';
import type {OnlineRequest,OnlineResponse} from '../../../packages/shared/online';

/** Only the selected army is queried. Ordinary draft edits leave its cached basic choices intact. */
export function useSelectedLegalOrders(phaseKey:string,unitId:string|undefined,enabled:boolean,saving:boolean,
  draft:GameOrder[],inventoryKey:string,request:(input:OnlineRequest)=>Promise<OnlineResponse>){
  const send=useRef(request);send.current=request;
  const cache=useRef(new Map<string,GameOrder[]>()),phase=useRef(phaseKey);
  if(phase.current!==phaseKey){phase.current=phaseKey;cache.current.clear();}
  const equipment=draft.filter(o=>o.type==='bicycle-move'||o.type==='deploy-barricade');
  const equipmentKey=JSON.stringify(equipment),key=`${phaseKey}:${unitId}:${inventoryKey}:${equipmentKey}`;
  const [result,setResult]=useState<{key:string;orders:GameOrder[]}|null>(null);
  useEffect(()=>{
    if(!enabled||!unitId)return;
    const cached=cache.current.get(key);if(cached){setResult({key,orders:cached});return;}
    let current=true;
    void send.current({action:'legal-orders',phaseKey,unitId}).then(response=>{
      if(!current||!response.ok||response.legalOrders?.phaseKey!==phaseKey||response.legalOrders.unitId!==unitId)return;
      if(!saving)cache.current.set(key,response.legalOrders.orders);
      setResult({key,orders:response.legalOrders.orders});
    });return()=>{current=false;};
  },[phaseKey,unitId,enabled,saving,key]);
  const orders=result?.key===key?result.orders:cache.current.get(key)??[];
  return unitId?{[unitId]:orders.filter(o=>!('equipmentId'in o)||!equipment.some(other=>other.unitId!==unitId&&(other.type===o.type||'equipmentId'in other&&other.equipmentId===o.equipmentId)))}:{};
}
