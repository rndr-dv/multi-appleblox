import { app as neuApp } from '@neutralinojs/lib';
import { sleep } from '../utils';

export type AccessibilityPromptWriter = (data: string) => Promise<unknown>;
export type PermissionDelay = (milliseconds: number) => Promise<unknown>;

export async function requestAppAccessibility(
	writeProcessOutput: AccessibilityPromptWriter = neuApp.writeProcessOutput,
	delay: PermissionDelay = sleep
): Promise<void> {
	await writeProcessOutput('askPerm');
	await delay(500);
}
