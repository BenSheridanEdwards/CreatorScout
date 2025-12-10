import { classifyWithApp } from '../functions/classifyWithApp.ts';

describe('classifyWithApp', () => {
  test('classifyWithApp returns parsed data with injected exec', () => {
    const fakeExec = () =>
      JSON.stringify({ ok: true, data: { confidence: 80, reason: 'mock' } });
    const res = classifyWithApp('/tmp/image.png', fakeExec as any);
    expect(res.ok).toBe(true);
    expect(res.data.confidence).toBe(80);
    expect(res.data.reason).toBe('mock');
  });

  test('classifyWithApp handles parse failures gracefully', () => {
    const fakeExec = () => 'not-json';
    const res = classifyWithApp('/tmp/image.png', fakeExec as any);
    expect(res.ok).toBe(false);
    expect(res.data.error).toBeDefined();
  });
});
