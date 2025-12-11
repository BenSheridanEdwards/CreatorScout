import {
  countLinkEmojis,
  findKeywords,
  extractLinks,
  calculateScore,
  isLikelyCreator,
} from './bioMatcher.ts';

describe('bioMatcher', () => {
  describe('countLinkEmojis', () => {
    test('counts emojis correctly', () => {
      expect(countLinkEmojis('🔥💋🍑')).toBe(3);
      expect(countLinkEmojis('Hello world')).toBe(0);
      expect(countLinkEmojis('🔥 Hello 💋 World 🍑')).toBe(3);
    });
  });

  describe('findKeywords', () => {
    test('finds direct mentions', () => {
      const keywords = findKeywords('Check out my Patreon!');
      expect(keywords).toContain('patreon');
    });

    test('finds link hints', () => {
      const keywords = findKeywords('Link in bio!');
      expect(keywords).toContain('link in bio');
    });

    test('finds content hints', () => {
      const keywords = findKeywords('Exclusive content exclusive');
      expect(keywords).toContain('exclusive');
      expect(keywords).toContain('exclusive');
    });

    test('case insensitive', () => {
      const keywords = findKeywords('PATREON LinkTree');
      expect(keywords).toContain('patreon');
      expect(keywords).toContain('linktree');
    });
  });

  describe('extractLinks', () => {
    test('extracts linktree links', () => {
      const links = extractLinks('Check my linktr.ee/username');
      expect(links.some((l) => l.includes('linktr.ee'))).toBe(true);
    });

    test('extracts creator links', () => {
      const links = extractLinks('patreon.com/creator');
      expect(links.some((l) => l.includes('patreon.com'))).toBe(true);
    });

    test('extracts multiple links', () => {
      const links = extractLinks('linktr.ee/user and beacons.ai/user');
      expect(links.length).toBeGreaterThan(0);
    });
  });

  describe('calculateScore', () => {
    test('returns zero for empty bio', () => {
      const result = calculateScore('');
      expect(result.score).toBe(0);
      expect(result.reasons).toEqual([]);
    });

    test('scores high for direct Patreon mention', () => {
      const result = calculateScore('Check out my Patreon!');
      expect(result.score).toBeGreaterThanOrEqual(50);
      expect(result.reasons).toContain('mentions Patreon directly');
    });

    test('scores for emojis', () => {
      const result = calculateScore('🔥💋🍑💦🥵');
      expect(result.score).toBeGreaterThanOrEqual(25);
      expect(result.reasons.some((r) => r.includes('link emojis'))).toBe(
        true
      );
    });

    test('scores for exclusive + discount', () => {
      const result = calculateScore('Exclusive content 50% OFF');
      expect(result.score).toBeGreaterThanOrEqual(25);
      expect(result.reasons).toContain('exclusive content + discount offer');
    });

    test('scores for creator link', () => {
      const result = calculateScore('patreon.com/creator');
      expect(result.score).toBeGreaterThanOrEqual(25);
      expect(result.reasons).toContain('creator link in bio');
    });

    test('caps score at 100', () => {
      const result = calculateScore(
        'Patreon exclusive content 80% OFF 🔥💋🍑💦🥵 patreon.com/creator'
      );
      expect(result.score).toBeLessThanOrEqual(100);
    });
  });

  describe('isLikelyCreator', () => {
    test('returns true for high score bio', () => {
      const [isLikely, result] = isLikelyCreator('influencer!', 40);
      expect(isLikely).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(40);
    });

    test('returns false for low score bio', () => {
      const [isLikely] = isLikelyCreator('Just a regular person', 40);
      expect(isLikely).toBe(false);
    });

    test('respects threshold', () => {
      // "Link in bio" typically scores around 15, so should pass 10 but fail 20
      const [isLikelyLow] = isLikelyCreator('Link in bio', 10);
      const [isLikelyHigh] = isLikelyCreator('Link in bio', 20);
      expect(isLikelyLow).not.toBe(isLikelyHigh);
    });
  });
});
