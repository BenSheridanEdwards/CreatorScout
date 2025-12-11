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
	],
	testPathIgnorePatterns: [
		"/node_modules/",
		"/tests/e2e/",
		"e2e.*\\.test\\.ts$",
		"\\.puppeteer\\.test\\.ts$",
	],
	collectCoverageFrom: ["functions/**/*.ts", "scripts/**/*.ts"],
	transformIgnorePatterns: [],
};
