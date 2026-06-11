import { describe, expect, it, mock } from 'bun:test';
import { InstanceRegistry } from './registry';
import {
	buildLaunchCommand,
	buildTicketLaunchUrl,
	launchAccount,
	launchAccountsSequentially,
} from './launcher';

const first = { userId: 1, username: 'first', displayName: 'First' };
const second = { userId: 2, username: 'second', displayName: 'Second' };
const target = { kind: 'place' as const, placeId: '920587237' };
const processA = {
	pid: 410,
	startedAt: 'Tue Jun  9 10:00:00 2026',
	command: '/Applications/Roblox.app/Contents/MacOS/RobloxPlayer',
};
const processB = {
	pid: 512,
	startedAt: 'Tue Jun  9 10:01:00 2026',
	command: '/Applications/Roblox.app/Contents/MacOS/RobloxPlayer',
};

describe('buildTicketLaunchUrl', () => {
	it('opens the authenticated Roblox app when no experience is selected', () => {
		expect(
			buildTicketLaunchUrl(
				'ticket-a',
				{ kind: 'app' },
				() => 1_780_998_400_000,
				() => 0.5
			)
		).toBe(
			'roblox-player:1+launchmode:app+LaunchExp:InApp+gameinfo:ticket-a+launchtime:1780998400000'
		);
	});

	it('builds a place launcher URL when an experience is selected', () => {
		const result = buildTicketLaunchUrl(
			'ticket-a',
			target,
			() => 1_780_998_400_000,
			() => 0.5
		);

		expect(result).toContain('launchmode:play');
		expect(result).toContain('placeId=920587237');
	});
});

describe('buildLaunchCommand', () => {
	it('delivers ticket URLs to isolated profiles through Launch Services', () => {
		expect(
			buildLaunchCommand(
				'isolated-profile',
				'/profiles/1/Roblox.app',
				'roblox-player:1+launchmode:play'
			)
		).toEqual({
			command: 'open',
			args: [
				'-n',
				'-a',
				'/profiles/1/Roblox.app',
				'roblox-player:1+launchmode:play',
			],
		});
	});

	it('passes ticket URLs through Roblox protocol handling for direct launches', () => {
		expect(
			buildLaunchCommand(
				'direct-binary',
				'/Applications/Roblox.app',
				'roblox-player:1+launchmode:play'
			)
		).toEqual({
			command: '/Applications/Roblox.app/Contents/MacOS/RobloxPlayer',
			args: ['-protocolString', 'roblox-player:1+launchmode:play'],
		});
	});
});

describe('launchAccount', () => {
	it('associates the only newly created Roblox process with the account', async () => {
		const registry = new InstanceRegistry();
		const snapshots = mock().mockResolvedValueOnce([]).mockResolvedValueOnce([processA]);

		const result = await launchAccount(first, target, 'open-new', registry, {
			getCookie: mock().mockResolvedValue('cookie-a'),
			prepareProfile: mock().mockResolvedValue('/profiles/1/Roblox.app'),
			getTicket: mock().mockResolvedValue('ticket-a'),
			snapshot: snapshots,
			open: mock().mockResolvedValue(undefined),
			sleep: mock().mockResolvedValue(undefined),
			robloxPath: '/Applications/Roblox.app',
			now: mock().mockReturnValue(1_780_998_400_000),
			random: mock().mockReturnValue(0.5),
		});

		expect(result.state).toBe('running');
		expect(result.process).toEqual(processA);
	});

	it('fails safely when more than one new process appears', async () => {
		const registry = new InstanceRegistry();
		const snapshots = mock().mockResolvedValueOnce([]).mockResolvedValueOnce([processA, processB]);

		const result = await launchAccount(first, target, 'open-new', registry, {
			getCookie: mock().mockResolvedValue('cookie-a'),
			prepareProfile: mock().mockResolvedValue('/profiles/1/Roblox.app'),
			getTicket: mock().mockResolvedValue('ticket-a'),
			snapshot: snapshots,
			open: mock().mockResolvedValue(undefined),
			sleep: mock().mockResolvedValue(undefined),
			robloxPath: '/Applications/Roblox.app',
			now: mock().mockReturnValue(1_780_998_400_000),
			random: mock().mockReturnValue(0.5),
		});

		expect(result.state).toBe('failed');
		expect(result.error).toBe('Launch created 2 unowned RobloxPlayer processes');
	});

	it('redacts an authentication ticket from a launch transport error', async () => {
		const registry = new InstanceRegistry();
		const result = await launchAccount(first, target, 'open-new', registry, {
			getCookie: mock().mockResolvedValue('cookie-a'),
			prepareProfile: mock().mockResolvedValue('/profiles/1/Roblox.app'),
			getTicket: mock().mockResolvedValue('ticket-secret'),
			snapshot: mock().mockResolvedValue([]),
			open: mock().mockRejectedValue(
				new Error('open failed for roblox-player:1+gameinfo:ticket-secret+launchtime:1')
			),
			sleep: mock().mockResolvedValue(undefined),
			robloxPath: '/Applications/Roblox.app',
			now: mock().mockReturnValue(1_780_998_400_000),
			random: mock().mockReturnValue(0.5),
		});

		expect(result.error).toContain('gameinfo:REDACTED');
		expect(result.error).not.toContain('ticket-secret');
	});

	it('prepares the isolated profile before requesting its short-lived ticket', async () => {
		const events: string[] = [];
		const registry = new InstanceRegistry();

		const result = await launchAccount(first, target, 'isolated-profile', registry, {
			getCookie: async () => {
				events.push('cookie');
				return 'cookie-a';
			},
			prepareProfile: async () => {
				events.push('profile');
				return '/profiles/1/Roblox.app';
			},
			getTicket: async () => {
				events.push('ticket');
				return 'ticket-a';
			},
			snapshot: mock().mockResolvedValueOnce([]).mockResolvedValueOnce([processA]),
			open: async (_method, appPath) => {
				events.push(`open:${appPath}`);
			},
			sleep: mock().mockResolvedValue(undefined),
			robloxPath: '/Applications/Roblox.app',
			now: mock().mockReturnValue(1_780_998_400_000),
			random: mock().mockReturnValue(0.5),
		});

		expect(result.state).toBe('running');
		expect(events).toEqual([
			'cookie',
			'profile',
			'ticket',
			'open:/profiles/1/Roblox.app',
		]);
	});
});

describe('launchAccountsSequentially', () => {
	it('waits for stabilization before launching the next account', async () => {
		const events: string[] = [];
		const launch = async (account: typeof first) => {
			events.push(`launch:${account.userId}`);
			return { account, state: 'running' };
		};
		const stabilize = async () => {
			events.push('stabilize');
		};

		await launchAccountsSequentially([first, second], launch, stabilize);

		expect(events).toEqual(['launch:1', 'stabilize', 'launch:2']);
	});

	it('continues to the second account after the first account fails', async () => {
		const launch = mock()
			.mockResolvedValueOnce({ account: first, state: 'failed' })
			.mockResolvedValueOnce({ account: second, state: 'running' });

		const results = await launchAccountsSequentially([first, second], launch);

		expect(launch.mock.calls.map((call) => call[0].userId)).toEqual([1, 2]);
		expect(results.map((result) => result.state)).toEqual(['failed', 'running']);
	});
});
