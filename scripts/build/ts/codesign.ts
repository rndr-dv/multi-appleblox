export function getAdHocCodeSignArgs(path: string, identifier?: string): string[] {
	const args = ['codesign', '--sign', '-', '--force'];

	if (identifier) {
		args.push('--requirements', `=designated => identifier "${identifier}"`);
	}

	return [...args, path];
}

export function getAdHocBundleSignArgs(path: string, identifier: string): string[] {
	return [
		'codesign',
		'--sign',
		'-',
		'--force',
		'--identifier',
		identifier,
		'--requirements',
		`=designated => identifier "${identifier}"`,
		path,
	];
}

export function getAppCodeSignSteps(appPath: string, identifier: string): string[][] {
	return [
		getAdHocBundleSignArgs(`${appPath}/Contents/MacOS/main`, identifier),
		getAdHocBundleSignArgs(appPath, identifier),
	];
}
