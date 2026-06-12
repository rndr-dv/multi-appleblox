import type { ProbeFrame } from './probe';

export const TILE_CAPACITIES = [4, 6, 9] as const;
export type TileCapacity = (typeof TILE_CAPACITIES)[number];

export function calculateTileFrames(
	display: ProbeFrame,
	windowCount: number,
	gap = 8
): ProbeFrame[] {
	const count = Math.min(Math.max(Math.floor(windowCount), 0), 9);
	if (count === 0) return [];

	const columns = count === 1 ? 1 : count <= 4 ? 2 : 3;
	const rows = Math.ceil(count / columns);
	const cellWidth = Math.floor((display.width - gap * (columns + 1)) / columns);
	const cellHeight = Math.floor((display.height - gap * (rows + 1)) / rows);

	return Array.from({ length: count }, (_, index) => {
		const column = index % columns;
		const row = Math.floor(index / columns);
		return {
			x: Math.round(display.x + gap + column * (cellWidth + gap)),
			y: Math.round(display.y + gap + row * (cellHeight + gap)),
			width: cellWidth,
			height: cellHeight,
		};
	});
}
