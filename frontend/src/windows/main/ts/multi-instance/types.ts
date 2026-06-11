import type { RobloxProcessIdentity } from './processes';

export type LaunchMethod = 'isolated-profile' | 'open-new' | 'direct-binary';

export interface InstanceAccount {
	userId: number;
	username: string;
	displayName: string;
	avatarUrl?: string | null;
}

export interface PlaceLaunchTarget {
	kind: 'place';
	placeId: string;
}

export interface AppLaunchTarget {
	kind: 'app';
}

export type LaunchTarget = AppLaunchTarget | PlaceLaunchTarget;

export type InstanceState =
	| 'launching'
	| 'running'
	| 'closing'
	| 'exited'
	| 'crashed'
	| 'failed';

export interface ManagedInstance {
	id: string;
	account: InstanceAccount;
	target: LaunchTarget;
	method: LaunchMethod;
	process: RobloxProcessIdentity | null;
	window: {
		windowId: number;
		x: number;
		y: number;
		width: number;
		height: number;
	} | null;
	state: InstanceState;
	mirrorReceiver: boolean;
	error: string | null;
}
