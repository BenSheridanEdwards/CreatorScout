import { jest } from '@jest/globals';
import { clickAny } from './clickAny.ts';
import { createPageMock, createPageWithElementMock } from '../../__test__/testUtils.ts';

const sleepMock = jest.fn();
jest.mock('../../timing/sleep/sleep.ts', () => ({ sleep: sleepMock }));

describe('clickAny', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('when no elements are found', () => {
    test('returns false for single selector', async () => {
      const page = createPageMock();
      const result = await clickAny(page, ['nonexistent']);
      expect(result).toBe(false);
      expect(page.$).toHaveBeenCalledWith('xpath//button[contains(normalize-space(), "nonexistent")]');
    });

    test('returns false when multiple selectors all fail', async () => {
      const page = createPageMock();
      const result = await clickAny(page, ['selector1', 'selector2', 'selector3']);
      expect(result).toBe(false);
      expect(page.$).toHaveBeenCalledTimes(3);
    });
  });

  describe('when element is found', () => {
    test('clicks element and returns true', async () => {
      const page = createPageWithElementMock();
      const result = await clickAny(page, ['clickable']);
      expect(result).toBe(true);
      expect(page.$).toHaveBeenCalledWith('xpath//button[contains(normalize-space(), "clickable")]');
    });

    test('tries multiple selectors until one succeeds', async () => {
      const page = createPageMock({
        $: jest.fn()
          .mockResolvedValueOnce(null) // First selector fails
          .mockResolvedValueOnce(null) // Second selector fails
          .mockResolvedValue({ click: jest.fn().mockResolvedValue(undefined) }) // Third succeeds
      });

      const result = await clickAny(page, ['fail1', 'fail2', 'success']);
      expect(result).toBe(true);
      expect(page.$).toHaveBeenCalledTimes(3);
    });
  });

});
