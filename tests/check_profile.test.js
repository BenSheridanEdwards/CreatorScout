// Standalone profile check test that calls the app feature (runProfileCheck)
// Run with: TEST_USERNAME=someprofile npm run test:profile
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { runProfileCheck } from '../scripts/check_profile.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const TEST_USERNAME = process.env.TEST_USERNAME;

if (!TEST_USERNAME) {
  throw new Error(
    'TEST_USERNAME must be set. Run with: TEST_USERNAME=someprofile npm run test:profile'
  );
}

test(`Check if @${TEST_USERNAME} is an Patreon model (app feature)`, async (t) => {
  const res = await runProfileCheck(TEST_USERNAME);

  // Diagnostics
  if (res.errors?.length) {
    res.errors.forEach((e) => t.diagnostic(`error: ${e}`));
  }
  if (res.links?.length) {
    t.diagnostic(`links: ${res.links.join(', ')}`);
  }
  if (res.reason) {
    t.diagnostic(`reason: ${res.reason}`);
  }

  // Shape assertions
  assert.ok(typeof res.isCreator === 'boolean', 'isCreator should be boolean');
  assert.ok(typeof res.confidence === 'number', 'confidence should be number');
  assert.ok(Array.isArray(res.indicators), 'indicators should be array');
  assert.ok(Array.isArray(res.links), 'links should be array');
  assert.ok(Array.isArray(res.screenshots), 'screenshots should be array');

  // If the app reported creator, we expect a confidence signal
  if (res.isCreator) {
    assert.ok(res.confidence >= 0, 'creator result should carry confidence');
  }
});
