import type { ProbeWindow } from './probe';
import { findLiveProcess, type RobloxProcessIdentity } from './processes';
import { InstanceRegistry, type InstanceListener } from './registry';
import { calculateTileFrames, type TileCapacity } from './tile-layout';
import type { InstanceAccount, LaunchTarget, ManagedInstance } from './types';

export interface InstanceManagerDependencies {
	launch(
		account: InstanceAccount,
		target: LaunchTarget,
		registry: InstanceRegistry
	): Promise<ManagedInstance>;
	snapshot(): Promise<RobloxProcessIdentity[]>;
	discoverWindow(pid: number): Promise<ProbeWindow>;
	display(pid: number): Promise<{ x: number; y: number; width: number; height: number }>;
	setFrame(
		pid: number,
		frame: { x: number; y: number; width: number; height: number }
	): Promise<void>;
	focus(pid: number): Promise<void>;
	terminate(process: RobloxProcessIdentity, force: boolean): Promise<void>;
	sleep(milliseconds: number): Promise<void>;
	requestAccessibility(): Promise<void>;
}

export interface InstanceMirrorSync {
	configure(instances: ManagedInstance[]): Promise<void>;
	stop?(): Promise<void>;
}

export class InstanceManager {
	private lastCapabilityError: string | null = null;
	private tileCapacity: TileCapacity = 4;

	constructor(
		private readonly registry: InstanceRegistry,
		private readonly dependencies: InstanceManagerDependencies,
		private readonly mirror?: InstanceMirrorSync
	) {
		if (mirror) {
			this.registry.subscribe((instances) => {
				void mirror.configure(instances).catch(() => {});
			});
		}
	}

	subscribe(listener: InstanceListener): () => void {
		return this.registry.subscribe(listener);
	}

	async launch(accounts: InstanceAccount[], target: LaunchTarget): Promise<ManagedInstance[]> {
		const launched: ManagedInstance[] = [];
		for (const account of accounts) {
			const instance = await this.dependencies.launch(account, target, this.registry);
			if (instance.state === 'running' && instance.process) {
				await this.attachWindow(instance.id);
			}
			launched.push(this.registry.get(instance.id)!);
		}
		return launched;
	}

	async attachWindow(instanceId: string): Promise<void> {
		const instance = this.registry.get(instanceId);
		if (!instance?.process || instance.state !== 'running') return;

		try {
			const window = await this.dependencies.discoverWindow(instance.process.pid);
			this.registry.setWindow(instance.id, window);
			this.lastCapabilityError = null;
			const runningWithWindows = this.runningWithWindows();
			if (runningWithWindows.length <= this.tileCapacity) {
				await this.tile();
			}
		} catch (error) {
			this.lastCapabilityError = error instanceof Error ? error.message : String(error);
		}
	}

	async tile(): Promise<void> {
		await this.discoverMissingWindows();
		const instances = this.runningWithWindows().slice(0, this.tileCapacity);
		if (instances.length === 0) return;

		try {
			const liveProcesses = await this.dependencies.snapshot();
			const verified = instances.map((instance) => {
				const process = instance.process!;
				const live = findLiveProcess(process, liveProcesses);
				if (!live) {
					throw new Error(`Instance ${instance.id} is no longer owned by MultaBlox`);
				}
				return live;
			});
			const display = await this.dependencies.display(verified[0].pid);
			const frames = calculateTileFrames(display, verified.length);
			for (let index = 0; index < verified.length; index++) {
				await this.dependencies.setFrame(verified[index].pid, frames[index]);
			}
			this.lastCapabilityError = null;
		} catch (error) {
			this.lastCapabilityError = error instanceof Error ? error.message : String(error);
		}
	}

	async requestAccessibility(): Promise<void> {
		await this.dependencies.requestAccessibility();
	}

	setTileCapacity(capacity: TileCapacity): void {
		this.tileCapacity = capacity;
	}

	async focus(instanceId: string): Promise<void> {
		const process = await this.requireLiveOwned(instanceId);
		await this.dependencies.focus(process.pid);
	}

	async close(instanceId: string): Promise<void> {
		const process = await this.requireLiveOwned(instanceId);
		this.registry.markClosing(instanceId);
		try {
			await this.dependencies.terminate(process, false);
			await this.dependencies.sleep(500);
			const liveProcess = findLiveProcess(process, await this.dependencies.snapshot());
			if (liveProcess) {
				await this.dependencies.terminate(liveProcess, true);
				await this.dependencies.sleep(250);
				if (findLiveProcess(process, await this.dependencies.snapshot())) {
					throw new Error(`Roblox process ${process.pid} did not exit`);
				}
			}
			this.registry.remove(instanceId);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			this.registry.markCrashed(instanceId, message);
			throw error;
		}
	}

	async reconcile(): Promise<void> {
		const liveProcesses = await this.dependencies.snapshot();
		for (const instance of this.registry.list()) {
			if (
				(instance.state !== 'running' && instance.state !== 'closing') ||
				!instance.process
			) {
				continue;
			}
			if (!findLiveProcess(instance.process, liveProcesses)) {
				this.registry.remove(instance.id);
			}
		}
	}

	setMirrorReceiver(instanceId: string, selected: boolean): void {
		this.registry.setMirrorReceiver(instanceId, selected);
	}

	liveInstances(): ManagedInstance[] {
		return this.registry
			.list()
			.filter((instance) => instance.state === 'launching' || instance.state === 'running' || instance.state === 'closing');
	}

	capabilityError(): string | null {
		return this.lastCapabilityError;
	}

	async shutdown(options: { timeoutMs: number } = { timeoutMs: 3000 }): Promise<void> {
		await this.mirror?.stop?.();

		const candidates = this.registry
			.list()
			.filter((instance) => instance.state === 'running' && instance.process);
		const before = await this.dependencies.snapshot();
		const verified = candidates.flatMap((instance) => {
			const process = findLiveProcess(instance.process!, before);
			if (!process) {
				this.registry.markExited(instance.id);
				return [];
			}
			return [{ instance, process }];
		});

		for (const { instance, process } of verified) {
			this.registry.markClosing(instance.id);
			await this.dependencies.terminate(process, false).catch(() => {});
		}

		if (verified.length > 0) {
			await this.dependencies.sleep(options.timeoutMs);
			const after = await this.dependencies.snapshot();
			for (const { instance, process } of verified) {
				if (findLiveProcess(process, after)) {
					await this.dependencies.terminate(process, true).catch(() => {});
				}
				this.registry.markExited(instance.id);
			}
		}
	}

	private runningWithWindows(): ManagedInstance[] {
		return this.registry
			.list()
			.filter((instance) => instance.state === 'running' && instance.process && instance.window);
	}

	private async discoverMissingWindows(): Promise<void> {
		const missing = this.registry
			.list()
			.filter((instance) => instance.state === 'running' && instance.process && !instance.window);
		for (const instance of missing) {
			try {
				const window = await this.dependencies.discoverWindow(instance.process!.pid);
				this.registry.setWindow(instance.id, window);
				this.lastCapabilityError = null;
			} catch (error) {
				this.lastCapabilityError = error instanceof Error ? error.message : String(error);
			}
		}
	}

	private async requireLiveOwned(instanceId: string): Promise<RobloxProcessIdentity> {
		const instance = this.registry.get(instanceId);
		if (!instance?.process || instance.state !== 'running') {
			throw new Error(`Instance ${instanceId} is not running`);
		}

		const liveProcess = findLiveProcess(instance.process, await this.dependencies.snapshot());
		if (!liveProcess) {
			throw new Error(`Instance ${instanceId} is no longer owned by MultaBlox`);
		}
		return liveProcess;
	}
}
