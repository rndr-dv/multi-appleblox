import { describe, expect, it, mock } from 'bun:test';
import { InstanceManager, type InstanceManagerDependencies } from './manager';
import { InstanceRegistry } from './registry';
import type { InstanceAccount, LaunchTarget, ManagedInstance } from './types';

const first: InstanceAccount = { userId: 1, username: 'first', displayName: 'First' };
const second: InstanceAccount = { userId: 2, username: 'second', displayName: 'Second' };
const target: LaunchTarget = { kind: 'place', placeId: '13379208636' };
const processA = {
	pid: 410,
	startedAt: 'Tue Jun  9 10:00:00 2026',
	command: '/profiles/1/Roblox.app/Contents/MacOS/RobloxPlayer',
};
const processB = {
	pid: 512,
	startedAt: 'Tue Jun  9 10:01:00 2026',
	command: '/profiles/2/Roblox.app/Contents/MacOS/RobloxPlayer',
};
const windowA = { windowId: 9, x: 10, y: 20, width: 800, height: 600 };

function createDependencies(
	overrides: Partial<InstanceManagerDependencies> = {}
): InstanceManagerDependencies {
	return {
		launch: async (account, launchTarget, registry) => {
			const instance = registry.begin(account, launchTarget, 'isolated-profile');
			registry.markRunning(instance.id, account.userId === first.userId ? processA : processB);
			return registry.get(instance.id)!;
		},
		snapshot: mock().mockResolvedValue([processA, processB]),
		discoverWindow: mock().mockResolvedValue(windowA),
		display: mock().mockResolvedValue({ x: 0, y: 0, width: 1000, height: 800 }),
		setFrame: mock().mockResolvedValue(undefined),
		focus: mock().mockResolvedValue(undefined),
		terminate: mock().mockResolvedValue(undefined),
		sleep: mock().mockResolvedValue(undefined),
		requestAccessibility: mock().mockResolvedValue(undefined),
		...overrides,
	};
}

describe('InstanceManager', () => {
	it('requests Accessibility through its window helper', async () => {
		const requestAccessibility = mock().mockResolvedValue(undefined);
		const manager = new InstanceManager(
			new InstanceRegistry(),
			createDependencies({ requestAccessibility })
		);

		await manager.requestAccessibility();

		expect(requestAccessibility).toHaveBeenCalledTimes(1);
	});

	it('launches accounts sequentially and attaches discovered windows', async () => {
		const events: string[] = [];
		const dependencies = createDependencies({
			launch: async (account, launchTarget, registry) => {
				events.push(`launch:${account.userId}`);
				const instance = registry.begin(account, launchTarget, 'isolated-profile');
				registry.markRunning(instance.id, account.userId === first.userId ? processA : processB);
				return registry.get(instance.id)!;
			},
			discoverWindow: async (pid) => {
				events.push(`window:${pid}`);
				return { ...windowA, windowId: pid };
			},
		});
		const manager = new InstanceManager(new InstanceRegistry(), dependencies);

		const instances = await manager.launch([first, second], target);

		expect(events).toEqual(['launch:1', 'window:410', 'launch:2', 'window:512']);
		expect(instances.map((instance) => instance.window?.windowId)).toEqual([410, 512]);
	});

	it('keeps a launched instance running when window discovery fails', async () => {
		const manager = new InstanceManager(
			new InstanceRegistry(),
			createDependencies({
				discoverWindow: mock().mockRejectedValue(new Error('Accessibility permission is not granted')),
			})
		);

		const [instance] = await manager.launch([first], target);

		expect(instance).toMatchObject({ state: 'running', window: null });
		expect(manager.capabilityError()).toBe('Accessibility permission is not granted');
	});

	it('focuses only a process whose full identity is still live', async () => {
		const focus = mock().mockResolvedValue(undefined);
		const registry = new InstanceRegistry();
		const manager = new InstanceManager(registry, createDependencies({ focus }));
		const [instance] = await manager.launch([first], target);

		await manager.focus(instance.id);

		expect(focus).toHaveBeenCalledWith(processA.pid);
	});

	it('rejects close when the PID has been reused', async () => {
		const terminate = mock().mockResolvedValue(undefined);
		const registry = new InstanceRegistry();
		const manager = new InstanceManager(
			registry,
			createDependencies({
				snapshot: mock().mockResolvedValue([{ ...processA, startedAt: 'Tue Jun  9 11:00:00 2026' }]),
				terminate,
			})
		);
		const [instance] = await manager.launch([first], target);

		await expect(manager.close(instance.id)).rejects.toThrow('is no longer owned by MultaBlox');
		expect(terminate).not.toHaveBeenCalled();
		expect(registry.get(instance.id)?.state).toBe('running');
	});

	it('closes only the verified managed process', async () => {
		const terminate = mock().mockResolvedValue(undefined);
		const registry = new InstanceRegistry();
		const manager = new InstanceManager(registry, createDependencies({ terminate }));
		const [instance] = await manager.launch([first], target);

		await manager.close(instance.id);

		expect(terminate).toHaveBeenCalledWith(processA, false);
		expect(registry.get(instance.id)).toBeNull();
	});

	it('removes a managed instance after its Roblox process closes externally', async () => {
		const registry = new InstanceRegistry();
		const snapshot = mock()
			.mockResolvedValueOnce([processA, processB])
			.mockResolvedValueOnce([processB]);
		const manager = new InstanceManager(registry, createDependencies({ snapshot }));
		const [instance] = await manager.launch([first], target);

		await manager.reconcile();

		expect(registry.get(instance.id)).toBeNull();
	});

	it('updates mirror receiver state through the registry', async () => {
		const manager = new InstanceManager(new InstanceRegistry(), createDependencies());
		const [instance] = await manager.launch([first], target);

		manager.setMirrorReceiver(instance.id, true);

		expect(manager.liveInstances()[0].mirrorReceiver).toBe(true);
	});

	it('auto-tiles the first four managed windows', async () => {
		const processes = [1, 2, 3, 4].map((userId) => ({
			pid: 400 + userId,
			startedAt: `Tue Jun  9 10:0${userId}:00 2026`,
			command: `/profiles/${userId}/Roblox.app/Contents/MacOS/RobloxPlayer`,
		}));
		const setFrame = mock().mockResolvedValue(undefined);
		const manager = new InstanceManager(
			new InstanceRegistry(),
			createDependencies({
				launch: async (account, launchTarget, registry) => {
					const instance = registry.begin(account, launchTarget, 'isolated-profile');
					registry.markRunning(instance.id, processes[account.userId - 1]);
					return registry.get(instance.id)!;
				},
				snapshot: mock().mockResolvedValue(processes),
				discoverWindow: async (pid) => ({ ...windowA, windowId: pid }),
				setFrame,
			})
		);
		const accounts = processes.map((_, index) => ({
			userId: index + 1,
			username: `user${index + 1}`,
			displayName: `User ${index + 1}`,
		}));

		await manager.launch(accounts, target);

		expect(setFrame).toHaveBeenCalledTimes(10);
		expect(setFrame.mock.calls.slice(-4).map((call) => call[1])).toEqual([
			{ x: 8, y: 8, width: 488, height: 388 },
			{ x: 504, y: 8, width: 488, height: 388 },
			{ x: 8, y: 404, width: 488, height: 388 },
			{ x: 504, y: 404, width: 488, height: 388 },
		]);
	});

	it('does not rearrange existing windows when a fifth instance launches', async () => {
		const processes = [1, 2, 3, 4, 5].map((userId) => ({
			pid: 500 + userId,
			startedAt: `Tue Jun  9 11:0${userId}:00 2026`,
			command: `/profiles/${userId}/Roblox.app/Contents/MacOS/RobloxPlayer`,
		}));
		const setFrame = mock().mockResolvedValue(undefined);
		const manager = new InstanceManager(
			new InstanceRegistry(),
			createDependencies({
				launch: async (account, launchTarget, registry) => {
					const instance = registry.begin(account, launchTarget, 'isolated-profile');
					registry.markRunning(instance.id, processes[account.userId - 1]);
					return registry.get(instance.id)!;
				},
				snapshot: mock().mockResolvedValue(processes),
				discoverWindow: async (pid) => ({ ...windowA, windowId: pid }),
				setFrame,
			})
		);
		const accounts = processes.map((_, index) => ({
			userId: index + 1,
			username: `user${index + 1}`,
			displayName: `User ${index + 1}`,
		}));

		await manager.launch(accounts.slice(0, 4), target);
		const callsBeforeFifth = setFrame.mock.calls.length;
		await manager.launch([accounts[4]], target);

		expect(setFrame).toHaveBeenCalledTimes(callsBeforeFifth);
	});

	it('auto-tiles up to the selected six-window layout', async () => {
		const processes = [1, 2, 3, 4, 5, 6, 7].map((userId) => ({
			pid: 600 + userId,
			startedAt: `Tue Jun  9 12:0${userId}:00 2026`,
			command: `/profiles/${userId}/Roblox.app/Contents/MacOS/RobloxPlayer`,
		}));
		const setFrame = mock().mockResolvedValue(undefined);
		const manager = new InstanceManager(
			new InstanceRegistry(),
			createDependencies({
				launch: async (account, launchTarget, registry) => {
					const instance = registry.begin(account, launchTarget, 'isolated-profile');
					registry.markRunning(instance.id, processes[account.userId - 1]);
					return registry.get(instance.id)!;
				},
				snapshot: mock().mockResolvedValue(processes),
				discoverWindow: async (pid) => ({ ...windowA, windowId: pid }),
				setFrame,
			})
		);
		const accounts = processes.map((_, index) => ({
			userId: index + 1,
			username: `user${index + 1}`,
			displayName: `User ${index + 1}`,
		}));
		manager.setTileCapacity(6);

		await manager.launch(accounts.slice(0, 6), target);
		expect(setFrame.mock.calls.slice(-6).map((call) => call[1])).toEqual([
			{ x: 8, y: 8, width: 322, height: 388 },
			{ x: 338, y: 8, width: 322, height: 388 },
			{ x: 668, y: 8, width: 322, height: 388 },
			{ x: 8, y: 404, width: 322, height: 388 },
			{ x: 338, y: 404, width: 322, height: 388 },
			{ x: 668, y: 404, width: 322, height: 388 },
		]);

		const callsBeforeSeventh = setFrame.mock.calls.length;
		await manager.launch([accounts[6]], target);
		expect(setFrame).toHaveBeenCalledTimes(callsBeforeSeventh);
	});

	it('synchronizes registry changes with the input mirror controller', async () => {
		const configured: ManagedInstance[][] = [];
		const mirror = {
			configure: async (instances: ManagedInstance[]) => {
				configured.push(instances);
			},
		};
		const manager = new InstanceManager(new InstanceRegistry(), createDependencies(), mirror);

		const [instance] = await manager.launch([first], target);
		manager.setMirrorReceiver(instance.id, true);
		await Promise.resolve();

		expect(configured.at(-1)?.[0].mirrorReceiver).toBe(true);
	});

	it('shuts down only verified managed identities and force-kills survivors', async () => {
		const events: string[] = [];
		const unmanaged = {
			pid: 999,
			startedAt: 'Tue Jun  9 12:00:00 2026',
			command: '/Applications/Roblox.app/Contents/MacOS/RobloxPlayer',
		};
		const registry = new InstanceRegistry();
		const firstInstance = registry.begin(first, target, 'isolated-profile');
		const secondInstance = registry.begin(second, target, 'isolated-profile');
		registry.markRunning(firstInstance.id, processA);
		registry.markRunning(secondInstance.id, processB);
		const manager = new InstanceManager(
			registry,
			createDependencies({
				snapshot: mock()
					.mockResolvedValueOnce([processA, processB, unmanaged])
					.mockResolvedValueOnce([processB, unmanaged]),
				terminate: async (process, force) => {
					events.push(`${force ? 'force' : 'graceful'}:${process.pid}`);
				},
				sleep: async (milliseconds) => {
					events.push(`sleep:${milliseconds}`);
				},
			}),
			{
				configure: async () => {},
				stop: async () => {
					events.push('mirror:stop');
				},
			}
		);

		await manager.shutdown({ timeoutMs: 3000 });

		expect(events).toEqual([
			'mirror:stop',
			'graceful:410',
			'graceful:512',
			'sleep:3000',
			'force:512',
		]);
		expect(events.join(',')).not.toContain('999');
		expect(registry.get(firstInstance.id)?.state).toBe('exited');
		expect(registry.get(secondInstance.id)?.state).toBe('exited');
	});
});
