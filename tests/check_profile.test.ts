// Standalone profile check test that calls the app feature (runProfileCheck)
// Run with: TEST_USERNAME=someprofile npm run test:profile
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { runProfileCheck } from '../scripts/check_profile.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const TEST_USERNAME = process.env.TEST_USERNAME;

const testSuite = TEST_USERNAME ? describe : describe.skip;

testSuite('check_profile', () => {
  test(`Check if @${TEST_USERNAME} is an Patreon model (app feature)`, async () => {
    console.log(`\n🔍 Starting profile check for @${TEST_USERNAME}...`);
    console.log('Step 1: Launching browser and logging into Instagram...');

    const res = await runProfileCheck(TEST_USERNAME!);

    console.log('\n✅ Profile check completed');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Profile information
    console.log(`\n📋 Profile Information:`);
    console.log(`   Username: @${res.username}`);
    if (res.bio) {
      console.log(
        `   Bio: ${res.bio.substring(0, 100)}${
          res.bio.length > 100 ? '...' : ''
        }`
      );
    }

    // Links discovered
    console.log(`\n🔗 Links Discovered (${res.links?.length || 0}):`);
    if (res.links && res.links.length > 0) {
      res.links.forEach((link, idx) => {
        console.log(`   ${idx + 1}. ${link}`);
      });
    } else {
      console.log('   No links found');
    }

    // Screenshots taken
    console.log(`\n📸 Screenshots Taken (${res.screenshots?.length || 0}):`);
    if (res.screenshots && res.screenshots.length > 0) {
      res.screenshots.forEach((screenshot, idx) => {
        console.log(`   ${idx + 1}. ${screenshot}`);
      });
    } else {
      console.log('   No screenshots taken');
    }

    // Classification result
    console.log(`\n🎯 Classification Result:`);
    console.log(`   Is Creator: ${res.isCreator ? '✅ YES' : '❌ NO'}`);
    console.log(`   Confidence: ${res.confidence}%`);
    if (res.reason) {
      console.log(`   Reason: ${res.reason}`);
    }
    if (res.indicators && res.indicators.length > 0) {
      console.log(`   Indicators:`);
      res.indicators.forEach((indicator, idx) => {
        console.log(`     - ${indicator}`);
      });
    }

    // Errors encountered
    if (res.errors && res.errors.length > 0) {
      console.log(`\n⚠️  Errors Encountered (${res.errors.length}):`);
      res.errors.forEach((error, idx) => {
        console.log(`   ${idx + 1}. ${error}`);
      });
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Shape assertions
    expect(typeof res.isCreator).toBe('boolean');
    expect(typeof res.confidence).toBe('number');
    expect(Array.isArray(res.indicators)).toBe(true);
    expect(Array.isArray(res.links)).toBe(true);
    expect(Array.isArray(res.screenshots)).toBe(true);

    // If the app reported creator, we expect a confidence signal
    if (res.isCreator) {
      expect(res.confidence).toBeGreaterThanOrEqual(0);
    }
  }, 60000); // 60 second timeout for integration test
});
