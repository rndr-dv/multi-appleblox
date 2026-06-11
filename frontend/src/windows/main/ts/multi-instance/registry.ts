import type { RobloxProcessIdentity } from './processes';
import type {
	InstanceAccount,
	LaunchMethod,
	LaunchTarget,
	ManagedInstance,
} from './types';

export type InstanceListener = (instances: ManagedInstance[]) => void;

export class InstanceRegistry {
	private readonly instances = new Map<string, ManagedInstance>();
	private readonly listeners = new Set<InstanceListener>();

	begin(account: InstanceAccount, target: LaunchTarget, method: LaunchMethod): ManagedInstance {
		const instance: ManagedInstance = {
			id: crypto.randomUUID(),
			account,
			target,
			method,
			process: null,
			window: null,
			state: 'launching',
			mirrorReceiver: false,
			error: null,
		};
		this.instances.set(instance.id, instance);
		this.notify();
		return this.clone(instance);
	}

	markRunning(id: string, process: RobloxProcessIdentity): void {
		const instance = this.require(id);
		instance.process = process;
		instance.state = 'running';
		instance.error = null;
		this.notify();
	}

	markFailed(id: string, error: string): void {
		const instance = this.require(id);
		instance.process = null;
		instance.state = 'failed';
		instance.error = error;
		this.notify();
	}

	markClosing(id: string): void {
		const instance = this.require(id);
		instance.state = 'closing';
		instance.error = null;
		this.notify();
	}

	markExited(id: string): void {
		const instance = this.require(id);
		instance.state = 'exited';
		instance.error = null;
		this.notify();
	}

	markCrashed(id: string, error: string): void {
		const instance = this.require(id);
		instance.state = 'crashed';
		instance.error = error;
		this.notify();
	}

	setWindow(id: string, window: ManagedInstance['window']): void {
		this.require(id).window = window;
		this.notify();
	}

	setMirrorReceiver(id: string, selected: boolean): void {
		this.require(id).mirrorReceiver = selected;
		this.notify();
	}

	remove(id: string): void {
		if (!this.instances.delete(id)) return;
		this.notify();
	}

	get(id: string): ManagedInstance | null {
		const instance = this.instances.get(id);
		return instance ? this.clone(instance) : null;
	}

	list(): ManagedInstance[] {
		return [...this.instances.values()].map((instance) => this.clone(instance));
	}

	findOwned(pid: number, startedAt: string): ManagedInstance | null {
		return (
			this.list().find(
				(instance) =>
					instance.process?.pid === pid &&
					instance.process.startedAt === startedAt &&
					instance.state === 'running'
			) ?? null
		);
	}

	subscribe(listener: InstanceListener): () => void {
		this.listeners.add(listener);
		listener(this.list());
		return () => this.listeners.delete(listener);
	}

	private notify(): void {
		const snapshot = this.list();
		for (const listener of this.listeners) {
			listener(snapshot.map((instance) => this.clone(instance)));
		}
	}

	private clone(instance: ManagedInstance): ManagedInstance {
		return {
			...instance,
			account: { ...instance.account },
			target: { ...instance.target },
			process: instance.process ? { ...instance.process } : null,
			window: instance.window ? { ...instance.window } : null,
		};
	}

	private require(id: string): ManagedInstance {
		const instance = this.instances.get(id);
		if (!instance) throw new Error(`Unknown MultaBlox instance: ${id}`);
		return instance;
	}
}
