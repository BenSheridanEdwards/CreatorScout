// Mock external dependencies BEFORE importing the module
jest.mock('puppeteer-extra', () => ({
  default: {
    use: jest.fn(),
    launch: jest.fn().mockResolvedValue({ newPage: jest.fn() }),
    connect: jest.fn().mockResolvedValue({ newPage: jest.fn() }),
  },
}));
jest.mock('puppeteer-extra-plugin-stealth', () => ({ default: {} }));
jest.mock('../../auth/sessionManager/sessionManager.ts', () => ({
  getUserDataDir: () => '/tmp/test-data',
}));
jest.mock('../../shared/config/config.ts', () => ({
  LOCAL_BROWSER: true,
  BROWSERLESS_TOKEN: 'test-token',
}));

import { jest } from '@jest/globals';
import { createBrowser, createPage } from './browser.ts';

describe('browser helpers', () => {
  test('exports createBrowser function', () => {
    expect(typeof createBrowser).toBe('function');
  });

  test('exports createPage function', () => {
    expect(typeof createPage).toBe('function');
  });

  test('createPage can be called with a mock browser', async () => {
    const mockPage = {
      setDefaultNavigationTimeout: jest.fn(),
      setDefaultTimeout: jest.fn(),
      setViewport: jest.fn(),
      setUserAgent: jest.fn(),
    };
    const mockBrowser = { newPage: jest.fn().mockResolvedValue(mockPage) };
    await expect(createPage(mockBrowser)).resolves.not.toThrow();
  });
});

