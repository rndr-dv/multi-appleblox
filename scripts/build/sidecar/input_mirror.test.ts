import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const isMacOS = process.platform === 'darwin';
const tempDir = isMacOS ? mkdtempSync(join(tmpdir(), 'multablox-input-mirror-test-')) : '';
const helperPath = join(tempDir, 'input_mirror_multablox');

beforeAll(() => {
	if (!isMacOS) return;

	const result = Bun.spawnSync([
		'swiftc',
		resolve('scripts/build/sidecar/input_mirror.swift'),
		'-o',
		helperPath,
		'-target',
		'arm64-apple-macos11.0',
		'-framework',
		'ApplicationServices',
		'-framework',
		'CoreGraphics',
		'-framework',
		'AppKit',
	]);
	expect(result.exitCode, result.stderr.toString()).toBe(0);
});

afterAll(() => {
	if (isMacOS) rmSync(tempDir, { recursive: true, force: true });
});

test.skipIf(!isMacOS)('native input mirror passes its deterministic self-test', () => {
	const result = Bun.spawnSync([helperPath, '--self-test']);
	expect(result.exitCode, result.stderr.toString()).toBe(0);
	expect(JSON.parse(result.stdout.toString())).toEqual({
		ok: true,
		coordinateTransform: true,
		protocolParsing: true,
		syntheticTagging: true,
		mouseEventReconstruction: true,
	});
});
