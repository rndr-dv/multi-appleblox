export function getAdHocCodeSignArgs(path: string, identifier?: string): string[] {
	const args = ['codesign', '--sign', '-', '--force'];

	if (identifier) {
		args.push('--requirements', `=designated => identifier "${identifier}"`);
	}

	return [...args, path];
}
