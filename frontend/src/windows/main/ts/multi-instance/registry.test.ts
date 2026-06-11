import { describe, expect, it } from 'bun:test';
import { InstanceRegistry } from './registry';
import type { ManagedInstance } from './types';

const account = { userId: 1, username: 'first', displayName: 'First' };
const target = { kind: 'place' as const, placeId: '920587237' };

describe('InstanceRegistry', () => {
	it('registers and resolves an owned process by PID and start time', () => {
		const registry = new InstanceRegistry();
		const instance = registry.begin(account, target, 'open-new');
		registry.markRunning(instance.id, {
			pid: 410,
			startedAt: 'Tue Jun  9 10:00:00 2026',
			command: '/Applications/Roblox.app/Contents/MacOS/RobloxPlayer',
		});

		expect(registry.findOwned(410, 'Tue Jun  9 10:00:00 2026')?.account.userId).toBe(1);
		expect(registry.findOwned(410, 'Tue Jun  9 11:00:00 2026')).toBeNull();
	});

	it('keeps a failed launch without inventing a process owner', () => {
		const registry = new InstanceRegistry();
		const instance = registry.begin(account, target, 'open-new');
		registry.markFailed(instance.id, 'No new RobloxPlayer process appeared');

		expect(registry.get(instance.id)).toMatchObject({
			state: 'failed',
			process: null,
			error: 'No new RobloxPlayer process appeared',
		});
	});

	it('attaches a discovered window only to the requested instance', () => {
		const registry = new InstanceRegistry();
		const first = registry.begin(account, target, 'open-new');
		const second = registry.begin(
			{ userId: 2, username: 'second', displayName: 'Second' },
			target,
			'open-new'
		);
		const window = { windowId: 9, x: 10, y: 20, width: 800, height: 600 };

		registry.setWindow(first.id, window);

		expect(registry.get(first.id)?.window).toEqual(window);
		expect(registry.get(second.id)?.window).toBeNull();
	});

	it('notifies subscribers with immutable snapshots', () => {
		const registry = new InstanceRegistry();
		const snapshots: ManagedInstance[][] = [];
		const unsubscribe = registry.subscribe((instances) => snapshots.push(instances));

		const instance = registry.begin(account, target, 'isolated-profile');
		const firstSnapshot = snapshots.at(-1)!;
		registry.setMirrorReceiver(instance.id, true);

		expect(firstSnapshot[0].mirrorReceiver).toBe(false);
		expect(snapshots.at(-1)?.[0].mirrorReceiver).toBe(true);
		expect(snapshots.at(-1)).not.toBe(firstSnapshot);

		unsubscribe();
		registry.markFailed(instance.id, 'ignored after unsubscribe');
		expect(snapshots.at(-1)?.[0].state).toBe('launching');
	});

	it('tracks closing, exited, and crashed lifecycle states', () => {
		const registry = new InstanceRegistry();
		const closing = registry.begin(account, target, 'isolated-profile');
		const exited = registry.begin(account, target, 'isolated-profile');
		const crashed = registry.begin(account, target, 'isolated-profile');

		registry.markClosing(closing.id);
		registry.markExited(exited.id);
		registry.markCrashed(crashed.id, 'Roblox exited unexpectedly');

		expect(registry.get(closing.id)?.state).toBe('closing');
		expect(registry.get(exited.id)?.state).toBe('exited');
		expect(registry.get(crashed.id)).toMatchObject({
			state: 'crashed',
			error: 'Roblox exited unexpectedly',
		});
	});

	it('removes a closed instance and notifies subscribers', () => {
		const registry = new InstanceRegistry();
		const snapshots: ManagedInstance[][] = [];
		registry.subscribe((instances) => snapshots.push(instances));
		const instance = registry.begin(account, target, 'isolated-profile');

		registry.remove(instance.id);

		expect(registry.get(instance.id)).toBeNull();
		expect(snapshots.at(-1)).toEqual([]);
	});
});
