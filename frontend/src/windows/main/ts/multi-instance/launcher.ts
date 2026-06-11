import path from 'path-browserify';
import { spawn } from '../tools/shell';
import { sleep } from '../utils';
import { requestAuthenticationTicket } from './account-auth';
import { diffNewRobloxProcesses, snapshotRobloxProcesses, type RobloxProcessIdentity } from './processes';
import {
	createDefaultProfileManagerDependencies,
	ensureAccountProfile,
} from './profile-manager';
import { InstanceRegistry } from './registry';
import type {
	InstanceAccount,
	LaunchMethod,
	LaunchTarget,
	ManagedInstance,
} from './types';

export interface LaunchDependencies {
	getCookie(userId: number): Promise<string | null>;
	prepareProfile(account: InstanceAccount): Promise<string>;
	getTicket(cookie: string): Promise<string>;
	snapshot(): Promise<RobloxProcessIdentity[]>;
	open(method: LaunchMethod, robloxPath: string, launchUrl: string): Promise<void>;
	sleep(milliseconds: number): Promise<void>;
	robloxPath: string;
	now(): number;
	random(): number;
}

export function buildTicketLaunchUrl(
	ticket: string,
	target: LaunchTarget,
	now: () => number = Date.now,
	random: () => number = Math.random
): string {
	if (target.kind === 'app') {
		return [
			'roblox-player:1',
			'launchmode:app',
			'LaunchExp:InApp',
			`gameinfo:${ticket}`,
			`launchtime:${now()}`,
		].join('+');
	}

	const browserTrackerId = Math.floor(random() * 1_000_000_000);
	const launcherUrl = new URL('https://assetgame.roblox.com/game/PlaceLauncher.ashx');
	launcherUrl.searchParams.set('request', 'RequestGame');
	launcherUrl.searchParams.set('browserTrackerId', String(browserTrackerId));
	launcherUrl.searchParams.set('placeId', target.placeId);
	launcherUrl.searchParams.set('isPlayTogetherGame', 'false');
	return [
		'roblox-player:1',
		'launchmode:play',
		`gameinfo:${ticket}`,
		`launchtime:${now()}`,
		`placelauncherurl:${launcherUrl.toString()}`,
	].join('+');
}

export function buildLaunchCommand(
	method: LaunchMethod,
	robloxPath: string,
	launchUrl: string
): { command: string; args: string[] } {
	if (method === 'isolated-profile') {
		return { command: 'open', args: ['-n', '-a', robloxPath, launchUrl] };
	}
	if (method === 'open-new') {
		return { command: 'open', args: ['-n', '-a', robloxPath, launchUrl] };
	}
	return {
		command: path.join(robloxPath, 'Contents/MacOS/RobloxPlayer'),
		args: ['-protocolString', launchUrl],
	};
}

async function defaultOpen(method: LaunchMethod, robloxPath: string, launchUrl: string): Promise<void> {
	const launchCommand = buildLaunchCommand(method, robloxPath, launchUrl);
	await spawn(launchCommand.command, launchCommand.args);
}

export function defaultLaunchDependencies(robloxPath: string): LaunchDependencies {
	const profileDependencies = createDefaultProfileManagerDependencies();
	return {
		getCookie: async (userId) => {
			const { getAccountCredential } = await import('../roblox/accounts');
			return getAccountCredential(userId);
		},
		prepareProfile: async (account) =>
			ensureAccountProfile(account, robloxPath, await profileDependencies),
		getTicket: requestAuthenticationTicket,
		snapshot: snapshotRobloxProcesses,
		open: defaultOpen,
		sleep: async (milliseconds) => {
			await sleep(milliseconds);
		},
		robloxPath,
		now: Date.now,
		random: Math.random,
	};
}

function safeLaunchError(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	return message.replace(/gameinfo:[^+\s'"]+/gi, 'gameinfo:REDACTED');
}

export async function launchAccount(
	account: InstanceAccount,
	target: LaunchTarget,
	method: LaunchMethod,
	registry: InstanceRegistry,
	dependencies: LaunchDependencies
): Promise<ManagedInstance> {
	const instance = registry.begin(account, target, method);
	try {
		const cookie = await dependencies.getCookie(account.userId);
		if (!cookie) throw new Error('No saved Roblox session for this account');
		const launchPath =
			method === 'isolated-profile'
				? await dependencies.prepareProfile(account)
				: dependencies.robloxPath;
		const ticket = await dependencies.getTicket(cookie);
		const before = await dependencies.snapshot();
		const launchUrl = buildTicketLaunchUrl(ticket, target, dependencies.now, dependencies.random);
		await dependencies.open(method, launchPath, launchUrl);

		for (let attempt = 0; attempt < 20; attempt++) {
			await dependencies.sleep(250);
			const created = diffNewRobloxProcesses(before, await dependencies.snapshot());
			if (created.length === 1) {
				registry.markRunning(instance.id, created[0]);
				return registry.get(instance.id)!;
			}
			if (created.length > 1) {
				throw new Error(`Launch created ${created.length} unowned RobloxPlayer processes`);
			}
		}
		throw new Error('No new RobloxPlayer process appeared within 5 seconds');
	} catch (error) {
		registry.markFailed(instance.id, safeLaunchError(error));
		return registry.get(instance.id)!;
	}
}

export async function launchAccountsSequentially<T>(
	accounts: InstanceAccount[],
	launch: (account: InstanceAccount) => Promise<T>,
	stabilize: (result: T) => Promise<void> = async () => {}
): Promise<T[]> {
	const results: T[] = [];
	for (let index = 0; index < accounts.length; index++) {
		const result = await launch(accounts[index]);
		results.push(result);
		if (index < accounts.length - 1) await stabilize(result);
	}
	return results;
}
