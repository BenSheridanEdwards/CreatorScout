import { jest } from '@jest/globals';
import {
  openFollowingModal,
  extractFollowingUsernames,
  scrollFollowingModal,
} from './modalOperations.ts';

const sleepMock = jest.fn();
jest.mock('../../timing/sleep/sleep.ts', () => ({ sleep: sleepMock }));

describe('modalOperations', () => {
  test('openFollowingModal returns false when no selector', async () => {
    const page = {
      $: jest.fn().mockResolvedValue(null),
      evaluate: jest.fn(),
    } as any;
    const ok = await openFollowingModal(page);
    expect(ok).toBe(false);
  });

  test('extractFollowingUsernames returns [] when selector missing', async () => {
    const page = {
      waitForSelector: jest.fn().mockRejectedValue(new Error('nope')),
      $$: jest.fn().mockResolvedValue([]),
    } as any;
    const names = await extractFollowingUsernames(page, 2);
    expect(names).toEqual([]);
  });

  test('scrollFollowingModal does not throw', async () => {
    const page = { evaluate: jest.fn().mockResolvedValue(undefined) } as any;
    await expect(scrollFollowingModal(page, 100)).resolves.not.toThrow();
  });
});

