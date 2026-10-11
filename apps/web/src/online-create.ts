import type { OnlineRequest } from '../../../packages/shared/online';

type CreateRequest=Extract<OnlineRequest,{action:'create'}>;
/** An uncertain create remains the same operation until an authoritative response arrives. */
export class OnlineCreateOperation {
  private pending:(CreateRequest&{operationId:string})|undefined;
  constructor(private nextId=()=>crypto.randomUUID()){}
  prepare(input:CreateRequest):CreateRequest&{operationId:string}{
    this.pending??={...structuredClone(input),operationId:input.operationId??this.nextId()};
    // Keep the saved request independent of UI edits and transport callers.
    return structuredClone(this.pending);
  }
  settle(operationId:string){if(this.pending?.operationId===operationId)this.pending=undefined;}
}
