export type LoginStatus =
	| 'LOGIN_SUCCESS'
	| 'LOGIN_CANCELLED'
	| 'LOGIN_TIMEOUT'
	| 'LOGIN_ERROR';

const LOGIN_STATUSES = new Set<LoginStatus>([
	'LOGIN_SUCCESS',
	'LOGIN_CANCELLED',
	'LOGIN_TIMEOUT',
	'LOGIN_ERROR',
]);

export function parseLoginStatus(output: string): LoginStatus | null {
	const lines = output.trim().split(/\r?\n/);
	for (let index = lines.length - 1; index >= 0; index--) {
		const line = lines[index].trim() as LoginStatus;
		if (LOGIN_STATUSES.has(line)) return line;
	}
	return null;
}
