import { describe, expect, it } from 'bun:test';
import {
	InputMirrorController,
	type InputMirrorProcess,
	type InputMirrorProcessFactory,
} from './input-mirror';
import type { ManagedInstance } from './types';

class FakeMirrorProcess implements InputMirrorProcess {
	readonly writes: string[] = [];
	private readonly listeners = new Map<string, Array<(value: string | number) => void>>();

	on(event: 'stdOut' | 'stdErr', listener: (data: string) => void): void;
	on(event: 'exit', listener: (exitCode: number) => void): void;
	on(event: 'stdOut' | 'stdErr' | 'exit', listener: (value: string | number) => void): void {
		this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
	}

	async writeStdin(data: string): Promise<void> {
		this.writes.push(data);
	}

	async endStdin(): Promise<void> {}

	async kill(): Promise<void> {}

	emit(event: 'stdOut' | 'stdErr', data: string): void;
	emit(event: 'exit', data: number): void;
	emit(event: 'stdOut' | 'stdErr' | 'exit', data: string | number): void {
		for (const listener of this.listeners.get(event) ?? []) listener(data);
	}
}

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

function instance(
	id: string,
	process: typeof processA,
	mirrorReceiver: boolean
): ManagedInstance {
	return {
		id,
		account: { userId: process.pid, username: id, displayName: id },
		target: { kind: 'place', placeId: '13379208636' },
		method: 'isolated-profile',
		process,
		window: { windowId: process.pid, x: 0, y: 0, width: 800, height: 600 },
		state: 'running',
		mirrorReceiver,
		error: null,
	};
}

async function createController(): Promise<{
	controller: InputMirrorController;
	process: FakeMirrorProcess;
	factory: InputMirrorProcessFactory;
}> {
	const process = new FakeMirrorProcess();
	const factory: InputMirrorProcessFactory = async () => process;
	const controller = new InputMirrorController(factory);
	return { controller, process, factory };
}

describe('InputMirrorController', () => {
	it('buffers chunked status lines from the sidecar', async () => {
		const { controller } = await createController();

		controller.handleOutput('{"type":"status","enabled":tr');
		controller.handleOutput('ue,"sourcePid":410,"error":null}\n');

		expect(controller.snapshot()).toEqual({
			enabled: true,
			sourcePid: 410,
			error: null,
			hotkey: 'Command+Shift+M',
		});
	});

	it('starts lazily and configures managed and receiver PIDs', async () => {
		const { controller, process } = await createController();

		await controller.configure([
			instance('first', processA, false),
			instance('second', processB, true),
		]);

		expect(JSON.parse(process.writes[0])).toEqual({
			command: 'configure',
			managedPids: [410, 512],
			receiverPids: [512],
			primaryPid: 410,
		});
	});

	it('sends in-app enabled state to the sidecar', async () => {
		const { controller, process } = await createController();
		await controller.configure([
			instance('first', processA, false),
			instance('second', processB, true),
		]);

		await controller.setEnabled(true);

		expect(JSON.parse(process.writes.at(-1)!)).toEqual({
			command: 'set-enabled',
			enabled: true,
		});
	});

	it('disables locally when no receiver remains', async () => {
		const { controller } = await createController();
		await controller.configure([
			instance('first', processA, false),
			instance('second', processB, true),
		]);
		controller.handleOutput('{"type":"status","enabled":true,"sourcePid":410}\n');

		await controller.configure([instance('first', processA, false)]);

		expect(controller.snapshot().enabled).toBe(false);
		expect(controller.snapshot().error).toBe('Select at least one mirror receiver');
	});

	it('accepts global-hotkey status updates from the sidecar', async () => {
		const { controller } = await createController();

		controller.handleOutput('{"type":"status","enabled":true,"sourcePid":512}\n');

		expect(controller.snapshot().enabled).toBe(true);
		expect(controller.snapshot().sourcePid).toBe(512);
	});

	it('disables and reports an unexpected sidecar exit', async () => {
		const { controller, process } = await createController();
		await controller.configure([
			instance('first', processA, false),
			instance('second', processB, true),
		]);
		controller.handleOutput('{"type":"status","enabled":true,"sourcePid":410}\n');

		process.emit('exit', 4);

		expect(controller.snapshot().enabled).toBe(false);
		expect(controller.snapshot().error).toBe('Input mirror exited with code 4');
	});
});
