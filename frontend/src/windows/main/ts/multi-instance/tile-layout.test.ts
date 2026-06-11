import { describe, expect, it } from 'bun:test';
import { calculateTileFrames } from './tile-layout';

const display = { x: 0, y: 0, width: 1000, height: 800 };

describe('calculateTileFrames', () => {
	it('fills the visible frame with one window and an outer gap', () => {
		expect(calculateTileFrames(display, 1, 8)).toEqual([
			{ x: 8, y: 8, width: 984, height: 784 },
		]);
	});

	it('uses equal columns for two windows', () => {
		expect(calculateTileFrames(display, 2, 8)).toEqual([
			{ x: 8, y: 8, width: 488, height: 784 },
			{ x: 504, y: 8, width: 488, height: 784 },
		]);
	});

	it('uses the first three cells of a two-by-two grid for three windows', () => {
		expect(calculateTileFrames(display, 3, 8)).toEqual([
			{ x: 8, y: 8, width: 488, height: 388 },
			{ x: 504, y: 8, width: 488, height: 388 },
			{ x: 8, y: 404, width: 488, height: 388 },
		]);
	});

	it('returns at most four frames', () => {
		expect(calculateTileFrames(display, 5, 8)).toEqual([
			{ x: 8, y: 8, width: 488, height: 388 },
			{ x: 504, y: 8, width: 488, height: 388 },
			{ x: 8, y: 404, width: 488, height: 388 },
			{ x: 504, y: 404, width: 488, height: 388 },
		]);
	});
});
