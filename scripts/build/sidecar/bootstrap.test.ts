import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(resolve('scripts/build/sidecar/bootstrap.m'), 'utf8');
const setupLogging = source.match(/- \(void\)setupLogging \{([\s\S]*?)\n\}/)?.[1];

test('bootstrap stores runtime logs outside the signed app bundle', () => {
	expect(setupLogging).toBeDefined();
	expect(setupLogging).toContain('NSApplicationSupportDirectory');
	expect(setupLogging).toContain('MULTABLOX_DATA_DIR');
	expect(setupLogging).not.toContain('resourcePath');
});
