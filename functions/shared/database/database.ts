/**
 * Database operations using SQLite.
 */

import Database from "better-sqlite3";

const DB_PATH = "scout.db";

let dbInstance: Database.Database | null = null;

function getDb(): Database.Database {
	if (!dbInstance) {
		dbInstance = new Database(DB_PATH);
		initDb();
	}
	return dbInstance;
}

export function initDb(): void {
	const db = getDb();
	db.exec(`
    PRAGMA journal_mode=WAL;
    
    CREATE TABLE IF NOT EXISTS profiles (
        username TEXT PRIMARY KEY,
        display_name TEXT,
        bio_text TEXT,
        link_url TEXT,
        bio_score INTEGER DEFAULT 0,
        is_patreon BOOLEAN DEFAULT 0,
        confidence INTEGER DEFAULT 0,
        dm_sent BOOLEAN DEFAULT 0,
        dm_sent_at TEXT,
        followed BOOLEAN DEFAULT 0,
        proof_path TEXT,
        visited_at TEXT DEFAULT CURRENT_TIMESTAMP,
        last_seen TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS queue (
        username TEXT PRIMARY KEY,
        priority INTEGER DEFAULT 10,
        source TEXT,
        added_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS following_scraped (
        username TEXT PRIMARY KEY,
        scroll_index INTEGER DEFAULT 0,
        scraped_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS metrics (
        id INTEGER PRIMARY KEY,
        date TEXT, -- YYYY-MM-DD
        session_id TEXT,
        profiles_visited INTEGER DEFAULT 0,
        creators_found INTEGER DEFAULT 0,
        dms_sent INTEGER DEFAULT 0,
        follows_completed INTEGER DEFAULT 0,
        avg_bio_score DECIMAL(5,2),
        avg_confidence DECIMAL(5,2),
        vision_api_cost DECIMAL(6,4), -- $ spent on vision calls
        avg_processing_time_seconds DECIMAL(6,2),
        errors_encountered INTEGER DEFAULT 0,
        rate_limits_hit INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_dm_sent ON profiles(dm_sent);
    CREATE INDEX IF NOT EXISTS idx_is_patreon ON profiles(is_patreon);
    CREATE INDEX IF NOT EXISTS idx_visited ON profiles(visited_at);
    CREATE INDEX IF NOT EXISTS idx_metrics_date ON metrics(date);
    CREATE INDEX IF NOT EXISTS idx_metrics_session ON metrics(session_id);

    -- Add new metrics columns to profiles table (ALTER TABLE IF COLUMN doesn't exist isn't supported in SQLite)
    -- We'll handle this with try/catch when we add the columns
  `);

	// Add new metrics columns to profiles table
	try {
		db.exec(`
			ALTER TABLE profiles ADD COLUMN processing_time_seconds INTEGER;
			ALTER TABLE profiles ADD COLUMN discovery_source TEXT;
			ALTER TABLE profiles ADD COLUMN discovery_depth INTEGER DEFAULT 0;
			ALTER TABLE profiles ADD COLUMN session_id TEXT;
			ALTER TABLE profiles ADD COLUMN content_categories TEXT; -- JSON
			ALTER TABLE profiles ADD COLUMN engagement_metrics TEXT; -- JSON
			ALTER TABLE profiles ADD COLUMN vision_api_calls INTEGER DEFAULT 0;
			ALTER TABLE profiles ADD COLUMN errors_encountered TEXT; -- JSON array
			ALTER TABLE profiles ADD COLUMN last_error_at TEXT;
			ALTER TABLE profiles ADD COLUMN source_profile TEXT; -- Which profile led to this discovery
		`);
	} catch (error) {
		// Columns might already exist, ignore error
	}
}

// === Queue Operations ===

export function queueAdd(
	username: string,
	priority: number = 10,
	source: string = "seed",
): void {
	const db = getDb();
	const stmt = db.prepare(
		"INSERT OR IGNORE INTO queue(username, priority, source, added_at) VALUES(?, ?, ?, ?)",
	);
	stmt.run(
		username.toLowerCase().trim(),
		priority,
		source,
		new Date().toISOString(),
	);
}

export function queueNext(): string | null {
	const db = getDb();
	const stmt = db.prepare(
		"SELECT username FROM queue ORDER BY priority DESC, added_at LIMIT 1",
	);
	const row = stmt.get() as { username: string } | undefined;
	if (row) {
		const deleteStmt = db.prepare("DELETE FROM queue WHERE username=?");
		deleteStmt.run(row.username);
		return row.username;
	}
	return null;
}

export function queueCount(): number {
	const db = getDb();
	const stmt = db.prepare("SELECT COUNT(*) as count FROM queue");
	const row = stmt.get() as { count: number };
	return row.count;
}

// === Profile Operations ===

export function wasVisited(username: string): boolean {
	const db = getDb();
	const stmt = db.prepare("SELECT 1 FROM profiles WHERE username=?");
	const row = stmt.get(username.toLowerCase().trim());
	return row !== undefined;
}

export function markVisited(
	username: string,
	displayName?: string | null,
	bio?: string | null,
	bioScore: number = 0,
	linkUrl?: string | null,
): void {
	const db = getDb();
	const stmt = db.prepare(`
    INSERT INTO profiles(username, display_name, bio_text, bio_score, link_url, visited_at)
    VALUES(?, ?, ?, ?, ?, ?)
    ON CONFLICT(username) DO UPDATE SET
        display_name = COALESCE(excluded.display_name, display_name),
        bio_text = COALESCE(excluded.bio_text, bio_text),
        bio_score = excluded.bio_score,
        link_url = COALESCE(excluded.link_url, link_url),
        last_seen = CURRENT_TIMESTAMP
  `);
	stmt.run(
		username.toLowerCase().trim(),
		displayName || null,
		bio || null,
		bioScore,
		linkUrl || null,
		new Date().toISOString(),
	);
}

export function markAsCreator(
	username: string,
	confidence: number = 0,
	proofPath?: string | null,
): void {
	const db = getDb();
	const stmt = db.prepare(`
    UPDATE profiles SET 
        is_patreon = 1, 
        confidence = ?,
        proof_path = ?,
        last_seen = CURRENT_TIMESTAMP
    WHERE username = ?
  `);
	stmt.run(confidence, proofPath || null, username.toLowerCase().trim());
}

export function wasDmSent(username: string): boolean {
	const db = getDb();
	const stmt = db.prepare("SELECT dm_sent FROM profiles WHERE username=?");
	const row = stmt.get(username.toLowerCase().trim()) as
		| { dm_sent: number }
		| undefined;
	return row ? Boolean(row.dm_sent) : false;
}

export function markDmSent(username: string, proofPath?: string | null): void {
	const db = getDb();
	const stmt = db.prepare(`
    UPDATE profiles SET 
        dm_sent = 1, 
        dm_sent_at = ?,
        proof_path = COALESCE(?, proof_path)
    WHERE username = ?
  `);
	stmt.run(
		new Date().toISOString(),
		proofPath || null,
		username.toLowerCase().trim(),
	);
}

export function wasFollowed(username: string): boolean {
	const db = getDb();
	const stmt = db.prepare("SELECT followed FROM profiles WHERE username=?");
	const row = stmt.get(username.toLowerCase().trim()) as
		| { followed: number }
		| undefined;
	return row ? Boolean(row.followed) : false;
}

export function markFollowed(username: string): void {
	const db = getDb();
	const stmt = db.prepare(
		"UPDATE profiles SET followed = 1 WHERE username = ?",
	);
	stmt.run(username.toLowerCase().trim());
}

// === Following Scrape Tracking ===

export function getScrollIndex(username: string): number {
	const db = getDb();
	const stmt = db.prepare(
		"SELECT scroll_index FROM following_scraped WHERE username=?",
	);
	const row = stmt.get(username.toLowerCase().trim()) as
		| { scroll_index: number }
		| undefined;
	return row ? row.scroll_index : 0;
}

export function updateScrollIndex(username: string, index: number): void {
	const db = getDb();
	const stmt = db.prepare(`
    INSERT INTO following_scraped(username, scroll_index, scraped_at) 
    VALUES(?, ?, ?)
    ON CONFLICT(username) DO UPDATE SET 
        scroll_index = excluded.scroll_index,
        scraped_at = excluded.scraped_at
  `);
	stmt.run(username.toLowerCase().trim(), index, new Date().toISOString());
}

// === Stats ===

export interface Stats {
	total_visited: number;
	confirmed_creators: number;
	dms_sent: number;
	queue_size: number;
}

export interface SessionMetrics {
	sessionId: string;
	startTime: Date;
	endTime?: Date;
	profilesVisited: number;
	creatorsFound: number;
	dmsSent: number;
	followsCompleted: number;
	errorsEncountered: number;
	rateLimitsHit: number;
	totalProcessingTime: number;
	visionApiCalls: number;
	visionApiCost: number;
}

export interface DailyMetrics {
	date: string; // YYYY-MM-DD
	totalSessions: number;
	totalProfilesVisited: number;
	totalCreatorsFound: number;
	totalDmsSent: number;
	totalFollowsCompleted: number;
	avgBioScore: number;
	avgConfidence: number;
	totalVisionApiCost: number;
	totalErrors: number;
	totalRateLimits: number;
}

export function getStats(): Stats {
	const db = getDb();
	const totalStmt = db.prepare("SELECT COUNT(*) as count FROM profiles");
	const creatorsStmt = db.prepare(
		"SELECT COUNT(*) as count FROM profiles WHERE is_patreon=1",
	);
	const dmsStmt = db.prepare(
		"SELECT COUNT(*) as count FROM profiles WHERE dm_sent=1",
	);
	const queueStmt = db.prepare("SELECT COUNT(*) as count FROM queue");

	return {
		total_visited: (totalStmt.get() as { count: number }).count,
		confirmed_creators: (creatorsStmt.get() as { count: number }).count,
		dms_sent: (dmsStmt.get() as { count: number }).count,
		queue_size: (queueStmt.get() as { count: number }).count,
	};
}

// === Metrics Functions ===

export function startSessionMetrics(sessionId: string): void {
	const db = getDb();
	const stmt = db.prepare(`
		INSERT INTO metrics (date, session_id, created_at)
		VALUES (?, ?, ?)
	`);
	stmt.run(
		new Date().toISOString().split('T')[0], // YYYY-MM-DD
		sessionId,
		new Date().toISOString()
	);
}

export function updateSessionMetrics(sessionId: string, metrics: Partial<SessionMetrics>): void {
	const db = getDb();
	const updates = [];
	const values = [];

	if (metrics.profilesVisited !== undefined) {
		updates.push('profiles_visited = ?');
		values.push(metrics.profilesVisited);
	}
	if (metrics.creatorsFound !== undefined) {
		updates.push('creators_found = ?');
		values.push(metrics.creatorsFound);
	}
	if (metrics.dmsSent !== undefined) {
		updates.push('dms_sent = ?');
		values.push(metrics.dmsSent);
	}
	if (metrics.followsCompleted !== undefined) {
		updates.push('follows_completed = ?');
		values.push(metrics.followsCompleted);
	}
	if (metrics.avgBioScore !== undefined) {
		updates.push('avg_bio_score = ?');
		values.push(metrics.avgBioScore);
	}
	if (metrics.avgConfidence !== undefined) {
		updates.push('avg_confidence = ?');
		values.push(metrics.avgConfidence);
	}
	if (metrics.visionApiCost !== undefined) {
		updates.push('vision_api_cost = ?');
		values.push(metrics.visionApiCost);
	}
	if (metrics.avgProcessingTime !== undefined) {
		updates.push('avg_processing_time_seconds = ?');
		values.push(metrics.avgProcessingTime);
	}
	if (metrics.errorsEncountered !== undefined) {
		updates.push('errors_encountered = ?');
		values.push(metrics.errorsEncountered);
	}
	if (metrics.rateLimitsHit !== undefined) {
		updates.push('rate_limits_hit = ?');
		values.push(metrics.rateLimitsHit);
	}

	if (updates.length > 0) {
		const stmt = db.prepare(`
			UPDATE metrics SET ${updates.join(', ')} WHERE session_id = ?
		`);
		values.push(sessionId);
		stmt.run(...values);
	}
}

export function getDailyMetrics(date?: string): DailyMetrics | null {
	const db = getDb();
	const targetDate = date || new Date().toISOString().split('T')[0];

	const stmt = db.prepare(`
		SELECT
			date,
			COUNT(DISTINCT session_id) as total_sessions,
			SUM(profiles_visited) as total_profiles_visited,
			SUM(creators_found) as total_creators_found,
			SUM(dms_sent) as total_dms_sent,
			SUM(follows_completed) as total_follows_completed,
			AVG(avg_bio_score) as avg_bio_score,
			AVG(avg_confidence) as avg_confidence,
			SUM(vision_api_cost) as total_vision_api_cost,
			SUM(errors_encountered) as total_errors,
			SUM(rate_limits_hit) as total_rate_limits
		FROM metrics
		WHERE date = ?
		GROUP BY date
	`);

	const row = stmt.get(targetDate) as any;
	if (!row) return null;

	return {
		date: row.date,
		totalSessions: row.total_sessions || 0,
		totalProfilesVisited: row.total_profiles_visited || 0,
		totalCreatorsFound: row.total_creators_found || 0,
		totalDmsSent: row.total_dms_sent || 0,
		totalFollowsCompleted: row.total_follows_completed || 0,
		avgBioScore: row.avg_bio_score || 0,
		avgConfidence: row.avg_confidence || 0,
		totalVisionApiCost: row.total_vision_api_cost || 0,
		totalErrors: row.total_errors || 0,
		totalRateLimits: row.total_rate_limits || 0,
	};
}

export function recordProfileMetrics(
	username: string,
	metrics: {
		processingTimeSeconds?: number;
		discoverySource?: string;
		discoveryDepth?: number;
		sessionId?: string;
		contentCategories?: string[];
		visionApiCalls?: number;
		sourceProfile?: string;
	}
): void {
	const db = getDb();
	const updates = [];
	const values = [];

	if (metrics.processingTimeSeconds !== undefined) {
		updates.push('processing_time_seconds = ?');
		values.push(metrics.processingTimeSeconds);
	}
	if (metrics.discoverySource !== undefined) {
		updates.push('discovery_source = ?');
		values.push(metrics.discoverySource);
	}
	if (metrics.discoveryDepth !== undefined) {
		updates.push('discovery_depth = ?');
		values.push(metrics.discoveryDepth);
	}
	if (metrics.sessionId !== undefined) {
		updates.push('session_id = ?');
		values.push(metrics.sessionId);
	}
	if (metrics.contentCategories !== undefined) {
		updates.push('content_categories = ?');
		values.push(JSON.stringify(metrics.contentCategories));
	}
	if (metrics.visionApiCalls !== undefined) {
		updates.push('vision_api_calls = ?');
		values.push(metrics.visionApiCalls);
	}
	if (metrics.sourceProfile !== undefined) {
		updates.push('source_profile = ?');
		values.push(metrics.sourceProfile);
	}

	if (updates.length > 0) {
		const stmt = db.prepare(`
			UPDATE profiles SET ${updates.join(', ')} WHERE username = ?
		`);
		values.push(username.toLowerCase().trim());
		stmt.run(...values);
	}
}

export function recordError(username: string, errorType: string, errorMessage?: string): void {
	const db = getDb();
	const errorData = {
		type: errorType,
		message: errorMessage || '',
		timestamp: new Date().toISOString()
	};

	// Get existing errors
	const getStmt = db.prepare('SELECT errors_encountered FROM profiles WHERE username = ?');
	const row = getStmt.get(username.toLowerCase().trim()) as { errors_encountered: string } | undefined;

	let errors = [];
	if (row?.errors_encountered) {
		try {
			errors = JSON.parse(row.errors_encountered);
		} catch (e) {
			errors = [];
		}
	}

	errors.push(errorData);

	// Update with new error
	const updateStmt = db.prepare(`
		UPDATE profiles SET
			errors_encountered = ?,
			last_error_at = ?
		WHERE username = ?
	`);
	updateStmt.run(
		JSON.stringify(errors),
		new Date().toISOString(),
		username.toLowerCase().trim()
	);
}
