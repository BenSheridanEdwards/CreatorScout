import { jest } from '@jest/globals';
import {
  navigateToProfile,
  checkProfileStatus,
  verifyLoggedIn,
} from './profileNavigation.ts';

jest.mock('../../auth/login/login.ts', () => ({ login: jest.fn() }));
jest.mock('../../shared/config/config.ts', () => ({
  IG_USER: 'u',
  IG_PASS: 'p',
}));
jest.mock('../../timing/sleep/sleep.ts', () => ({ sleep: jest.fn() }));

const pageMock = () => ({
  goto: jest.fn().mockResolvedValue(undefined),
  waitForSelector: jest.fn().mockResolvedValue(undefined),
  evaluate: jest.fn().mockResolvedValue(undefined),
  $: jest.fn().mockResolvedValue(null),
});

describe('profileNavigation', () => {
  test('navigateToProfile calls goto', async () => {
    const page = pageMock() as any;
    await navigateToProfile(page, 'user');
    expect(page.goto).toHaveBeenCalled();
  });

  test('checkProfileStatus parses body text', async () => {
    const page = pageMock() as any;
    page.evaluate = jest.fn().mockResolvedValue('This account is private');
    const status = await checkProfileStatus(page);
    expect(status.isPrivate).toBe(true);
  });

  test('verifyLoggedIn returns true when inbox link is present', async () => {
    const page = pageMock() as any;
    page.evaluate = jest.fn().mockResolvedValue(true);
    const ok = await verifyLoggedIn(page);
    expect(ok).toBe(true);
  });
});

