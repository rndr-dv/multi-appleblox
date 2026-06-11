import path from 'path-browserify';
import type { InstanceAccount } from './types';

const ROBLOX_PROFILE_BUNDLE_PREFIX = 'com.lucas.multablox.roblox-profile';

export interface ProfileManagerDependencies {
	dataDir: string;
	exists(path: string): Promise<boolean>;
	readBundleVersion(appPath: string): Promise<string>;
	run(command: string, args: string[]): Promise<void>;
	tempSuffix(): string;
}

export function accountProfileBundleId(userId: number): string {
	return `${ROBLOX_PROFILE_BUNDLE_PREFIX}.u${userId}`;
}

export function accountProfilePath(dataDir: string, userId: number): string {
	return path.join(dataDir, 'roblox-profiles', String(userId), 'Roblox.app');
}

export async function createDefaultProfileManagerDependencies(): Promise<ProfileManagerDependencies> {
	const [{ shell }, { getDataDir }] = await Promise.all([
		import('../tools/shell'),
		import('../utils/paths'),
	]);

	return {
		dataDir: await getDataDir(),
		exists: async (targetPath) => {
			try {
				const result = await shell('test', ['-e', targetPath], { skipStderrCheck: true });
				return result.exitCode === 0;
			} catch {
				return false;
			}
		},
		readBundleVersion: async (appPath) => {
			const result = await shell(
				'/usr/libexec/PlistBuddy',
				['-c', 'Print :CFBundleVersion', path.join(appPath, 'Contents/Info.plist')],
				{ skipStderrCheck: true }
			);
			return result.stdOut.trim();
		},
		run: async (command, args) => {
			const result = await shell(command, args, { skipStderrCheck: true });
			if (result.exitCode !== 0) {
				throw new Error(`${command} failed with exit code ${result.exitCode}`);
			}
		},
		tempSuffix: () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
	};
}

export async function ensureAccountProfile(
	account: InstanceAccount,
	sourcePath: string,
	dependencies: ProfileManagerDependencies
): Promise<string> {
	const profilePath = accountProfilePath(dependencies.dataDir, account.userId);
	const sourceVersion = await dependencies.readBundleVersion(sourcePath);
	const profileExists = await dependencies.exists(profilePath);

	if (
		profileExists &&
		(await dependencies.readBundleVersion(profilePath)) === sourceVersion
	) {
		return profilePath;
	}

	const profileParent = path.dirname(profilePath);
	const stagingPath = `${profilePath}.staging-${dependencies.tempSuffix()}`;
	const infoPlist = path.join(stagingPath, 'Contents/Info.plist');

	await dependencies.run('mkdir', ['-p', profileParent]);
	await dependencies.run('rm', ['-rf', stagingPath]);

	try {
		try {
			await dependencies.run('cp', ['-cR', sourcePath, stagingPath]);
		} catch {
			await dependencies.run('ditto', [sourcePath, stagingPath]);
		}

		await dependencies.run('/usr/libexec/PlistBuddy', [
			'-c',
			'Set :LSMultipleInstancesProhibited false',
			infoPlist,
		]);
		await dependencies.run('/usr/libexec/PlistBuddy', [
			'-c',
			`Set :CFBundleIdentifier ${accountProfileBundleId(account.userId)}`,
			infoPlist,
		]);
		await dependencies.run('/usr/libexec/PlistBuddy', [
			'-c',
			`Set :CFBundleName Roblox - ${account.displayName}`,
			infoPlist,
		]);
		await dependencies.run('codesign', ['--force', '--deep', '--sign', '-', stagingPath]);
		await dependencies.run('codesign', ['--verify', '--deep', '--strict', stagingPath]);

		if (profileExists) {
			await dependencies.run('rm', ['-rf', profilePath]);
		}
		await dependencies.run('mv', [stagingPath, profilePath]);
		return profilePath;
	} catch (error) {
		await dependencies.run('rm', ['-rf', stagingPath]).catch(() => {});
		throw error;
	}
}
