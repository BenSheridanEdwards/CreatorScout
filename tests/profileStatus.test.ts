import { parseProfileStatus } from '../functions/profileStatus.ts';

describe('parseProfileStatus', () => {
  test('parseProfileStatus detects private accounts', () => {
    const text = 'This account is private and you need to follow to see posts';
    const status = parseProfileStatus(text);
    expect(status.isPrivate).toBe(true);
    expect(status.notFound).toBe(false);
  });

  test('parseProfileStatus detects not found', () => {
    const text =
      "Sorry, this page isn't available because it may have been removed";
    const status = parseProfileStatus(text);
    expect(status.notFound).toBe(true);
    expect(status.isPrivate).toBe(false);
  });

  test('parseProfileStatus handles neutral text', () => {
    const status = parseProfileStatus('Welcome to an open profile bio');
    expect(status.isPrivate).toBe(false);
    expect(status.notFound).toBe(false);
  });
});
