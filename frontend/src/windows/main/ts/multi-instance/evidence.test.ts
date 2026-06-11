import { describe, expect, it } from 'bun:test';
import { redactEvidenceText, sanitizeDestination } from './evidence';

describe('feasibility evidence redaction', () => {
	it('removes authentication ticket and cookie values', () => {
		const input =
			'gameinfo:ticket-secret .ROBLOSECURITY=cookie-secret x-csrf-token: csrf-secret';
		const result = redactEvidenceText(input);
		expect(result).not.toContain('ticket-secret');
		expect(result).not.toContain('cookie-secret');
		expect(result).not.toContain('csrf-secret');
	});

	it('removes private server access codes from destinations', () => {
		const result = sanitizeDestination(
			'https://www.roblox.com/games/920587237/Test?privateServerLinkCode=private-code'
		);
		expect(result).toBe('https://www.roblox.com/games/920587237/Test?privateServerLinkCode=REDACTED');
	});

	it('redacts secrets at the serialized report boundary', () => {
		const serialized = redactEvidenceText(
			JSON.stringify({
				error: 'gameinfo:ticket-secret',
				destination: 'https://www.roblox.com/games/1/Test?privateServerLinkCode=private-code',
			})
		);
		expect(serialized).not.toContain('ticket-secret');
		expect(serialized).not.toContain('private-code');
	});
});
