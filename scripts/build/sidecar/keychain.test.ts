import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const isMacOS = process.platform === 'darwin';
const tempDir = isMacOS ? mkdtempSync(join(tmpdir(), 'multablox-keychain-test-')) : '';
const helperPath = join(tempDir, 'keychain_multablox');
const service = `com.lucas.multablox.test.${process.pid}.${Date.now()}`;
const account = 'credential-update';

function run(command: string[], stdin?: string): Bun.SpawnSyncReturns<Buffer, Buffer> {
	return Bun.spawnSync(command, {
		stdin: stdin ? Buffer.from(stdin) : undefined,
		stdout: 'pipe',
		stderr: 'pipe',
	});
}

function getCreationDate(): string {
	const result = run([
		'security',
		'dump-keychain',
		'-a',
		join(process.env.HOME!, 'Library/Keychains/login.keychain-db'),
	]);
	expect(result.exitCode).toBe(0);

	const item = result.stdout
		.toString()
		.split('keychain:')
		.find((entry) => entry.includes(`"${service}"`) && entry.includes(`"${account}"`));
	expect(item).toBeDefined();

	const creationDate = item!.match(/"cdat"<timedate>=.*?"(\d{14}Z)/)?.[1];
	expect(creationDate).toBeDefined();
	return creationDate!;
}

beforeAll(() => {
	if (!isMacOS) return;

	const sourcePath = resolve('scripts/build/sidecar/keychain.m');
	const infoPlistPath = resolve('scripts/build/sidecar/keychain_info.plist');
	const compile = run([
		'gcc',
		'-Wno-deprecated-declarations',
		'-framework',
		'Security',
		'-framework',
		'Foundation',
		'-framework',
		'AppKit',
		'-sectcreate',
		'__TEXT',
		'__info_plist',
		infoPlistPath,
		sourcePath,
		'-o',
		helperPath,
	]);
	expect(compile.exitCode, compile.stderr.toString()).toBe(0);
	expect(run(['codesign', '--sign', '-', '--force', helperPath]).exitCode).toBe(0);
});

afterAll(() => {
	if (!isMacOS) return;
	run([helperPath, 'delete', service, account]);
	rmSync(tempDir, { recursive: true, force: true });
});

test.skipIf(!isMacOS)(
	'updating a credential preserves its Keychain item',
	async () => {
		expect(run([helperPath, 'store', service, account], 'first').exitCode).toBe(0);
		const originalCreationDate = getCreationDate();

		await Bun.sleep(1100);

		expect(run([helperPath, 'store', service, account], 'second').exitCode).toBe(0);
		expect(getCreationDate()).toBe(originalCreationDate);
	},
	20000
);
