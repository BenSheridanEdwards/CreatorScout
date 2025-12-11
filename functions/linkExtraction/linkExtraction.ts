const INSTAGRAM_HOST = 'instagram.com';

const AGGREGATOR_REGEX =
  /linktr\.ee|link\.me|beacons\.ai|allmylinks|linkin\.bio|bio\.link|stan\.store|fanhouse/i;

const CREATOR_HOST_REGEX = /patreon\.com/i;

/**
 * Normalize and filter candidate links collected from profile HTML, primary bio link,
 * and header anchor tags.
 */
export function buildUniqueLinks(
  html: string,
  headerHrefs: Array<string | null | undefined>,
  primaryBioLink?: string | null
): string[] {
  const candidates: Set<string> = new Set();
  if (primaryBioLink) candidates.add(primaryBioLink);

  headerHrefs.filter(Boolean).forEach((href) => candidates.add(href as string));

  const urlMatches = html.match(/https?:\/\/[^\s"'<]+/gi) || [];
  urlMatches
    .filter((u) => CREATOR_HOST_REGEX.test(u) || AGGREGATOR_REGEX.test(u))
    .forEach((u) => candidates.add(u));

  const jsonLink = html.match(/"external_url":"(https?:[^\\"\\s]+)"/i);
  if (jsonLink) candidates.add(jsonLink[1].replace(/\\u0026/g, '&'));

  return [...candidates].filter(
    (u) => u?.startsWith('http') && !u.includes(INSTAGRAM_HOST)
  );
}

export function hasDirectCreatorLink(links: string[]): boolean {
  return links.some((u) => CREATOR_HOST_REGEX.test(u));
}

export function collectAggregatorLinks(links: string[]): string[] {
  return links.filter((u) => AGGREGATOR_REGEX.test(u));
}

/**
 * Ensure link is a valid https URL and strip leading slashes.
 */
export function toSafeHttps(url: string): string {
  if (!url) return url;
  const normalized = url.startsWith('http')
    ? url
    : `https://${url.replace(/^[/]+/, '')}`;
  return normalized.replace(/^http:\/\//i, 'https://');
}
