import { jest } from '@jest/globals';

/**
 * Common test utilities for consistent mocking and test setup
 */

/**
 * Creates a minimal Puppeteer page mock with commonly used methods
 */
export const createPageMock = (overrides: Record<string, any> = {}) => {
  const baseMock = {
    $: jest.fn().mockResolvedValue(null),
    $$: jest.fn().mockResolvedValue([]),
    $eval: jest.fn().mockResolvedValue(null),
    $$eval: jest.fn().mockResolvedValue([]),
    evaluate: jest.fn(),
    evaluateHandle: jest.fn(),
    waitForSelector: jest.fn().mockRejectedValue(new Error('Selector not found')),
    waitForFunction: jest.fn().mockRejectedValue(new Error('Function timeout')),
    click: jest.fn().mockResolvedValue(undefined),
    type: jest.fn().mockResolvedValue(undefined),
    goto: jest.fn().mockResolvedValue(undefined),
    content: jest.fn().mockResolvedValue('<html></html>'),
    url: jest.fn().mockReturnValue('https://example.com'),
    screenshot: jest.fn().mockResolvedValue(Buffer.from('fake-screenshot')),
    keyboard: {
      press: jest.fn().mockResolvedValue(undefined),
      type: jest.fn().mockResolvedValue(undefined),
    },
    mouse: {
      click: jest.fn().mockResolvedValue(undefined),
      move: jest.fn().mockResolvedValue(undefined),
    },
    cookies: jest.fn().mockResolvedValue([]),
    setCookie: jest.fn().mockResolvedValue(undefined),
    deleteCookie: jest.fn().mockResolvedValue(undefined),
    setExtraHTTPHeaders: jest.fn().mockResolvedValue(undefined),
  };

  return { ...baseMock, ...overrides } as any;
};

/**
 * Creates a page mock that simulates successful selector finding
 */
export const createPageWithElementMock = (elementOverrides: Record<string, any> = {}) => {
  const element = {
    click: jest.fn().mockResolvedValue(undefined),
    type: jest.fn().mockResolvedValue(undefined),
    evaluate: jest.fn(),
    $: jest.fn().mockResolvedValue(null),
    $$: jest.fn().mockResolvedValue([]),
    ...elementOverrides,
  };

  return createPageMock({
    $: jest.fn().mockResolvedValue(element),
    $$: jest.fn().mockResolvedValue([element]),
    waitForSelector: jest.fn().mockResolvedValue(element),
  });
};

/**
 * Common mock factories for frequently mocked dependencies
 */
export const mockFactories = {
  config: () => ({
    SKIP_VISION: false,
    FAST_MODE: false,
    LOCAL_BROWSER: true,
    DELAY_SCALE: 1,
    TIMEOUT_SCALE: 1,
    CONFIDENCE_THRESHOLD: 50,
    MAX_DMS_PER_DAY: 50,
    DM_MESSAGE: 'Hello!',
    BROWSERLESS_TOKEN: 'test-token',
  }),

  sleep: () => jest.fn().mockResolvedValue(undefined),

  snapshot: () => jest.fn().mockResolvedValue('test-screenshot.png'),

  database: () => ({
    markDmSent: jest.fn().mockResolvedValue(undefined),
    markFollowed: jest.fn().mockResolvedValue(undefined),
    queueAdd: jest.fn().mockResolvedValue(undefined),
    wasVisited: jest.fn().mockResolvedValue(false),
    getQueuedUsers: jest.fn().mockResolvedValue([]),
    getUserStats: jest.fn().mockResolvedValue({}),
  }),

  sessionManager: () => ({
    loadCookies: jest.fn().mockResolvedValue(false),
    saveCookies: jest.fn().mockResolvedValue(undefined),
    isLoggedIn: jest.fn().mockResolvedValue(false),
    getUserDataDir: jest.fn().mockReturnValue('/tmp/test-data'),
  }),
};

/**
 * Helper to assert common function behaviors
 */
export const assertFunctionBehavior = {
  returnsBoolean: (result: any) => {
    expect(typeof result).toBe('boolean');
  },

  returnsString: (result: any) => {
    expect(typeof result).toBe('string');
  },

  returnsNumber: (result: any) => {
    expect(typeof result).toBe('number');
  },

  returnsObject: (result: any) => {
    expect(typeof result).toBe('object');
    expect(result).not.toBeNull();
  },

  doesNotThrow: async (fn: () => Promise<any>) => {
    await expect(fn()).resolves.not.toThrow();
  },

  resolvesToTruthy: async (fn: () => Promise<any>) => {
    const result = await fn();
    expect(result).toBeTruthy();
  },
};

/**
 * Common test data
 */
export const testData = {
  usernames: ['testuser', 'creator_account', 'business_profile'],
  urls: ['https://instagram.com/testuser', 'https://example.com'],
  credentials: { username: 'test@example.com', password: 'testpass123' },
};