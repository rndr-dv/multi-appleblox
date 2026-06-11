import { describe, expect, it } from 'bun:test';
import { parseLaunchTarget } from './launch-target';

describe('parseLaunchTarget', () => {
	it('launches the Roblox app when the experience is blank', () => {
		expect(parseLaunchTarget('')).toEqual({ kind: 'app' });
		expect(parseLaunchTarget('   ')).toEqual({ kind: 'app' });
	});

	it('joins a numeric experience after trimming whitespace', () => {
		expect(parseLaunchTarget(' 13379208636 ')).toEqual({
			kind: 'place',
			placeId: '13379208636',
		});
	});

	it('rejects a non-numeric experience', () => {
		expect(() => parseLaunchTarget('Attack on Titan')).toThrow(
			'Place ID must contain only digits'
		);
	});
});
