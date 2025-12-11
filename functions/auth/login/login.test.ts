import { jest } from '@jest/globals';
import { login } from './login.ts';

const clickAny = jest.fn();
const loadCookies = jest.fn().mockResolvedValue(false);
const saveCookies = jest.fn();
const isLoggedIn = jest.fn().mockResolvedValue(false);
jest.mock('../../navigation/clickAny/clickAny.ts', () => ({ clickAny }));
jest.mock('../sessionManager/sessionManager.ts', () => ({
  loadCookies,
  saveCookies,
  isLoggedIn,
}));

describe('login', () => {
  test('logs in when not already logged in', async () => {
    const page = {
      goto: jest.fn().mockResolvedValue(undefined),
      $: jest.fn().mockResolvedValue(null),
      click: jest.fn(),
      setCookie: jest.fn(),
      waitForSelector: jest.fn().mockResolvedValue(undefined),
      type: jest.fn().mockResolvedValue(undefined),
      keyboard: { press: jest.fn() },
      cookies: jest.fn().mockResolvedValue([]),
    } as any;
    await expect(
      login(page, { username: 'u', password: 'p' }, { skipIfLoggedIn: false })
    ).resolves.not.toThrow();
  });
});

