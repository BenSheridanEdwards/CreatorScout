import sqlite3
import os
from contextlib import contextmanager
from datetime import datetime

DB = "scout.db"


def init_db():
    with sqlite3.connect(DB) as c:
        c.executescript("""
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
        """)


@contextmanager
def db():
    conn = sqlite3.connect(DB, timeout=20)
    conn.row_factory = sqlite3.Row  # Enable dict-like access
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


# === Queue Operations ===

def queue_add(username: str, priority: int = 10, source: str = "seed"):
    """Add username to processing queue."""
    with db() as c:
        c.execute(
            "INSERT OR IGNORE INTO queue(username, priority, source, added_at) VALUES(?, ?, ?, ?)",
            (username.lower().strip(), priority, source, datetime.now().isoformat())
        )


def queue_next() -> str | None:
    """Get and remove highest priority username from queue."""
    with db() as c:
        cur = c.execute("SELECT username FROM queue ORDER BY priority DESC, added_at LIMIT 1")
        row = cur.fetchone()
        if row:
            c.execute("DELETE FROM queue WHERE username=?", (row[0],))
            return row[0]
    return None


def queue_count() -> int:
    """Get number of items in queue."""
    with db() as c:
        cur = c.execute("SELECT COUNT(*) FROM queue")
        return cur.fetchone()[0]


# === Profile Operations ===

def was_visited(username: str) -> bool:
    """Check if we've already visited this profile."""
    with db() as c:
        cur = c.execute("SELECT 1 FROM profiles WHERE username=?", (username.lower().strip(),))
        return cur.fetchone() is not None


def mark_visited(username: str, display_name: str = None, bio: str = None, 
                 bio_score: int = 0, link_url: str = None):
    """Mark a profile as visited with basic info."""
    with db() as c:
        c.execute("""
            INSERT INTO profiles(username, display_name, bio_text, bio_score, link_url, visited_at)
            VALUES(?, ?, ?, ?, ?, ?)
            ON CONFLICT(username) DO UPDATE SET
                display_name = COALESCE(excluded.display_name, display_name),
                bio_text = COALESCE(excluded.bio_text, bio_text),
                bio_score = excluded.bio_score,
                link_url = COALESCE(excluded.link_url, link_url),
                last_seen = CURRENT_TIMESTAMP
        """, (username.lower().strip(), display_name, bio, bio_score, link_url, 
              datetime.now().isoformat()))


def mark_as_creator(username: str, confidence: int = 0, proof_path: str = None):
    """Mark profile as confirmed influencer."""
    with db() as c:
        c.execute("""
            UPDATE profiles SET 
                is_patreon = 1, 
                confidence = ?,
                proof_path = ?,
                last_seen = CURRENT_TIMESTAMP
            WHERE username = ?
        """, (confidence, proof_path, username.lower().strip()))


def was_dm_sent(username: str) -> bool:
    """Check if we already sent a DM to this user."""
    with db() as c:
        cur = c.execute("SELECT dm_sent FROM profiles WHERE username=?", (username.lower().strip(),))
        row = cur.fetchone()
        return bool(row and row[0])


def mark_dm_sent(username: str, proof_path: str = None):
    """Mark that DM was sent to user."""
    with db() as c:
        c.execute("""
            UPDATE profiles SET 
                dm_sent = 1, 
                dm_sent_at = ?,
                proof_path = COALESCE(?, proof_path)
            WHERE username = ?
        """, (datetime.now().isoformat(), proof_path, username.lower().strip()))


def was_followed(username: str) -> bool:
    """Check if we already followed this user."""
    with db() as c:
        cur = c.execute("SELECT followed FROM profiles WHERE username=?", (username.lower().strip(),))
        row = cur.fetchone()
        return bool(row and row[0])


def mark_followed(username: str):
    """Mark that we followed this user."""
    with db() as c:
        c.execute("UPDATE profiles SET followed = 1 WHERE username = ?", (username.lower().strip(),))


# === Following Scrape Tracking ===

def get_scroll_index(username: str) -> int:
    """Get the last scroll index for a user's following list."""
    with db() as c:
        cur = c.execute("SELECT scroll_index FROM following_scraped WHERE username=?", 
                       (username.lower().strip(),))
        row = cur.fetchone()
        return row[0] if row else 0


def update_scroll_index(username: str, index: int):
    """Update the scroll index for a user's following list."""
    with db() as c:
        c.execute("""
            INSERT INTO following_scraped(username, scroll_index, scraped_at) 
            VALUES(?, ?, ?)
            ON CONFLICT(username) DO UPDATE SET 
                scroll_index = excluded.scroll_index,
                scraped_at = excluded.scraped_at
        """, (username.lower().strip(), index, datetime.now().isoformat()))


# === Stats ===

def get_stats() -> dict:
    """Get current stats."""
    with db() as c:
        total = c.execute("SELECT COUNT(*) FROM profiles").fetchone()[0]
        creators = c.execute("SELECT COUNT(*) FROM profiles WHERE is_patreon=1").fetchone()[0]
        dms_sent = c.execute("SELECT COUNT(*) FROM profiles WHERE dm_sent=1").fetchone()[0]
        queue_size = c.execute("SELECT COUNT(*) FROM queue").fetchone()[0]
        
        return {
            "total_visited": total,
            "confirmed_creators": creators,
            "dms_sent": dms_sent,
            "queue_size": queue_size
        }


