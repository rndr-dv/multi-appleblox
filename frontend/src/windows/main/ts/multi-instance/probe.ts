import { shell, type ExecutionResult } from '../tools/shell';

export interface ProbeWindow {
	windowId: number;
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface ProbeFrame {
	x: number;
	y: number;
	width: number;
	height: number;
}

interface ProbeResponse {
	ok: boolean;
	command: string;
	error?: string | null;
	window?: ProbeWindow | null;
	display?: ProbeFrame | null;
}

export type ProbeRunner = (
	command: string,
	args: (string | number)[],
	options: { skipStderrCheck: true }
) => Promise<ExecutionResult>;

export class InstanceProbe {
	constructor(
		private readonly binaryPath: string,
		private readonly run: ProbeRunner = shell
	) {}

	async requestAccessibility(): Promise<void> {
		await this.execute(['request-accessibility']);
	}

	async window(pid: number): Promise<ProbeWindow> {
		const response = await this.execute(['window', '--pid', String(pid)]);
		if (!response.window) throw new Error('Instance probe returned no window');
		return response.window;
	}

	async display(pid: number): Promise<ProbeFrame> {
		const response = await this.execute(['display', '--pid', String(pid)]);
		if (!response.display) throw new Error('Instance probe returned no display');
		return response.display;
	}

	async setFrame(pid: number, frame: ProbeFrame): Promise<void> {
		await this.execute([
			'set-frame',
			'--pid',
			String(pid),
			'--x',
			String(frame.x),
			'--y',
			String(frame.y),
			'--width',
			String(frame.width),
			'--height',
			String(frame.height),
		]);
	}

	async focus(pid: number): Promise<void> {
		await this.execute(['focus', '--pid', String(pid)]);
	}

	async key(pid: number, keyCode: number): Promise<void> {
		await this.execute(['key', '--pid', String(pid), '--keycode', String(keyCode)]);
	}

	async clickCenter(pid: number): Promise<void> {
		await this.execute(['click-center', '--pid', String(pid)]);
	}

	async moveCenter(pid: number): Promise<void> {
		await this.execute(['move-center', '--pid', String(pid)]);
	}

	async scroll(pid: number, delta: number): Promise<void> {
		await this.execute(['scroll', '--pid', String(pid), '--delta', String(delta)]);
	}

	private async execute(args: string[]): Promise<ProbeResponse> {
		const result = await this.run(this.binaryPath, args, { skipStderrCheck: true });
		let response: ProbeResponse;
		try {
			response = JSON.parse(result.stdOut.trim()) as ProbeResponse;
		} catch {
			throw new Error('Instance probe returned malformed JSON');
		}
		if (!response.ok) throw new Error(response.error || `Instance probe ${response.command} failed`);
		return response;
	}
}
