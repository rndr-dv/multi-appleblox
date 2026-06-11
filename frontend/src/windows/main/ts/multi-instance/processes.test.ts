import { describe, expect, it } from 'bun:test';
import {
	diffNewRobloxProcesses,
	findLiveProcess,
	parseProcessSnapshot,
	sameProcessIdentity,
} from './processes';

const FIRST =
	' 410 Tue Jun  9 10:00:00 2026 /Applications/Roblox.app/Contents/MacOS/RobloxPlayer';
const SECOND =
	' 512 Tue Jun  9 10:01:00 2026 /Applications/Roblox.app/Contents/MacOS/RobloxPlayer';
const OTHER = ' 600 Tue Jun  9 10:02:00 2026 /Applications/Discord.app/Contents/MacOS/Discord';

describe('parseProcessSnapshot', () => {
	it('keeps only exact RobloxPlayer executable paths', () => {
		const processes = parseProcessSnapshot([FIRST, OTHER].join('\n'));
		expect(processes).toEqual([
			{
				pid: 410,
				startedAt: 'Tue Jun  9 10:00:00 2026',
				command: '/Applications/Roblox.app/Contents/MacOS/RobloxPlayer',
			},
		]);
	});
});

describe('diffNewRobloxProcesses', () => {
	it('returns only the process created after launch', () => {
		const before = parseProcessSnapshot(FIRST);
		const after = parseProcessSnapshot([FIRST, SECOND].join('\n'));
		expect(diffNewRobloxProcesses(before, after).map((process) => process.pid)).toEqual([512]);
	});

	it('treats a reused PID with a different start time as a different process', () => {
		const before = parseProcessSnapshot(FIRST);
		const after = parseProcessSnapshot(
			' 410 Tue Jun  9 11:00:00 2026 /Applications/Roblox.app/Contents/MacOS/RobloxPlayer'
		);
		expect(diffNewRobloxProcesses(before, after)).toHaveLength(1);
		expect(sameProcessIdentity(before[0], after[0])).toBe(false);
	});
});

describe('findLiveProcess', () => {
	it('requires PID, start time, and command to match', () => {
		const identity = parseProcessSnapshot(FIRST)[0];

		expect(findLiveProcess(identity, [identity])).toEqual(identity);
		expect(findLiveProcess(identity, [{ ...identity, command: `${identity.command} --other` }])).toBeNull();
		expect(findLiveProcess(identity, [{ ...identity, startedAt: 'Tue Jun  9 11:00:00 2026' }])).toBeNull();
	});
});
