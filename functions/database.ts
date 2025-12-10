/**
 * Database operations using SQLite.
 */
import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';

const DB_PATH = 'scout.db';

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
    
    CREATE INDEX IF NOT EXISTS idx_dm_sent ON profiles(dm_sent);
    CREATE INDEX IF NOT EXISTS idx_is_patreon ON profiles(is_patreon);
    CREATE INDEX IF NOT EXISTS idx_visited ON profiles(visited_at);
  `);
}

// === Queue Operations ===

export function queueAdd(
  username: string,
  priority: number = 10,
  source: string = 'seed'
): void {
  const db = getDb();
  const stmt = db.prepare(
    'INSERT OR IGNORE INTO queue(username, priority, source, added_at) VALUES(?, ?, ?, ?)'
  );
  stmt.run(
    username.toLowerCase().trim(),
    priority,
    source,
    new Date().toISOString()
  );
}

export function queueNext(): string | null {
  const db = getDb();
  const stmt = db.prepare(
    'SELECT username FROM queue ORDER BY priority DESC, added_at LIMIT 1'
  );
  const row = stmt.get() as { username: string } | undefined;
  if (row) {
    const deleteStmt = db.prepare('DELETE FROM queue WHERE username=?');
    deleteStmt.run(row.username);
    return row.username;
  }
  return null;
}

export function queueCount(): number {
  const db = getDb();
  const stmt = db.prepare('SELECT COUNT(*) as count FROM queue');
  const row = stmt.get() as { count: number };
  return row.count;
}

// === Profile Operations ===

export function wasVisited(username: string): boolean {
  const db = getDb();
  const stmt = db.prepare('SELECT 1 FROM profiles WHERE username=?');
  const row = stmt.get(username.toLowerCase().trim());
  return row !== undefined;
}

export function markVisited(
  username: string,
  displayName?: string | null,
  bio?: string | null,
  bioScore: number = 0,
  linkUrl?: string | null
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
    new Date().toISOString()
  );
}

export function markAsCreator(
  username: string,
  confidence: number = 0,
  proofPath?: string | null
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
  const stmt = db.prepare('SELECT dm_sent FROM profiles WHERE username=?');
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
    username.toLowerCase().trim()
  );
}

export function wasFollowed(username: string): boolean {
  const db = getDb();
  const stmt = db.prepare('SELECT followed FROM profiles WHERE username=?');
  const row = stmt.get(username.toLowerCase().trim()) as
    | { followed: number }
    | undefined;
  return row ? Boolean(row.followed) : false;
}

export function markFollowed(username: string): void {
  const db = getDb();
  const stmt = db.prepare(
    'UPDATE profiles SET followed = 1 WHERE username = ?'
  );
  stmt.run(username.toLowerCase().trim());
}

// === Following Scrape Tracking ===

export function getScrollIndex(username: string): number {
  const db = getDb();
  const stmt = db.prepare(
    'SELECT scroll_index FROM following_scraped WHERE username=?'
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

export function getStats(): Stats {
  const db = getDb();
  const totalStmt = db.prepare('SELECT COUNT(*) as count FROM profiles');
  const creatorsStmt = db.prepare(
    'SELECT COUNT(*) as count FROM profiles WHERE is_patreon=1'
  );
  const dmsStmt = db.prepare(
    'SELECT COUNT(*) as count FROM profiles WHERE dm_sent=1'
  );
  const queueStmt = db.prepare('SELECT COUNT(*) as count FROM queue');

  return {
    total_visited: (totalStmt.get() as { count: number }).count,
    confirmed_creators: (creatorsStmt.get() as { count: number }).count,
    dms_sent: (dmsStmt.get() as { count: number }).count,
    queue_size: (queueStmt.get() as { count: number }).count,
  };
}
