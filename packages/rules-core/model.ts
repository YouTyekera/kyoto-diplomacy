import { z } from 'zod';
import { mapDefinitionSchema, type MapDefinition } from '../shared/model';
import { previewUnitSchema, type PreviewUnit } from '../shared/preview';

export type Unit = PreviewUnit;
const base = { unitId: z.string().min(1) };
export const orderSchema = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('hold') }).strict(),
  z.object({ ...base, type: z.literal('move'), destination: z.string().min(1) }).strict(),
  z.object({ ...base, type: z.literal('support-hold'), targetUnitId: z.string().min(1) }).strict(),
  z.object({ ...base, type: z.literal('support-move'), targetUnitId: z.string().min(1), destination: z.string().min(1) }).strict(),
]);
export type Order = z.infer<typeof orderSchema>;
export type HoldOrder = Extract<Order, { type: 'hold' }>;
export type MoveOrder = Extract<Order, { type: 'move' }>;
export type SupportHoldOrder = Extract<Order, { type: 'support-hold' }>;
export type SupportMoveOrder = Extract<Order, { type: 'support-move' }>;
declare const validated: unique symbol;
export type ValidatedOrder = Order & { readonly [validated]: true };
export const inputSchema = z.object({map:mapDefinitionSchema, units:z.array(previewUnitSchema), orders:z.array(orderSchema)}).strict();
export interface AdjudicationInput { map: MapDefinition; units: Unit[]; orders: Order[] }
export type ValidationCode = 'invalid-shape' | 'invalid-map' | 'duplicate-unit' | 'occupied-region' | 'invalid-region' |
  'unknown-unit' | 'duplicate-order' | 'missing-order' | 'non-adjacent' | 'self-reference' | 'invalid-retreat';
export interface ValidationIssue { code: ValidationCode; unitId?: string; message: string }
export type ValidationResult = { ok:true; orders:ValidatedOrder[] } | { ok:false; errors:ValidationIssue[] };
export type ReasonCode = 'held' | 'moved' | 'blocked' | 'self-dislodgement' | 'head-to-head' | 'standoff' |
  'supported' | 'support-cut' | 'support-mismatch' | 'dislodged' | 'retreated' | 'retreat-collision' | 'disbanded' | 'no-retreat';
export interface OrderOutcome { order:Order; status:'success'|'fail'; reason:ReasonCode;
  attackStrength:number; defenseStrength:number; preventStrength:number; effectiveSupports:string[] }
export interface RetreatOption { unitId:string; destinations:string[] }
export interface DislodgedUnit { unit:Unit; attackerUnitId:string; attackerOrigin:string; legalRetreatDestinations:string[] }
export interface AdjudicationResult { units:Unit[]; orderResults:OrderOutcome[]; effectiveSupports:string[];
  cutSupports:string[]; standoffRegions:string[]; dislodgedUnits:DislodgedUnit[]; retreatOptions:RetreatOption[] }
export type AdjudicationResponse = { ok:true; result:AdjudicationResult } | { ok:false; errors:ValidationIssue[] };
export const retreatOrderSchema = z.discriminatedUnion('type', [
  z.object({...base,type:z.literal('retreat'),destination:z.string().min(1)}).strict(),
  z.object({...base,type:z.literal('disband')}).strict(),
]);
export type RetreatOrder = z.infer<typeof retreatOrderSchema>;
export interface RetreatResult { units:Unit[]; disbandedUnitIds:string[];
  outcomes:{unitId:string;status:'retreated'|'disbanded';reason:ReasonCode;destination?:string}[] }
