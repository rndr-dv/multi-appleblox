import { join } from 'path-browserify';
import { getMode } from './utils';

type OS = 'darwin' | 'linux' | 'windows';
type LibPathsType = {
	[key: string]: Partial<{
		[key in OS]: {
			prod: string;
			dev: string;
		};
	}>;
};

const LibPaths: LibPathsType = {
	notifications: {
		darwin: {
			prod: '/lib/alerter_multablox',
			dev: '/bin/alerter_multablox',
		},
	},
	discordrpc: {
		darwin: {
			prod: '/lib/discordrpc_multablox',
			dev: '/bin/discordrpc_multablox',
		},
	},
	urlscheme: {
		darwin: {
			prod: '/lib/urlscheme_multablox',
			dev: '/bin/urlscheme_multablox',
		},
	},
	transparent_viewer: {
		darwin: {
			prod: '/lib/transparent_viewer_multablox',
			dev: '/bin/transparent_viewer_multablox',
		},
	},
	roblox_updates_manager: {
		darwin: {
			prod: '/lib/roblox_updater_manager_multablox.sh',
			dev: '/bin/roblox_updater_manager_multablox.sh',
		},
	},
	keychain: {
		darwin: {
			prod: '/lib/keychain_multablox',
			dev: '/bin/keychain_multablox',
		},
	},
	roblox_login: {
		darwin: {
			prod: '/lib/roblox_login_multablox',
			dev: '/bin/roblox_login_multablox',
		},
	},
	virtualdisplay: {
		darwin: {
			prod: '/lib/virtualdisplay_multablox',
			dev: '/bin/virtualdisplay_multablox',
		},
	},
	instance_probe: {
		darwin: {
			prod: '/lib/instance_probe_multablox',
			dev: '/bin/instance_probe_multablox',
		},
	},
	input_mirror: {
		darwin: {
			prod: '/lib/input_mirror_multablox',
			dev: '/bin/input_mirror_multablox',
		},
	},
};

export function libraryPath<T extends keyof LibPathsType>(libName: T): string {
	if (!(libName in LibPaths)) throw Error(`Library "${libName}" doesn't exist.`);
	const os = window.NL_OS.toLowerCase() as OS;
	if (!(os in LibPaths[libName])) throw Error(`Library "${libName}" doesn't support OS "${os}".`);

	const mode = getMode();

	const pathsForOs = LibPaths[libName][os];
	if (!pathsForOs) throw Error(`Library "${libName}" has no paths defined for OS "${os}".`);

	const path = pathsForOs[mode];
	if (!path) throw Error(`Library "${libName}" has no path defined for mode "${mode}" on OS "${os}".`);

	return join(window.NL_PATH, path);
}

export default LibPaths;
