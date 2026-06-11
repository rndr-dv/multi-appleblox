import { describe, expect, it, mock } from 'bun:test';
import { requestAuthenticationTicket } from './account-auth';

describe('requestAuthenticationTicket', () => {
	it('uses the supplied account cookie for both CSRF and ticket requests', async () => {
		const request = mock()
			.mockResolvedValueOnce({
				success: false,
				statusCode: 403,
				headers: { 'x-csrf-token': 'csrf-token' },
				body: '',
			})
			.mockResolvedValueOnce({
				success: true,
				statusCode: 200,
				headers: { 'rbx-authentication-ticket': 'auth-ticket' },
				body: '',
			});

		const ticket = await requestAuthenticationTicket('account-cookie', request);

		expect(ticket).toBe('auth-ticket');
		expect(request).toHaveBeenNthCalledWith(
			1,
			'https://auth.roblox.com/v2/logout',
			expect.objectContaining({ cookies: { '.ROBLOSECURITY': 'account-cookie' } })
		);
		expect(request).toHaveBeenNthCalledWith(
			2,
			'https://auth.roblox.com/v1/authentication-ticket',
			expect.objectContaining({
				headers: expect.objectContaining({ 'x-csrf-token': 'csrf-token' }),
				cookies: { '.ROBLOSECURITY': 'account-cookie' },
			})
		);
	});

	it('rejects an expired account without including the cookie in the error', async () => {
		const request = mock().mockResolvedValue({
			success: false,
			statusCode: 401,
			headers: {},
			body: '',
		});

		try {
			await requestAuthenticationTicket('secret-cookie-value', request);
			throw new Error('Expected authentication to fail');
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			expect(message).toBe('Roblox session is expired or invalid');
			expect(message).not.toContain('secret-cookie-value');
		}
	});
});
