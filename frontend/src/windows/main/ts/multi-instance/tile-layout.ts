import type { ProbeFrame } from './probe';

export function calculateTileFrames(
	display: ProbeFrame,
	windowCount: number,
	gap = 8
): ProbeFrame[] {
	const count = Math.min(Math.max(Math.floor(windowCount), 0), 4);
	if (count === 0) return [];

	const columns = count === 1 ? 1 : 2;
	const rows = count <= 2 ? 1 : 2;
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
