import { describe, expect, it } from 'bun:test';
import { parseLoginStatus } from './login-status';

describe('parseLoginStatus', () => {
	it('extracts a successful terminal status after diagnostic output', () => {
		const output = [
			'LOGIN_DEBUG: Started loading URL',
			'LOGIN_DEBUG: Page committed, rendering content',
			'LOGIN_DEBUG: Page finished loading',
			'LOGIN_SUCCESS',
		].join('\n');

		expect(parseLoginStatus(output)).toBe('LOGIN_SUCCESS');
	});
});
