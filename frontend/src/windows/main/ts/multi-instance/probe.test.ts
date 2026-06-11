import { describe, expect, it, mock } from 'bun:test';
import { InstanceProbe } from './probe';

describe('InstanceProbe', () => {
	it('requests Accessibility through the native helper', async () => {
		const run = mock().mockResolvedValue({
			exitCode: 0,
			stdErr: '',
			stdOut: JSON.stringify({ ok: true, command: 'request-accessibility' }),
		});
		const probe = new InstanceProbe('/probe', run);

		await probe.requestAccessibility();

		expect(run).toHaveBeenCalledWith('/probe', ['request-accessibility'], {
			skipStderrCheck: true,
		});
	});

	it('parses window bounds from the native JSON response', async () => {
		const run = mock().mockResolvedValue({
			exitCode: 0,
			stdErr: '',
			stdOut: JSON.stringify({
				ok: true,
				command: 'window',
				error: null,
				window: { windowId: 9, x: 10, y: 20, width: 800, height: 600 },
			}),
		});
		const probe = new InstanceProbe('/probe', run);
		expect(await probe.window(410)).toEqual({ windowId: 9, x: 10, y: 20, width: 800, height: 600 });
		expect(run).toHaveBeenCalledWith('/probe', ['window', '--pid', '410'], { skipStderrCheck: true });
	});

	it('throws the native error for failed delivery', async () => {
		const run = mock().mockResolvedValue({
			exitCode: 3,
			stdErr: '',
			stdOut: JSON.stringify({
				ok: false,
				command: 'key',
				error: 'Accessibility permission is not granted',
			}),
		});
		const probe = new InstanceProbe('/probe', run);
		await expect(probe.key(410, 49)).rejects.toThrow('Accessibility permission is not granted');
	});

	it('rejects malformed native output', async () => {
		const run = mock().mockResolvedValue({
			exitCode: 0,
			stdErr: '',
			stdOut: 'not-json',
		});
		const probe = new InstanceProbe('/probe', run);
		await expect(probe.window(410)).rejects.toThrow('Instance probe returned malformed JSON');
	});

	it('parses the visible display frame for a managed process', async () => {
		const run = mock().mockResolvedValue({
			exitCode: 0,
			stdErr: '',
			stdOut: JSON.stringify({
				ok: true,
				command: 'display',
				display: { x: 0, y: 25, width: 1440, height: 875 },
			}),
		});
		const probe = new InstanceProbe('/probe', run);

		expect(await probe.display(410)).toEqual({ x: 0, y: 25, width: 1440, height: 875 });
		expect(run).toHaveBeenCalledWith('/probe', ['display', '--pid', '410'], { skipStderrCheck: true });
	});

	it('sets a window frame through the native helper', async () => {
		const run = mock().mockResolvedValue({
			exitCode: 0,
			stdErr: '',
			stdOut: JSON.stringify({ ok: true, command: 'set-frame' }),
		});
		const probe = new InstanceProbe('/probe', run);

		await probe.setFrame(410, { x: 8, y: 8, width: 488, height: 784 });

		expect(run).toHaveBeenCalledWith(
			'/probe',
			[
				'set-frame',
				'--pid',
				'410',
				'--x',
				'8',
				'--y',
				'8',
				'--width',
				'488',
				'--height',
				'784',
			],
			{ skipStderrCheck: true }
		);
	});

	it('focuses a managed process through the native helper', async () => {
		const run = mock().mockResolvedValue({
			exitCode: 0,
			stdErr: '',
			stdOut: JSON.stringify({ ok: true, command: 'focus' }),
		});
		const probe = new InstanceProbe('/probe', run);

		await probe.focus(410);

		expect(run).toHaveBeenCalledWith('/probe', ['focus', '--pid', '410'], { skipStderrCheck: true });
	});
});
