import { jest } from '@jest/globals';
import {
  loadCookies,
  saveCookies,
  isLoggedIn,
  getUserDataDir,
} from './sessionManager.ts';

jest.mock('node:fs', () => ({
  readFileSync: jest.fn(() => '[]'),
  writeFileSync: jest.fn(),
  existsSync: jest.fn(() => true),
  mkdirSync: jest.fn(),
  unlinkSync: jest.fn(),
}));

const page = {
  setCookie: jest.fn().mockResolvedValue(undefined),
  cookies: jest.fn().mockResolvedValue([]),
} as any;

describe('sessionManager', () => {
  test('getUserDataDir returns string', () => {
    expect(typeof getUserDataDir()).toBe('string');
  });

  test('loadCookies resolves', async () => {
    await expect(loadCookies(page)).resolves.not.toThrow();
  });

  test('saveCookies resolves', async () => {
    await expect(saveCookies(page)).resolves.not.toThrow();
  });

  test('isLoggedIn resolves', async () => {
    await expect(isLoggedIn(page)).resolves.not.toThrow();
  });
});

