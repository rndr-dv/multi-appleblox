import { libraryPath } from '../libraries';
import { PathManager } from '../roblox/path-manager';
import { shell } from '../tools/shell';
import { sleep } from '../utils';
import { createDefaultInputMirrorController, type InputMirrorController } from './input-mirror';
import { defaultLaunchDependencies, launchAccount } from './launcher';
import { InstanceManager } from './manager';
import { InstanceProbe } from './probe';
import { snapshotRobloxProcesses } from './processes';
import { InstanceRegistry } from './registry';

export interface InstanceRuntime {
	manager: InstanceManager;
	mirror: InputMirrorController;
}

let runtimePromise: Promise<InstanceRuntime> | null = null;

async function createRuntime(): Promise<InstanceRuntime> {
	await PathManager.initialize();
	const robloxPath = PathManager.getPath();
	if (!robloxPath) throw new Error('Roblox installation was not found');

	const registry = new InstanceRegistry();
	const probe = new InstanceProbe(libraryPath('instance_probe'));
	const mirror = createDefaultInputMirrorController();
	const launchDependencies = defaultLaunchDependencies(robloxPath);
	const manager = new InstanceManager(
		registry,
		{
			launch: (account, target, targetRegistry) =>
				launchAccount(
					account,
					target,
					'isolated-profile',
					targetRegistry,
					launchDependencies
				),
			snapshot: snapshotRobloxProcesses,
			discoverWindow: (pid) => probe.window(pid),
			display: (pid) => probe.display(pid),
			setFrame: (pid, frame) => probe.setFrame(pid, frame),
			focus: (pid) => probe.focus(pid),
			terminate: async (process, force) => {
				const result = await shell('kill', force ? ['-9', process.pid] : [process.pid], {
					skipStderrCheck: true,
				});
				if (result.exitCode !== 0) {
					throw new Error(result.stdErr.trim() || `Failed to close Roblox process ${process.pid}`);
				}
			},
			sleep: async (milliseconds) => {
				await sleep(milliseconds);
			},
			requestAccessibility: () => probe.requestAccessibility(),
		},
		mirror
	);
	globalThis.setInterval(() => {
		void manager.reconcile().catch(() => {});
	}, 1000);
	return { manager, mirror };
}

export function getInstanceRuntime(): Promise<InstanceRuntime> {
	runtimePromise ??= createRuntime();
	return runtimePromise;
}

export async function getExistingInstanceRuntime(): Promise<InstanceRuntime | null> {
	return runtimePromise ? await runtimePromise : null;
}
