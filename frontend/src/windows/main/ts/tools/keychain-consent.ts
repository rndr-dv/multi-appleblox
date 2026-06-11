const CONSENT_STORAGE_KEY = 'multablox.keychain-consent.v1';

interface ConsentStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
}

export function createKeychainConsent(storage: ConsentStorage | null) {
	let consentGiven = storage?.getItem(CONSENT_STORAGE_KEY) === 'true';

	return {
		hasConsent(): boolean {
			return consentGiven;
		},
		grantConsent(): void {
			consentGiven = true;
			storage?.setItem(CONSENT_STORAGE_KEY, 'true');
		},
	};
}

const browserStorage = typeof globalThis.localStorage === 'undefined' ? null : globalThis.localStorage;

export const keychainConsent = createKeychainConsent(browserStorage);
