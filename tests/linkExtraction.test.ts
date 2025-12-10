import {
  buildUniqueLinks,
  collectAggregatorLinks,
  hasDirectCreatorLink,
  toSafeHttps,
} from '../functions/linkExtraction.ts';

const sampleHtml = `
  <a href="https://linktr.ee/example"></a>
  <a href="https://patreon.com/creator"></a>
  "external_url":"https://beacons.ai/example"
  some text https://linkin.bio/demo
`;

describe('linkExtraction', () => {
  test('buildUniqueLinks collects primary, header, and html matches', () => {
    const links = buildUniqueLinks(
      sampleHtml,
      ['https://foo.com'],
      'https://bar.com'
    );
    expect(links).toContain('https://foo.com');
    expect(links).toContain('https://bar.com');
    expect(links.some((l) => l.includes('linktr.ee'))).toBe(true);
    expect(links.some((l) => l.includes('patreon.com'))).toBe(true);
    expect(links.some((l) => l.includes('beacons.ai'))).toBe(true);
    expect(links.some((l) => l.includes('linkin.bio'))).toBe(true);
  });

  test('hasDirectCreatorLink detects creator domains', () => {
    expect(hasDirectCreatorLink(['https://patreon.com/x'])).toBe(true);
    expect(hasDirectCreatorLink(['https://example.com'])).toBe(false);
  });

  test('collectAggregatorLinks filters aggregator domains', () => {
    const aggregators = collectAggregatorLinks([
      'https://linktr.ee/x',
      'https://example.com',
      'https://beacons.ai/x',
    ]);
    expect(aggregators.sort()).toEqual([
      'https://beacons.ai/x',
      'https://linktr.ee/x',
    ]);
  });

  test('toSafeHttps normalizes http and slashes', () => {
    expect(toSafeHttps('http://example.com')).toBe('https://example.com');
    expect(toSafeHttps('//example.com')).toBe('https://example.com');
    expect(toSafeHttps('https://secure.com')).toBe('https://secure.com');
  });
});
