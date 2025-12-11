import { jest } from '@jest/globals';
import { snapshot } from './snapshot.ts';

jest.mock('node:fs/promises', () => ({
  mkdir: jest.fn(),
  writeFile: jest.fn(),
}));

const page = { screenshot: jest.fn().mockResolvedValue(undefined) } as any;

describe('snapshot', () => {
  test('saves screenshot and returns path', async () => {
    const path = await snapshot(page, 'label');
    expect(typeof path).toBe('string');
    expect(path).toContain('label');
  });
});

