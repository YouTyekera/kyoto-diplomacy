import { wardColor } from '../../../packages/shared/display';
export const markerGeometry = { scRadius: 6, scStroke: 1.6, ownerRadius: 3.8, ownerStroke: 2, pinTipY: 9, pinOffsetY: -9 } as const;
/** This component has no Army/occupancy input: SC geometry never depends on units. */
export function SupplyCenterMarker({ owner, neutralScale = 1 }: { owner: string | null | undefined; preview: boolean; neutralScale?: number }) {
  const scale = owner ? 1 : neutralScale;
  return <g className="supply-marker" data-supply-owner={owner ?? 'neutral'}>
    <circle className="supply-circle" cx="0" cy="0" r={markerGeometry.scRadius * scale} fill="#fffdf0" stroke="#283d37" strokeWidth={markerGeometry.scStroke * scale} />
    <circle className="supply-owner-ring" cx="0" cy="0" r={markerGeometry.ownerRadius} fill="none" stroke={owner ? wardColor(owner) : 'none'} strokeWidth={markerGeometry.ownerStroke} />
  </g>;
}
export function ArmyMarker({ owner,isOwnUnit=false }: { owner: string;isOwnUnit?:boolean }) {
  return <g className={`unit-marker ${isOwnUnit?'own-unit':''}`} data-own-unit={isOwnUnit?'true':'false'} data-unit-owner={owner} transform={`translate(0 ${markerGeometry.pinOffsetY})`} data-pin-tip={`0,${markerGeometry.pinTipY}`}>
    {isOwnUnit&&<path className="own-unit-halo" d="M0 9C-2 6-7 1-7-3C-7-12 7-12 7-3C7 1 2 6 0 9Z" fill="none" stroke="#fffef4" strokeWidth="2"/>}
    <path className="unit-frame unit-pin" d="M0 9C-2 6-7 1-7-3C-7-12 7-12 7-3C7 1 2 6 0 9Z" fill={wardColor(owner)} />
    <path className="army-symbol" d="M0-7L3-2H-3Z" fill="#fff" />
  </g>;
}
