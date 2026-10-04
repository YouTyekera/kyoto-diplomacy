import { memo, useId } from 'react';
import type { BoardView } from './board-camera';

/** Original symbolic terrain. Playable polygons and known obstacles are masked out.
 * This component never supplies regions or adjacency to the game. */
export const TerrainBackdrop = memo(function TerrainBackdrop({ playablePaths, view, unitsPerPixel }: { playablePaths: string[]; view: BoardView; unitsPerPixel: number }) {
  const id = useId().replace(/:/g, '');
  const mask = `nature-mask-${id}`, pattern = `nature-pattern-${id}`, paper = `paper-${id}`;
  // Geographic-sized artwork stays attached to the board while panning and zooming.
  const extent = { x: view.x - view.width, y: view.y - view.height, width: view.width * 3, height: view.height * 3 };
  return <g className="terrain-backdrop" aria-hidden="true" pointerEvents="none">
    <defs>
      <mask id={mask} maskUnits="userSpaceOnUse" {...extent} style={{ maskType: 'luminance' }}>
        <rect {...extent} fill="white" />
        {playablePaths.map((path, i) => <path key={i} d={path} fill="black" fillRule="evenodd" />)}
      </mask>
      <pattern id={paper} width={6*unitsPerPixel} height={6*unitsPerPixel} patternUnits="userSpaceOnUse">
        <circle cx={unitsPerPixel} cy={2*unitsPerPixel} r={.25*unitsPerPixel} fill="#a5a48b" opacity=".28" />
      </pattern>
      <pattern id={pattern} width="54" height="46" patternUnits="userSpaceOnUse">
        <path d="M-10 37Q5 18 19 22T58 10M-9 40Q5 21 19 25T59 13M-8 43Q5 24 19 28T60 16" fill="none" stroke="#6d9280" strokeWidth=".25" opacity=".34" />
        <path d="M7 17l7-10 7 10m-11-4 4-6 4 6M32 38l9-14 10 14m-14-8 4-6 4 6" fill="#c9d4b7" stroke="#648372" strokeWidth=".55" strokeLinejoin="round" />
        <path d="M14 7l2 7-2-1-2 2M41 24l2 8-2-2-2 2" fill="none" stroke="#8a9b77" strokeWidth=".4" />
        <g fill="#9db5a0" stroke="#6d8d79" strokeWidth=".35">
          <path d="M29 9l2-4 2 4h-1l2 3h-6l2-3ZM25 15l2-4 2 4h-1l2 3h-6l2-3ZM3 29l2-4 2 4H6l2 3H2l2-3Z" />
        </g>
      </pattern>
    </defs>
    <rect {...extent} fill="#eee9d7" />
    <rect {...extent} fill={`url(#${paper})`} />
    <g mask={`url(#${mask})`} data-nature-layer="non-playable">
      <rect {...extent} fill="#b9cbb7" />
      <rect {...extent} fill={`url(#${pattern})`} />
    </g>
  </g>;
});
