import { shell, type ExecutionResult } from '../tools/shell';

export interface RobloxProcessIdentity {
	pid: number;
	startedAt: string;
	command: string;
}

export type ProcessCommandRunner = (
	command: string,
	args: (string | number)[],
	options: { skipStderrCheck: true }
) => Promise<ExecutionResult>;

export function parseProcessSnapshot(output: string): RobloxProcessIdentity[] {
	return output
		.split('\n')
		.map((line) => line.match(/^\s*(\d+)\s+(.{24})\s+(.+)$/))
		.filter((match): match is RegExpMatchArray => match !== null)
		.map((match) => ({
			pid: Number.parseInt(match[1], 10),
			startedAt: match[2],
			command: match[3].trim(),
		}))
		.filter((process) => /\/Roblox\.app\/Contents\/MacOS\/RobloxPlayer(?:\s|$)/.test(process.command));
}

export function sameProcessIdentity(left: RobloxProcessIdentity, right: RobloxProcessIdentity): boolean {
	return left.pid === right.pid && left.startedAt === right.startedAt && left.command === right.command;
}

export function diffNewRobloxProcesses(
	before: RobloxProcessIdentity[],
	after: RobloxProcessIdentity[]
): RobloxProcessIdentity[] {
	return after.filter((candidate) => !before.some((existing) => sameProcessIdentity(existing, candidate)));
}

export function findLiveProcess(
	identity: RobloxProcessIdentity,
	processes: RobloxProcessIdentity[]
): RobloxProcessIdentity | null {
	return processes.find((candidate) => sameProcessIdentity(identity, candidate)) ?? null;
}

export async function snapshotRobloxProcesses(
	run: ProcessCommandRunner = shell
): Promise<RobloxProcessIdentity[]> {
	const result = await run('ps', ['-axo', 'pid=,lstart=,command='], { skipStderrCheck: true });
	return parseProcessSnapshot(result.stdOut);
}
