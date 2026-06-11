import { expect, test } from 'bun:test';
import { getAdHocCodeSignArgs } from './codesign';

test('adds a stable designated requirement when an identifier is provided', () => {
	expect(getAdHocCodeSignArgs('/tmp/keychain', 'com.lucas.multablox.keychain')).toEqual([
		'codesign',
		'--sign',
		'-',
		'--force',
		'--requirements',
		'=designated => identifier "com.lucas.multablox.keychain"',
		'/tmp/keychain',
	]);
});
