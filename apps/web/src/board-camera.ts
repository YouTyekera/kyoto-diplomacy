export interface BoardView { x: number; y: number; width: number; height: number }
/** Presentation only: fit points using the canvas aspect, with room around the board. */
export function fitBoard(points: number[][], aspect: number, padding = 1.16): BoardView | null {
  if (!points.length) return null;
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const height = Math.max(24, maxY - minY, (maxX - minX) / aspect) * padding;
  const width = height * aspect;
  return { x: (minX + maxX - width) / 2, y: (minY + maxY - height) / 2, width, height };
}

/** Player camera only. Keep some board visible while preserving the requested center. */
export function clampBoardView(view: BoardView, all: BoardView, aspect: number): BoardView {
  const width = Math.min(Math.max(8, view.width), all.width * 1.04), height = width / aspect;
  const cx = Math.min(all.x + all.width + width * .3, Math.max(all.x - width * .3, view.x + view.width / 2));
  const cy = Math.min(all.y + all.height + height * .3, Math.max(all.y - height * .3, view.y + view.height / 2));
  return { x: cx - width / 2, y: cy - height / 2, width, height };
}

/** Neutral symbols shrink smoothly near the all-board camera, never because of occupancy. */
export function neutralSupplyScale(width: number, allWidth: number): number {
  const t = Math.max(0, Math.min(1, (width / allWidth - .68) / .2));
  return 1 - .3 * t * t * (3 - 2 * t);
}
