import geography from '../../../data/config/kyoto-geography.json';
/** A pointer-transparent, optional decor layer below every playable region. */
export function KyotoGeography({project,scale}:{project:(point:number[])=>number[];scale:number}){
  return <g className="kyoto-geography" data-geography-layer="decorative" pointerEvents="none" aria-hidden="true">
    {geography.lines.map(line=>{const at=project(line.labelPoint??line.points[Math.floor(line.points.length/2)]);return <g key={line.name} data-geography-feature={line.name}>
      <polyline points={line.points.map(project).map(p=>p.join(',')).join(' ')} fill="none" stroke={line.kind==='river'?'#83adb2':'#839b8b'} strokeWidth={line.kind==='river'?7:2.5} strokeDasharray={line.kind==='subway'?'4 4':undefined} vectorEffect="non-scaling-stroke" strokeLinecap="round"/>
      <text x={at[0]+4*scale} y={at[1]-6*scale} fontSize={11*scale} fill="#496a65">{line.name}</text>
    </g>;})}
    <g data-geography-feature="京都駅" transform={`translate(${project(geography.station.point).join(' ')}) scale(${scale})`}><rect x="-6" y="-4" width="12" height="8" rx="2" fill="#8c9185"/><text x="9" y="4" fontSize="12" fill="#566b61">京都駅</text></g>
  </g>;
}
