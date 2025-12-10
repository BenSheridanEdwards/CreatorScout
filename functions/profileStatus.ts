export type ProfileStatus = {
  isPrivate: boolean;
  notFound: boolean;
};

/**
 * Infer Instagram profile availability flags from body text.
 * Made pure for easier testing and reuse.
 */
export function parseProfileStatus(bodyText: string | null | undefined): ProfileStatus {
  const text = (bodyText ?? '').toLowerCase();
  const isPrivate = text.includes('this account is private');
  const notFound =
    text.includes("sorry, this page isn't available") ||
    text.includes('page not found') ||
    text.includes("profile isn't available") ||
    text.includes('may have been removed');
  return { isPrivate, notFound };
}

