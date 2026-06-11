import { filesystem } from '@neutralinojs/lib';
import path from 'path-browserify';
import { getDataDir } from '../utils/paths';

export type Observation = 'pending' | 'pass' | 'fail' | 'unsupported';

export interface InputEvidence {
	keyboard: Observation;
	click: Observation;
	move: Observation;
	scroll: Observation;
}

export interface InstanceEvidence {
	accountUserId: number;
	expectedUsername: string;
	pid: number | null;
	processStartedAt: string | null;
	windowId: number | null;
	launchMethod: string;
	launchState: string;
	input: InputEvidence;
	error: string | null;
}

export interface FeasibilityEvidence {
	schemaVersion: 1;
	createdAt: string;
	macOSVersion: string;
	robloxPath: string;
	placeId: string;
	instances: InstanceEvidence[];
}

export function redactEvidenceText(value: string): string {
	return value
		.replace(/gameinfo:[^+\s'"]+/gi, 'gameinfo:REDACTED')
		.replace(/(\.ROBLOSECURITY[=:]\s*)[^;\s'"]+/gi, '$1REDACTED')
		.replace(/(x-csrf-token[=:]\s*)[^\s,'"]+/gi, '$1REDACTED')
		.replace(/(privateServerLinkCode=)[^&\s"]+/gi, '$1REDACTED');
}

export function sanitizeDestination(value: string): string {
	try {
		const url = new URL(value);
		if (url.searchParams.has('privateServerLinkCode')) {
			url.searchParams.set('privateServerLinkCode', 'REDACTED');
		}
		return url.toString();
	} catch {
		return redactEvidenceText(value);
	}
}

export async function saveFeasibilityEvidence(report: FeasibilityEvidence): Promise<string> {
	const directory = path.join(await getDataDir(), 'feasibility');
	const filePath = path.join(directory, 'phase-0-latest.json');
	try {
		await filesystem.createDirectory(directory);
	} catch {}
	const serialized = redactEvidenceText(JSON.stringify(report, null, '\t'));
	await filesystem.writeFile(filePath, serialized);
	return filePath;
}
