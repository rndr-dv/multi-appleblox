import { secureRequest, type SecureRequestOptions, type SecureResponse } from '../tools/secure-http';

export type SecureRequester = (url: string, options?: SecureRequestOptions) => Promise<SecureResponse>;

export async function requestAuthenticationTicket(
	cookie: string,
	request: SecureRequester = secureRequest
): Promise<string> {
	const cookies = { '.ROBLOSECURITY': cookie };
	const csrfResponse = await request('https://auth.roblox.com/v2/logout', {
		method: 'POST',
		headers: { 'User-Agent': 'MultaBlox/0.1' },
		cookies,
		timeout: 30,
	});

	if (csrfResponse.statusCode === 401) {
		throw new Error('Roblox session is expired or invalid');
	}

	const csrfToken = csrfResponse.headers['x-csrf-token'];
	if (!csrfToken) {
		throw new Error('Roblox did not return a CSRF token');
	}

	const ticketResponse = await request('https://auth.roblox.com/v1/authentication-ticket', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'User-Agent': 'MultaBlox/0.1',
			Referer: 'https://www.roblox.com/',
			'x-csrf-token': csrfToken,
		},
		cookies,
		timeout: 30,
	});

	if (ticketResponse.statusCode === 401 || ticketResponse.statusCode === 403) {
		throw new Error('Roblox session is expired or invalid');
	}

	const ticket = ticketResponse.headers['rbx-authentication-ticket'];
	if (!ticket) {
		throw new Error(`Roblox authentication-ticket request failed with status ${ticketResponse.statusCode}`);
	}

	return ticket;
}
