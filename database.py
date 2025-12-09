import sqlite3
import os
from contextlib import contextmanager

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
            is_patreon BOOLEAN DEFAULT 0,
            confidence INTEGER,
            dm_sent BOOLEAN DEFAULT 0,
            dm_sent_at TEXT,
            proof_path TEXT,
            last_seen TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS queue (
            username TEXT PRIMARY KEY,
            priority INTEGER DEFAULT 10,
            source TEXT
        );

        CREATE TABLE IF NOT EXISTS followers_scraped (
            username TEXT PRIMARY KEY,
            scraped_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        """)


@contextmanager
def db():
    conn = sqlite3.connect(DB, timeout=20)
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def queue_add(username: str, priority=10, source="seed"):
    with db() as c:
        c.execute("INSERT OR IGNORE INTO queue(username,priority,source) VALUES(?,?,?)",
                  (username, priority, source))


def queue_next():
    with db() as c:
        cur = c.execute("SELECT username FROM queue ORDER BY priority DESC, rowid LIMIT 1")
        row = cur.fetchone()
        if row:
            c.execute("DELETE FROM queue WHERE username=?", (row[0],))
            return row[0]
    return None
