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
		// Exclude memory-intensive test from default runs - use npm run test:profileActions
		"profileActions\\.test\\.ts$",
	],
	collectCoverageFrom: ["functions/**/*.ts", "scripts/**/*.ts"],
	transformIgnorePatterns: [],
	maxWorkers: process.env.CI ? 2 : "50%", // Use fewer workers in CI, more locally
	workerIdleMemoryLimit: "1GB", // Kill workers that exceed memory limit
	// Run memory-intensive tests sequentially
	testTimeout: 30000, // Increase timeout for complex tests
};
