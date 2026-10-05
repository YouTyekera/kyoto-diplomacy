import { z } from 'zod';
import { configSchema, mapDefinitionSchema, wardSchema, scenarioCountsSchema, type MapConfig } from './model';
import { gameStatePreviewSchema, previewUnitSchema } from './preview';
import { orderSchema, retreatOrderSchema } from '../rules-core/model';
import { gameOrderSchema,publicEventsSchema,equipmentSchema,reservationSchema,equipmentResultSchema,bicycleOrderSchema,deployOrderSchema } from './events';
import { endResultSchema,metricsSchema,matchLogSchema } from './match';

const id=z.string().min(1).max(160);
export const credentialsSchema=z.object({roomCode:z.string().regex(/^[A-Z2-9]{6}$/),playerId:id,reconnectToken:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export type Credentials=z.infer<typeof credentialsSchema>;
const nickname=z.string().trim().min(1,'nicknameを入力してください').max(32,'nicknameは32文字以内です').refine(v=>[...v].every(c=>c.charCodeAt(0)>=32&&c.charCodeAt(0)!==127),'制御文字は使用できません');
const preference=wardSchema.nullable();
export const winterDraftSchema=z.object({buildRegionIds:z.array(id).max(227),disbandUnitIds:z.array(id).max(227)}).strict();
const phaseKey=id;
export const requestSchema=z.discriminatedUnion('action',[
  z.object({action:z.literal('create'),nickname,preferredWardId:preference,datasetKind:z.enum(['sample','kyoto-kml']),config:configSchema,scenario:z.literal('standard').optional()}).strict(),
  z.object({action:z.literal('join'),nickname,preferredWardId:preference,roomCode:z.string().trim().toUpperCase().regex(/^[A-Z2-9]{6}$/)}).strict(),
  z.object({action:z.literal('reconnect'),...credentialsSchema.shape}).strict(),
  z.object({action:z.literal('preference'),preferredWardId:preference}).strict(),
  z.object({action:z.literal('leave')}).strict(),
  z.object({action:z.literal('kick'),playerId:id}).strict(),
  z.object({action:z.literal('scenario'),json:z.string().max(4*1024*1024),counts:scenarioCountsSchema.optional(),fileName:z.string().min(1).max(255).refine(v=>[...v].every(c=>c!=='/'&&c!=='\\'&&c.charCodeAt(0)>=32&&c.charCodeAt(0)!==127)).optional()}).strict(),
  z.object({action:z.literal('standard-scenario')}).strict(),
  z.object({action:z.literal('export-log')}).strict(),
  z.object({action:z.literal('presentation-skipped'),presentationId:id}).strict(),
  z.object({action:z.literal('lobby-years'),yearLimit:z.number().int().positive().nullable()}).strict(),
  z.object({action:z.literal('start'),yearLimit:z.number().int().positive().nullable()}).strict(),
  z.object({action:z.literal('orders'),phaseKey,orders:z.array(gameOrderSchema).max(227),finalize:z.boolean()}).strict(),
  z.object({action:z.literal('retreats'),phaseKey,orders:z.array(retreatOrderSchema).max(227),finalize:z.boolean()}).strict(),
  z.object({action:z.literal('winter'),phaseKey,draft:winterDraftSchema,finalize:z.boolean()}).strict(),
  z.object({action:z.literal('unready'),phaseKey}).strict(),
]);
type ParsedRequest=z.infer<typeof requestSchema>;
export type OnlineRequest=Exclude<ParsedRequest,{action:'create'}>|(Omit<Extract<ParsedRequest,{action:'create'}>,'config'>&{config:MapConfig});
export const responseSchema=z.discriminatedUnion('ok',[
  z.object({ok:z.literal(true),credentials:credentialsSchema.optional(),matchLog:matchLogSchema.optional()}).strict(),
  z.object({ok:z.literal(false),errors:z.array(z.string())}).strict(),
]);
export type OnlineResponse=z.infer<typeof responseSchema>;
const strings=z.array(z.string());
const reason=z.enum(['held','moved','blocked','self-dislodgement','head-to-head','standoff','supported','support-cut','support-mismatch','dislodged','retreated','retreat-collision','disbanded','no-retreat']);
const dislodgedSchema=z.object({unit:previewUnitSchema,attackerUnitId:id,attackerOrigin:id,legalRetreatDestinations:strings}).strict();
export const movementSchema=z.object({units:z.array(previewUnitSchema),orderResults:z.array(z.object({order:orderSchema,status:z.enum(['success','fail']),reason,
  attackStrength:z.number(),defenseStrength:z.number(),preventStrength:z.number(),effectiveSupports:strings}).strict()),
  effectiveSupports:strings,cutSupports:strings,standoffRegions:strings,dislodgedUnits:z.array(dislodgedSchema),
  retreatOptions:z.array(z.object({unitId:id,destinations:strings}).strict()),equipmentResults:z.array(equipmentResultSchema)}).strict();
const retreatResultSchema=z.object({units:z.array(previewUnitSchema),disbandedUnitIds:strings,outcomes:z.array(z.object({unitId:id,status:z.enum(['retreated','disbanded']),reason,destination:z.string().optional()}).strict())}).strict();
const winterResultSchema=z.object({builtUnits:z.array(previewUnitSchema),disbandedUnitIds:strings}).strict();
const scChangeSchema=z.object({regionId:id,previous:wardSchema.nullable(),owner:wardSchema.nullable()}).strict();
const gameEndSchema=z.object({reason:z.enum(['victory','elimination','year-limit']),finalYear:z.number().int(),winnerWardId:wardSchema.nullable(),candidateWardIds:z.array(wardSchema),tieUnresolved:z.boolean(),
  eliminated:z.array(z.object({wardId:wardSchema,reasons:z.array(z.enum(['zero-sc','zero-non-sc']))}).strict())}).strict();
export const publicResultSchema=z.object({year:z.number().int(),season:z.enum(['spring','autumn','winter']),movement:movementSchema.nullable(),retreat:retreatResultSchema.nullable(),winter:winterResultSchema.nullable(),scChanges:z.array(scChangeSchema)}).strict();
export type PublicResult=z.infer<typeof publicResultSchema>;
const publicPlayerSchema=z.object({playerId:id,nickname:z.string(),connected:z.boolean(),host:z.boolean(),wardId:wardSchema.nullable(),
  required:z.boolean(),finalized:z.boolean(),eliminated:z.boolean(),status:z.enum(['editing','finalized','not-required','disconnected','eliminated'])}).strict();
export const presentationSchema=z.object({id,year:z.number().int().positive(),season:z.enum(['spring','autumn']),before:z.array(previewUnitSchema),after:z.array(previewUnitSchema),orders:z.array(z.union([orderSchema,bicycleOrderSchema.omit({equipmentId:true}),deployOrderSchema.omit({equipmentId:true})])),movement:movementSchema}).strict();
export const publicGameSchema=z.object({year:z.number().int(),season:z.enum(['spring','autumn','winter']),phase:z.enum(['orders','retreats','sc-update','adjustments','end-of-year','finished']),phaseKey,
  status:z.enum(['playing','finished']),maxYears:z.number().int().positive(),endResult:endResultSchema.nullable(),summary:metricsSchema,
  board:gameStatePreviewSchema,seed:z.string(),playerWards:z.record(z.string(),wardSchema),inactiveWards:z.array(wardSchema),activePlayerCount:z.number().int(),victoryTargetSC:z.number().int(),
  presentation:presentationSchema.nullable(),requiredRivalInitialSupplyCentersForInstantWin:z.number().int().nonnegative(),rivalInitialSCByWard:z.record(z.string(),z.number().int().nonnegative()),events:publicEventsSchema,inventoryCounts:z.record(z.string(),z.object({bicycle:z.number().int().nonnegative(),barricade:z.number().int().nonnegative()}).strict()),
  end:gameEndSchema.nullable(),lastResult:publicResultSchema.nullable()}).strict();
export type PublicGameView=z.infer<typeof publicGameSchema>;
export const publicRoomSchema=z.object({roomCode:z.string(),hostId:id,hostReconnectDeadline:z.number().nullable().optional(),map:mapDefinitionSchema.optional(),players:z.array(publicPlayerSchema),startErrors:strings,scenario:z.object({scenarioId:z.string(),scenarioName:z.string(),scenarioHash:z.string(),fileName:z.string().optional(),source:z.enum(['standard','custom','editor']).optional(),loaded:z.boolean(),enabledRegions:z.number().int(),totalSC:z.number().int(),totalStartingUnits:z.number().int(),errors:strings,warnings:strings,maxYears:z.number().int().positive()}).strict(),game:publicGameSchema.nullable()}).strict();
export type PublicRoomView=z.infer<typeof publicRoomSchema>;
const winterBudgetSchema=z.object({supplyCenters:z.number().int(),units:z.number().int(),nonSCRegions:z.number().int(),buildCount:z.number().int(),disbandCount:z.number().int(),buildRegionIds:strings}).strict();
export const privatePlayerSchema=z.object({playerId:id,preferredWardId:preference,wardId:wardSchema.nullable(),phaseKey:phaseKey.nullable(),finalized:z.boolean(),
  orders:z.array(gameOrderSchema),legalOrders:z.record(z.string(),z.array(gameOrderSchema)),inventory:z.array(equipmentSchema),reservations:z.array(reservationSchema),retreatOrders:z.array(retreatOrderSchema),retreatUnits:z.array(dislodgedSchema),winterDraft:winterDraftSchema,winterBudget:winterBudgetSchema.nullable()}).strict();
export type PrivatePlayerView=z.infer<typeof privatePlayerSchema>;
export interface ClientToServerEvents { request:(request:OnlineRequest,ack:(response:OnlineResponse)=>void)=>void }
export const sessionEndedSchema=z.object({roomCode:z.string(),playerId:id,reason:z.enum(['kicked','replaced'])}).strict();
export type SessionEnded=z.infer<typeof sessionEndedSchema>;
export interface ServerToClientEvents { publicState:(view:PublicRoomView)=>void;privateState:(view:PrivatePlayerView)=>void;sessionEnded:(event:SessionEnded)=>void }
