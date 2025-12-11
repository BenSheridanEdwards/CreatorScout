import { jest } from '@jest/globals';
import { getStoryHighlights } from './getStoryHighlights.ts';

describe('getStoryHighlights', () => {
  test('returns empty array when selector fails', async () => {
    const page = {
      waitForSelector: jest.fn().mockRejectedValue(new Error('no highlights')),
      $$: jest.fn().mockResolvedValue([]),
    } as any;
    const highlights = await getStoryHighlights(page);
    expect(highlights).toEqual([]);
  });
});

