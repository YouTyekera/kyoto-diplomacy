import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { GameOrder } from '../../../packages/shared/events';
import type { OnlineRequest, OnlineResponse } from '../../../packages/shared/online';
import { OptimisticOrders } from './optimistic-orders';

export function useOptimisticOrders(phaseKey: string, authoritative: GameOrder[], sessionReady: boolean,
  request: (input: OnlineRequest) => Promise<OnlineResponse>) {
  const send = useRef(request); send.current = request;
  const initial = useRef(authoritative); initial.current = authoritative;
  const controller = useMemo(() => {let sequence=0;return new OptimisticOrders(initial.current, async (orders, finalize) =>
    (await send.current({ action: 'orders', phaseKey, orders, finalize })).ok,
    async patch=>(await send.current({action:'order-patch',phaseKey,...patch,sequence:++sequence})).ok);}, [phaseKey]);
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot);
  useEffect(() => { controller.receive(authoritative); }, [controller, authoritative]);
  useEffect(() => { if (!sessionReady) controller.invalidate(); }, [controller, sessionReady]);
  useEffect(() => () => controller.invalidate(), [controller]);
  return { ...state, choose: controller.choose, remove: controller.remove, finalize: controller.finalize };
}
