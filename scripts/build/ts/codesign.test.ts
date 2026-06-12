import { expect, test } from 'bun:test';
import { getAdHocBundleSignArgs, getAdHocCodeSignArgs, getAppCodeSignSteps } from './codesign';

test('adds a stable designated requirement when an identifier is provided', () => {
	expect(getAdHocCodeSignArgs('/tmp/keychain', 'com.multablox.app.keychain')).toEqual([
		'codesign',
		'--sign',
		'-',
		'--force',
		'--requirements',
		'=designated => identifier "com.multablox.app.keychain"',
		'/tmp/keychain',
	]);
});

test('signs an app bundle with a stable identifier and designated requirement', () => {
	expect(getAdHocBundleSignArgs('/tmp/MultaBlox.app', 'com.multablox.app')).toEqual([
		'codesign',
		'--sign',
		'-',
		'--force',
		'--identifier',
		'com.multablox.app',
		'--requirements',
		'=designated => identifier "com.multablox.app"',
		'/tmp/MultaBlox.app',
	]);
});

test('uses one TCC identity for the command runner and app bundle', () => {
	const steps = getAppCodeSignSteps('/tmp/MultaBlox.app', 'com.multablox.app');
	expect(steps[0]).toContain('com.multablox.app');
	expect(steps[0]).not.toContain('com.multablox.app.main');
	expect(steps[1]).toContain('com.multablox.app');
});
