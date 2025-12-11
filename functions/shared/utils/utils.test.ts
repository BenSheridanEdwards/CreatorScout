import { jest } from '@jest/globals';
import { saveProof } from './utils.ts';

jest.mock('node:fs', () => ({ mkdirSync: jest.fn() }));

const screenshot = jest.fn().mockResolvedValue(undefined);
const page = { screenshot } as any;

describe('utils', () => {
  test('saveProof returns path and calls screenshot', async () => {
    const path = await saveProof('user', page);
    expect(typeof path).toBe('string');
    expect(screenshot).toHaveBeenCalled();
  });
});

