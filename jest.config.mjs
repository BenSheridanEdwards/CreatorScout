export default {
	preset: "ts-jest/presets/default-esm",
	testEnvironment: "node",
	extensionsToTreatAsEsm: [".ts"],
	moduleNameMapper: {
		"^(\\.{1,2}/.*)\\.ts$": "$1",
		"^(\\.{1,2}/.*)\\.js$": "$1",
	},
	transform: {
		"^.+\\.ts$": [
			"ts-jest",
			{
				useESM: true,
				tsconfig: {
					module: "Node16",
					moduleResolution: "Node16",
					isolatedModules: true,
				},
			},
		],
	},
	testMatch: [
		"**/functions/**/*.test.ts", // Collocated function tests
		"**/tests/**/*.test.ts", // Legacy/unit tests
		"**/scripts/**/*.test.ts", // Script tests
	],
	testPathIgnorePatterns: [
		"/node_modules/",
		"/tests/e2e/",
		"e2e.*\\.test\\.ts$",
		"\\.puppeteer\\.test\\.ts$",
	],
	collectCoverageFrom: ["functions/**/*.ts", "scripts/**/*.ts"],
	transformIgnorePatterns: [],
	maxWorkers: process.env.CI ? 1 : "25%", // Reduce parallel workers to prevent memory issues
	workerIdleMemoryLimit: "512MB", // Lower threshold to restart workers faster
	testTimeout: 60000, // Increase timeout for complex tests from 30s to 60s
	bail: false, // Don't bail on first failure
	detectLeaks: true, // Enable leak detection to catch memory issues
	forceExit: true, // Force exit after tests complete
	clearMocks: true, // Clear mocks between tests automatically
	restoreMocks: true, // Restore original implementations automatically
};
