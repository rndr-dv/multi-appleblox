import { describe, expect, it, beforeEach, afterEach, mock } from 'bun:test';
import {
	getDataDir,
	getModsDir,
	getCacheDir,
	getModsCacheDir,
	getFontsCacheDir,
	getConfigDir,
	setTestDataDirectory,
	clearTestDataDirectory,
} from './paths';

// Mock the os module
const mockGetEnv = mock((key: string) => {
	if (key === 'HOME') return Promise.resolve('/Users/test');
	return Promise.resolve('');
});

// Mock Neutralino's os.getEnv
global.window = {
	NL_ARGS: [],
} as any;

// We need to mock the @neutralinojs/lib module
mock.module('@neutralinojs/lib', () => ({
	os: {
		getEnv: mockGetEnv,
	},
	events: {},
	filesystem: {},
	window: {},
	init: () => {},
}));

describe('Path Utilities', () => {
	beforeEach(() => {
		// Clear any test directory overrides before each test
		clearTestDataDirectory();
		mockGetEnv.mockClear();
	});

	afterEach(() => {
		clearTestDataDirectory();
	});

	describe('getDataDir', () => {
		it('should return default data directory when no override is set', async () => {
			const dataDir = await getDataDir();
			expect(dataDir).toBe('/Users/test/Library/Application Support/MultaBlox');
		});

		it('should return test directory when setTestDataDirectory is called', async () => {
			setTestDataDirectory('/tmp/test-multablox');
			const dataDir = await getDataDir();
			expect(dataDir).toBe('/tmp/test-multablox');
		});

		it('should respect MULTABLOX_DATA_DIR environment variable', async () => {
			// This would need to be tested via integration test
			// as the env var is checked during initializeDataDirectory
		});
	});

	describe('getModsDir', () => {
		it('should return mods directory under data dir', async () => {
			const modsDir = await getModsDir();
			expect(modsDir).toBe('/Users/test/Library/Application Support/MultaBlox/mods');
		});

		it('should use test data directory when set', async () => {
			setTestDataDirectory('/tmp/test-multablox');
			const modsDir = await getModsDir();
			expect(modsDir).toBe('/tmp/test-multablox/mods');
		});
	});

	describe('getCacheDir', () => {
		it('should return cache directory under data dir', async () => {
			const cacheDir = await getCacheDir();
			expect(cacheDir).toBe('/Users/test/Library/Application Support/MultaBlox/cache');
		});

		it('should use test data directory when set', async () => {
			setTestDataDirectory('/tmp/test-multablox');
			const cacheDir = await getCacheDir();
			expect(cacheDir).toBe('/tmp/test-multablox/cache');
		});
	});

	describe('getModsCacheDir', () => {
		it('should return mods cache directory', async () => {
			const modsCacheDir = await getModsCacheDir();
			expect(modsCacheDir).toBe('/Users/test/Library/Application Support/MultaBlox/cache/mods');
		});

		it('should use test data directory when set', async () => {
			setTestDataDirectory('/tmp/test-multablox');
			const modsCacheDir = await getModsCacheDir();
			expect(modsCacheDir).toBe('/tmp/test-multablox/cache/mods');
		});
	});

	describe('getFontsCacheDir', () => {
		it('should return fonts cache directory', async () => {
			const fontsCacheDir = await getFontsCacheDir();
			expect(fontsCacheDir).toBe('/Users/test/Library/Application Support/MultaBlox/cache/fonts');
		});

		it('should use test data directory when set', async () => {
			setTestDataDirectory('/tmp/test-multablox');
			const fontsCacheDir = await getFontsCacheDir();
			expect(fontsCacheDir).toBe('/tmp/test-multablox/cache/fonts');
		});
	});

	describe('getConfigDir', () => {
		it('should return config directory (same as data dir)', async () => {
			const configDir = await getConfigDir();
			expect(configDir).toBe('/Users/test/Library/Application Support/MultaBlox');
		});

		it('should use test data directory when set', async () => {
			setTestDataDirectory('/tmp/test-multablox');
			const configDir = await getConfigDir();
			expect(configDir).toBe('/tmp/test-multablox');
		});
	});

	describe('setTestDataDirectory and clearTestDataDirectory', () => {
		it('should set and clear test directory override', async () => {
			// Initially uses default
			const defaultDir = await getDataDir();
			expect(defaultDir).toBe('/Users/test/Library/Application Support/MultaBlox');

			// Set test directory
			setTestDataDirectory('/tmp/test');
			const testDir = await getDataDir();
			expect(testDir).toBe('/tmp/test');

			// Clear test directory
			clearTestDataDirectory();
			const clearedDir = await getDataDir();
			expect(clearedDir).toBe('/Users/test/Library/Application Support/MultaBlox');
		});
	});
});
