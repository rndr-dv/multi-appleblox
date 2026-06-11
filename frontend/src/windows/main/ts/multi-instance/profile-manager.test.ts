import { describe, expect, it, mock } from 'bun:test';
import {
	accountProfileBundleId,
	accountProfilePath,
	ensureAccountProfile,
	type ProfileManagerDependencies,
} from './profile-manager';

const account = { userId: 3793615581, username: 'XD_RR222', displayName: 'c_3' };
const dataDir = '/Users/test/Library/Application Support/MultaBlox';
const sourcePath = '/Applications/Roblox.app';
const profilePath = `${dataDir}/roblox-profiles/3793615581/Roblox.app`;

function dependencies(
	overrides: Partial<ProfileManagerDependencies> = {}
): ProfileManagerDependencies {
	return {
		dataDir,
		exists: mock().mockResolvedValue(true),
		readBundleVersion: mock().mockResolvedValue('7251138'),
		run: mock().mockResolvedValue(undefined),
		tempSuffix: () => 'test',
		...overrides,
	};
}

describe('accountProfileBundleId', () => {
	it('creates a deterministic bundle identifier from the Roblox user ID', () => {
		expect(accountProfileBundleId(10107317232)).toBe(
			'com.lucas.multablox.roblox-profile.u10107317232'
		);
	});
});

describe('accountProfilePath', () => {
	it('stores each account profile under the MultaBlox data directory', () => {
		expect(accountProfilePath('/Users/test/Library/Application Support/MultaBlox', 3793615581)).toBe(
			'/Users/test/Library/Application Support/MultaBlox/roblox-profiles/3793615581/Roblox.app'
		);
	});
});

describe('ensureAccountProfile', () => {
	it('reuses an existing profile when its Roblox version matches the installed app', async () => {
		const deps = dependencies();

		const result = await ensureAccountProfile(account, sourcePath, deps);

		expect(result).toBe(profilePath);
		expect(deps.run).not.toHaveBeenCalled();
	});

	it('rebuilds a missing profile through a signed staging bundle', async () => {
		const deps = dependencies({
			exists: mock().mockResolvedValue(false),
		});

		await ensureAccountProfile(account, sourcePath, deps);

		const stagingPath = `${profilePath}.staging-test`;
		expect(deps.run).toHaveBeenCalledWith('cp', ['-cR', sourcePath, stagingPath]);
		expect(deps.run).toHaveBeenCalledWith('/usr/libexec/PlistBuddy', [
			'-c',
			'Set :LSMultipleInstancesProhibited false',
			`${stagingPath}/Contents/Info.plist`,
		]);
		expect(deps.run).toHaveBeenCalledWith('/usr/libexec/PlistBuddy', [
			'-c',
			`Set :CFBundleIdentifier ${accountProfileBundleId(account.userId)}`,
			`${stagingPath}/Contents/Info.plist`,
		]);
		expect(deps.run).toHaveBeenCalledWith('codesign', [
			'--force',
			'--deep',
			'--sign',
			'-',
			stagingPath,
		]);
		expect(deps.run).toHaveBeenCalledWith('mv', [stagingPath, profilePath]);
	});

	it('rebuilds an existing profile when the installed Roblox version changes', async () => {
		const readBundleVersion = mock()
			.mockResolvedValueOnce('7251139')
			.mockResolvedValueOnce('7251138');
		const deps = dependencies({ readBundleVersion });

		await ensureAccountProfile(account, sourcePath, deps);

		expect(deps.run).toHaveBeenCalledWith('rm', ['-rf', profilePath]);
	});

	it('falls back to ditto when APFS clone-copy is unavailable', async () => {
		const run = mock(async (command: string) => {
			if (command === 'cp') throw new Error('clone unavailable');
		});
		const deps = dependencies({
			exists: mock().mockResolvedValue(false),
			run,
		});

		await ensureAccountProfile(account, sourcePath, deps);

		expect(run).toHaveBeenCalledWith('ditto', [
			sourcePath,
			`${profilePath}.staging-test`,
		]);
	});
});
