import sqlite3
from contextlib import contextmanager

DB_PATH = "scout.db"


def init_db():
    with get_conn() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS profiles (
            username TEXT PRIMARY KEY,
            display_name TEXT,
            bio_text TEXT,
            link_in_bio_url TEXT,
            is_patreon BOOLEAN DEFAULT 0,
            of_confidence INTEGER,
            dm_sent BOOLEAN DEFAULT 0,
            dm_sent_at TEXT,
            dm_proof_screenshot TEXT,
            last_checked_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS queue (
            username TEXT PRIMARY KEY,
            priority INTEGER DEFAULT 10,
            added_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_patreon ON profiles(is_patreon);
        CREATE INDEX IF NOT EXISTS idx_dm_sent ON profiles(dm_sent);
        """)
        conn.commit()


@contextmanager
def get_conn():
    conn = sqlite3.connect(DB_PATH)
    try:
        yield conn
    finally:
        conn.close()


def add_to_queue(username: str, priority: int = 10):
    with get_conn() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO queue (username, priority) VALUES (?, ?)",
            (username, priority)
        )
        conn.commit()


def get_next_from_queue():
    with get_conn() as conn:
        cur = conn.execute(
            "SELECT username FROM queue ORDER BY priority DESC, added_at LIMIT 1"
        )
        row = cur.fetchone()
        if row:
            conn.execute("DELETE FROM queue WHERE username = ?", (row[0],))
            conn.commit()
        return row[0] if row else None


def save_profile(username: str, display_name: str = None, bio_text: str = None,
                 link_url: str = None, is_patreon: bool = False, confidence: int = 0):
    """Save or update a profile in the database."""
    with get_conn() as conn:
        conn.execute("""
            INSERT INTO profiles (username, display_name, bio_text, link_in_bio_url, 
                                  is_patreon, of_confidence, last_checked_at)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(username) DO UPDATE SET
                display_name = excluded.display_name,
                bio_text = excluded.bio_text,
                link_in_bio_url = excluded.link_in_bio_url,
                is_patreon = excluded.is_patreon,
                of_confidence = excluded.of_confidence,
                last_checked_at = CURRENT_TIMESTAMP
        """, (username, display_name, bio_text, link_url, is_patreon, confidence))
        conn.commit()


def mark_dm_sent(username: str, screenshot_path: str = None):
    """Mark that a DM was sent to this user."""
    with get_conn() as conn:
        conn.execute("""
            UPDATE profiles SET 
                dm_sent = 1, 
                dm_sent_at = CURRENT_TIMESTAMP,
                dm_proof_screenshot = ?
            WHERE username = ?
        """, (screenshot_path, username))
        conn.commit()


def get_profile(username: str):
    """Get a profile by username."""
    with get_conn() as conn:
        cur = conn.execute("SELECT * FROM profiles WHERE username = ?", (username,))
        return cur.fetchone()


def was_dm_sent(username: str) -> bool:
    """Check if DM was already sent to this user."""
    with get_conn() as conn:
        cur = conn.execute("SELECT dm_sent FROM profiles WHERE username = ?", (username,))
        row = cur.fetchone()
        return bool(row and row[0])
