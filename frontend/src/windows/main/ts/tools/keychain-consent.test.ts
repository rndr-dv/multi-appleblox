import { expect, test } from 'bun:test';
import { createKeychainConsent } from './keychain-consent';

class MemoryStorage {
	private readonly values = new Map<string, string>();

	getItem(key: string): string | null {
		return this.values.get(key) ?? null;
	}

	setItem(key: string, value: string): void {
		this.values.set(key, value);
	}
}

test('keychain consent survives a new app session', () => {
	const storage = new MemoryStorage();
	const firstSession = createKeychainConsent(storage);

	expect(firstSession.hasConsent()).toBe(false);
	firstSession.grantConsent();

	const nextSession = createKeychainConsent(storage);
	expect(nextSession.hasConsent()).toBe(true);
});
