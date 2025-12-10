import path from 'node:path';
import type { ExecSyncOptions } from 'node:child_process';
import { execSync } from 'node:child_process';
import type { VisionData } from './types.ts';

type ExecImpl = (command: string, options: ExecSyncOptions) => string;

/**
 * Call the Python vision pipeline and parse the result.
 * execImpl is injectable for easier testing.
 */
export function classifyWithApp(
  imagePath: string,
  execImpl: ExecImpl = execSync
): { ok: boolean; data: VisionData } {
  const abs = path.resolve(imagePath);
  const cmd = `
python3 - <<'PY'
import json
from vision import is_confirmed_creator
path = r"""${abs}"""
ok, data = is_confirmed_creator(path, threshold=70)
print(json.dumps({"ok": ok, "data": data or {}}))
PY
  `;
  const out = execImpl(cmd, {
    cwd: path.join(path.dirname(abs), '..'),
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  try {
    return JSON.parse(out.trim());
  } catch (e) {
    return { ok: false, data: { error: `parse_fail: ${e}` } as VisionData };
  }
}
