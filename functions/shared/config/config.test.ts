import {
	CONFIDENCE_THRESHOLD,
	DELAY_SCALE,
	DM_MESSAGE,
	FAST_MODE,
	LOCAL_BROWSER,
	MAX_DMS_PER_DAY,
	SKIP_VISION,
	TIMEOUT_SCALE,
} from "./config.ts";

describe("config", () => {
	test("exports defaults", () => {
		expect(typeof FAST_MODE).toBe("boolean");
		expect(typeof SKIP_VISION).toBe("boolean");
		expect(typeof LOCAL_BROWSER).toBe("boolean");
		expect(typeof DELAY_SCALE).toBe("number");
		expect(typeof TIMEOUT_SCALE).toBe("number");
		expect(typeof CONFIDENCE_THRESHOLD).toBe("number");
		expect(typeof MAX_DMS_PER_DAY).toBe("number");
		expect(typeof DM_MESSAGE).toBe("string");
	});
});
