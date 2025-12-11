import { jest } from '@jest/globals';
import {
  analyzeProfileComprehensive,
  analyzeProfileBasic,
} from './profileAnalysis.ts';

jest.mock('../../shared/config/config.ts', () => ({ SKIP_VISION: true }));
jest.mock('../../timing/sleep/sleep.ts', () => ({ sleep: jest.fn() }));
jest.mock('../../shared/snapshot/snapshot.ts', () => ({
  snapshot: jest.fn().mockResolvedValue('shot.png'),
}));
jest.mock('../../extraction/getBioFromPage/getBioFromPage.ts', () => ({
  getBioFromPage: jest.fn().mockResolvedValue('bio'),
}));
jest.mock('../../extraction/getLinkFromBio/getLinkFromBio.ts', () => ({
  getLinkFromBio: jest.fn().mockResolvedValue('http://example.com'),
}));
jest.mock('../bioMatcher/bioMatcher.ts', () => ({
  isLikelyCreator: jest.fn(() => [true, { score: 90, reasons: [] }]),
  findKeywords: jest.fn(() => ['foo']),
}));
jest.mock('../../extraction/getProfileStats/getProfileStats.ts', () => ({
  getProfileStats: jest.fn().mockResolvedValue({
    followers: 1,
    following: 1,
    posts: 1,
    ratio: 1,
  }),
}));
jest.mock('../../extraction/getStoryHighlights/getStoryHighlights.ts', () => ({
  getStoryHighlights: jest.fn().mockResolvedValue([]),
  isLinkInBioHighlight: jest.fn(() => false),
  getHighlightTitlesText: jest.fn(() => []),
}));
jest.mock('../../extraction/linkExtraction/linkExtraction.ts', () => ({
  buildUniqueLinks: jest.fn(() => []),
  hasDirectCreatorLink: jest.fn(() => false),
}));
jest.mock('../vision/vision.ts', () => ({
  analyzeProfile: jest.fn().mockResolvedValue({
    isCreator: false,
    confidence: 0,
    indicators: [],
    reason: 'none',
  }),
  isConfirmedCreator: jest.fn(() => [false, { indicators: [] }]),
}));

const pageMock = () =>
  ({
    evaluate: jest.fn(),
    $$eval: jest.fn().mockResolvedValue([]),
    content: jest.fn().mockResolvedValue('<html></html>'),
    $(..._args: any[]) {
      return null;
    },
  } as any);

describe('profileAnalysis', () => {
  test('analyzeProfileBasic resolves', async () => {
    const page = pageMock();
    const result = await analyzeProfileBasic(page, 'user');
    expect(result).toBeTruthy();
  });

  test('analyzeProfileComprehensive resolves', async () => {
    const page = pageMock();
    const result = await analyzeProfileComprehensive(page, 'user');
    expect(result).toBeTruthy();
  });
});
