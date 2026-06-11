import { resolve as path } from 'node:path';
import type { Config } from './scripts/build/ts/config-types';
import ProductConfig from './product.config';

const BuildConfig: Config = {
	devPort: 5174,
	projectPath: path('./frontend/dist'),
	outDir: path('./dist'),
	appName: ProductConfig.name,
	description: 'A multi-account macOS Roblox launcher',
	appBundleName: ProductConfig.name,
	copyright: 'Copyright © 2024-2026 OrigamingWasTaken. Licensed under GPL-3.0.',
	mac: {
		architecture: ['universal', 'arm64', 'x64'],
		appIcon: path('./scripts/build/assets/mac.icns'),
		minimumOS: '10.13.0',
	},
	// May sometimes test some things
	// win: {
	//     architecture: ["x64"],
	//     appIcon: path("./frontend/src/assets/favicon.png"),
	//     embedResources: false
	// }
};

export default BuildConfig;
