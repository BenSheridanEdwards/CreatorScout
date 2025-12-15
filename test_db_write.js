// Quick test to verify database writes during discovery
const Database = require("better-sqlite3");
const db = new Database("scout.db");

// Check count before
const before = db
	.prepare("SELECT COUNT(*) as count FROM profiles WHERE is_patreon = 1")
	.get();
console.log("Creators before test:", before.count);

// Simulate what markAsCreator does
const stmt = db.prepare(`
    UPDATE profiles SET
        is_patreon = 1,
        confidence = ?,
        proof_path = ?,
        last_seen = CURRENT_TIMESTAMP
    WHERE username = ?
`);
stmt.run(85, null, "test_creator_" + Date.now());

// Check count after
const after = db
	.prepare("SELECT COUNT(*) as count FROM profiles WHERE is_patreon = 1")
	.get();
console.log("Creators after test:", after.count);

db.close();

console.log(
	"Database write test:",
	before.count < after.count ? "SUCCESS" : "FAILED",
);
