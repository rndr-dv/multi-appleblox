import { libraryPath } from '../libraries';
import { shell, spawn } from '../tools/shell';
import type { ManagedInstance } from './types';
import { requestAppAccessibility } from './permissions';

export interface InputMirrorSnapshot {
	enabled: boolean;
	sourcePid: number | null;
	error: string | null;
	hotkey: 'Command+Shift+M';
}

export interface InputMirrorProcess {
	on(event: 'stdOut' | 'stdErr', listener: (data: string) => void): void;
	on(event: 'exit', listener: (exitCode: number) => void): void;
	writeStdin(data: string): Promise<void>;
	endStdin(): Promise<void>;
	kill(force?: boolean): Promise<void>;
}

export type InputMirrorProcessFactory = () => Promise<InputMirrorProcess>;
export type InputMirrorPermissionRequester = () => Promise<void>;
export type InputMirrorListener = (snapshot: InputMirrorSnapshot) => void;

interface NativeMirrorStatus {
	type: 'status';
	enabled: boolean;
	sourcePid?: number | null;
	error?: string | null;
}

export class InputMirrorController {
	private process: InputMirrorProcess | null = null;
	private starting: Promise<InputMirrorProcess> | null = null;
	private outputBuffer = '';
	private listeners = new Set<InputMirrorListener>();
	private instances: ManagedInstance[] = [];
	private stopping = false;
	private state: InputMirrorSnapshot = {
		enabled: false,
		sourcePid: null,
		error: null,
		hotkey: 'Command+Shift+M',
	};

	constructor(
		private readonly createProcess: InputMirrorProcessFactory,
		private readonly requestPermissions: InputMirrorPermissionRequester = async () => {}
	) {}

	subscribe(listener: InputMirrorListener): () => void {
		this.listeners.add(listener);
		listener(this.snapshot());
		return () => this.listeners.delete(listener);
	}

	snapshot(): InputMirrorSnapshot {
		return { ...this.state };
	}

	async configure(instances: ManagedInstance[]): Promise<void> {
		this.instances = instances.filter(
			(instance) => instance.state === 'running' && instance.process !== null
		);
		if (this.instances.length === 0) {
			if (this.state.enabled) {
				this.update({ enabled: false, sourcePid: null, error: 'No managed instance is running' });
			}
			return;
		}

		const managedPids = this.instances.map((instance) => instance.process!.pid);
		const receiverPids = this.instances
			.filter((instance) => instance.mirrorReceiver)
			.map((instance) => instance.process!.pid);
		if (this.process) {
			await this.sendConfiguration(this.process, managedPids, receiverPids);
		}

		if (receiverPids.length === 0 && this.state.enabled) {
			this.update({
				enabled: false,
				sourcePid: null,
				error: 'Select at least one mirror receiver',
			});
		}
	}

	async setEnabled(enabled: boolean): Promise<void> {
		const receivers = this.instances.filter((instance) => instance.mirrorReceiver);
		if (enabled && receivers.length === 0) {
			this.update({ enabled: false, sourcePid: null, error: 'Select at least one mirror receiver' });
			throw new Error('Select at least one mirror receiver');
		}
		if (enabled) {
			await this.requestPermissions();
		}
		const process = await this.ensureStarted();
		if (enabled) {
			const managedPids = this.instances.map((instance) => instance.process!.pid);
			const receiverPids = receivers.map((instance) => instance.process!.pid);
			await this.sendConfiguration(process, managedPids, receiverPids);
		}
		await this.send(process, { command: 'set-enabled', enabled });
		this.update({
			enabled,
			sourcePid: enabled ? this.state.sourcePid : null,
			error: null,
		});
	}

	handleOutput(chunk: string): void {
		this.outputBuffer += chunk;
		const lines = this.outputBuffer.split('\n');
		this.outputBuffer = lines.pop() ?? '';

		for (const line of lines) {
			if (!line.trim()) continue;
			try {
				const status = JSON.parse(line) as NativeMirrorStatus;
				if (status.type !== 'status') continue;
				this.update({
					enabled: status.enabled,
					sourcePid: status.sourcePid ?? null,
					error: status.error ?? null,
				});
			} catch {
				this.update({ error: 'Input mirror returned malformed status' });
			}
		}
	}

	async stop(): Promise<void> {
		if (!this.process) return;
		this.stopping = true;
		const process = this.process;
		await this.send(process, { command: 'stop' });
		await process.endStdin();
		this.process = null;
		this.starting = null;
		this.update({ enabled: false, sourcePid: null });
	}

	private async ensureStarted(): Promise<InputMirrorProcess> {
		if (this.process) return this.process;
		if (this.starting) return this.starting;

		this.stopping = false;
		this.starting = this.createProcess().then((process) => {
			this.process = process;
			process.on('stdOut', (data) => this.handleOutput(data));
			process.on('stdErr', (data) => {
				const error = data.trim();
				if (error) this.update({ enabled: false, error });
			});
			process.on('exit', (exitCode) => {
				this.process = null;
				this.starting = null;
				this.update({
					enabled: false,
					sourcePid: null,
					error: this.stopping ? null : `Input mirror exited with code ${exitCode}`,
				});
				this.stopping = false;
			});
			return process;
		});
		return this.starting;
	}

	private async send(process: InputMirrorProcess, command: object): Promise<void> {
		await process.writeStdin(`${JSON.stringify(command)}\n`);
	}

	private async sendConfiguration(
		process: InputMirrorProcess,
		managedPids: number[],
		receiverPids: number[]
	): Promise<void> {
		await this.send(process, {
			command: 'configure',
			managedPids,
			receiverPids,
			primaryPid: managedPids[0],
		});
	}

	private update(patch: Partial<InputMirrorSnapshot>): void {
		this.state = { ...this.state, ...patch };
		for (const listener of this.listeners) listener(this.snapshot());
	}
}

export function createDefaultInputMirrorController(): InputMirrorController {
	const binaryPath = libraryPath('input_mirror');
	return new InputMirrorController(
		() => spawn(binaryPath, [], { skipStderrCheck: true }),
		async () => {
			await requestAppAccessibility();
			const result = await shell(binaryPath, ['--request-permissions'], {
				skipStderrCheck: true,
			});
			let status: NativeMirrorStatus | null = null;
			try {
				status = JSON.parse(result.stdOut.trim()) as NativeMirrorStatus;
			} catch {
				throw new Error('Input mirror permission request returned malformed status');
			}
			if (result.exitCode !== 0 || status.error) {
				throw new Error(status.error || 'Input mirror permissions were not granted');
			}
		}
	);
}
