export interface MarkerInput { regionId: string; anchor: number[]; priority: boolean }
export interface MarkerPosition extends MarkerInput { x: number; y: number; displaced: boolean }
/** Phase 2A: stay at the geographic anchor. Selected marker renders last, above neighbours. */
export function layoutMarkers(markers: MarkerInput[]): MarkerPosition[] {
  const sorted = [...markers].sort((a, b) => Number(a.priority) - Number(b.priority) || a.regionId.localeCompare(b.regionId));
  return sorted.map(marker=>({...marker,x:marker.anchor[0],y:marker.anchor[1],displaced:false}));
}
export function markerPixels(zoom:number):number {return Math.max(10,Math.min(22,12*Math.pow(zoom,0.35)));}
