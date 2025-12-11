import { jest } from '@jest/globals';
import { getBioFromPage } from './getBioFromPage.ts';
import { createPageMock, createPageWithElementMock } from '../../__test__/testUtils.ts';

jest.mock('../../shared/snapshot/snapshot.ts', () => ({ snapshot: jest.fn().mockResolvedValue('bio-screenshot.png') }));

describe('getBioFromPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('when bio element is found', () => {
    test('extracts bio text from element', async () => {
      const page = createPageMock({
        $: jest.fn().mockResolvedValue({
          evaluate: jest.fn().mockResolvedValue('This is my bio text')
        })
      });

      const result = await getBioFromPage(page);
      expect(result).toBe('This is my bio text');
    });

    test('tries multiple bio selectors', async () => {
      const page = createPageMock({
        $: jest.fn().mockResolvedValue({
          evaluate: jest.fn().mockResolvedValue('Found bio!')
        })
      });

      const result = await getBioFromPage(page);
      expect(result).toBe('Found bio!');
      expect(page.$).toHaveBeenCalled();
    });
  });

  describe('when bio element is not found', () => {
    test('returns null when all selectors fail', async () => {
      const page = createPageMock();
      const result = await getBioFromPage(page);
      expect(result).toBeNull();
    });

    test('handles selector timeout errors', async () => {
      const page = createPageMock({
        $: jest.fn().mockRejectedValue(new Error('Timeout'))
      });
      const result = await getBioFromPage(page);
      expect(result).toBeNull();
    });
  });

  describe('when bio element evaluation fails', () => {
    test('returns null on evaluation error', async () => {
      const bioElement = {
        evaluate: jest.fn().mockRejectedValue(new Error('Evaluation failed'))
      };
      const page = createPageWithElementMock({
        $: jest.fn().mockResolvedValue(bioElement)
      });

      const result = await getBioFromPage(page);
      expect(result).toBeNull();
    });
  });
});

