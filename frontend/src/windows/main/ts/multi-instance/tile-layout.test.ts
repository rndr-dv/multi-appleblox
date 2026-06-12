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

	it('uses a three-by-two grid for five or six windows', () => {
		expect(calculateTileFrames(display, 5, 8)).toEqual([
			{ x: 8, y: 8, width: 322, height: 388 },
			{ x: 338, y: 8, width: 322, height: 388 },
			{ x: 668, y: 8, width: 322, height: 388 },
			{ x: 8, y: 404, width: 322, height: 388 },
			{ x: 338, y: 404, width: 322, height: 388 },
		]);
	});

	it('uses a three-by-three grid and returns at most nine frames', () => {
		expect(calculateTileFrames(display, 10, 8)).toEqual([
			{ x: 8, y: 8, width: 322, height: 256 },
			{ x: 338, y: 8, width: 322, height: 256 },
			{ x: 668, y: 8, width: 322, height: 256 },
			{ x: 8, y: 272, width: 322, height: 256 },
			{ x: 338, y: 272, width: 322, height: 256 },
			{ x: 668, y: 272, width: 322, height: 256 },
			{ x: 8, y: 536, width: 322, height: 256 },
			{ x: 338, y: 536, width: 322, height: 256 },
			{ x: 668, y: 536, width: 322, height: 256 },
		]);
	});
});
