import type { LaunchTarget } from './types';

export function parseLaunchTarget(value: string): LaunchTarget {
	const placeId = value.trim();
	if (!placeId) return { kind: 'app' };
	if (!/^\d+$/.test(placeId)) {
		throw new Error('Place ID must contain only digits');
	}
	return { kind: 'place', placeId };
}
