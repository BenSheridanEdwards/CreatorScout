"""Tests for the database module."""
import os
import sys
import tempfile
import pytest

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import database


@pytest.fixture
def temp_db():
    """Create a temporary database for testing."""
    # Save original path
    original_path = database.DB
    
    # Use a temporary file
    fd, temp_path = tempfile.mkstemp(suffix='.db')
    os.close(fd)
    database.DB = temp_path
    
    # Initialize the database
    database.init_db()
    
    yield temp_path
    
    # Cleanup
    database.DB = original_path
    if os.path.exists(temp_path):
        os.remove(temp_path)


def test_init_db(temp_db):
    """Test database initialization creates tables."""
    with database.db() as conn:
        # Check profiles table exists
        cur = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='profiles'"
        )
        assert cur.fetchone() is not None
        
        # Check queue table exists
        cur = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='queue'"
        )
        assert cur.fetchone() is not None
        
        # Check followers_scraped table exists
        cur = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='followers_scraped'"
        )
        assert cur.fetchone() is not None


def test_queue_add(temp_db):
    """Test adding usernames to queue."""
    database.queue_add("testuser1")
    database.queue_add("testuser2", priority=20)
    
    with database.db() as conn:
        cur = conn.execute("SELECT COUNT(*) FROM queue")
        assert cur.fetchone()[0] == 2


def test_queue_next_priority(temp_db):
    """Test that queue returns highest priority first."""
    database.queue_add("low_priority", priority=5)
    database.queue_add("high_priority", priority=20)
    database.queue_add("medium_priority", priority=10)
    
    # Should get high priority first
    assert database.queue_next() == "high_priority"
    assert database.queue_next() == "medium_priority"
    assert database.queue_next() == "low_priority"
    assert database.queue_next() is None


def test_queue_add_ignores_duplicates(temp_db):
    """Test that duplicate usernames are ignored."""
    database.queue_add("testuser")
    database.queue_add("testuser")
    database.queue_add("testuser")
    
    with database.db() as conn:
        cur = conn.execute("SELECT COUNT(*) FROM queue")
        assert cur.fetchone()[0] == 1


def test_queue_add_with_source(temp_db):
    """Test adding usernames with source tracking."""
    database.queue_add("seed_user", priority=100, source="seed")
    database.queue_add("discovered_user", priority=20, source="confirmed_of")
    
    with database.db() as conn:
        cur = conn.execute("SELECT source FROM queue WHERE username=?", ("seed_user",))
        assert cur.fetchone()[0] == "seed"
        
        cur = conn.execute("SELECT source FROM queue WHERE username=?", ("discovered_user",))
        assert cur.fetchone()[0] == "confirmed_of"


def test_profile_insert_and_update(temp_db):
    """Test inserting and updating profiles."""
    with database.db() as c:
        c.execute("""INSERT INTO profiles(username, display_name, is_patreon, confidence)
                     VALUES(?, ?, ?, ?)""", ("creator123", "Test Creator", True, 85))
    
    with database.db() as c:
        cur = c.execute("SELECT username, display_name, is_patreon FROM profiles WHERE username=?", 
                        ("creator123",))
        row = cur.fetchone()
        assert row[0] == "creator123"
        assert row[1] == "Test Creator"
        assert row[2] == 1  # True stored as 1


def test_dm_sent_tracking(temp_db):
    """Test marking a DM as sent."""
    # First insert the profile
    with database.db() as c:
        c.execute("""INSERT INTO profiles(username, is_patreon, confidence)
                     VALUES(?, ?, ?)""", ("dmtest", True, 90))
    
    # Check DM not sent yet
    with database.db() as c:
        cur = c.execute("SELECT dm_sent FROM profiles WHERE username=?", ("dmtest",))
        assert cur.fetchone()[0] == 0
    
    # Mark as sent
    with database.db() as c:
        c.execute("UPDATE profiles SET dm_sent=1, dm_sent_at=?, proof_path=? WHERE username=?",
                  ("2025-01-01", "screenshots/proof.png", "dmtest"))
    
    # Check DM is now marked as sent
    with database.db() as c:
        cur = c.execute("SELECT dm_sent, proof_path FROM profiles WHERE username=?", ("dmtest",))
        row = cur.fetchone()
        assert row[0] == 1
        assert row[1] == "screenshots/proof.png"


def test_followers_scraped_tracking(temp_db):
    """Test tracking scraped followers."""
    with database.db() as c:
        c.execute("INSERT OR IGNORE INTO followers_scraped(username) VALUES(?)", ("creator1",))
        c.execute("INSERT OR IGNORE INTO followers_scraped(username) VALUES(?)", ("creator2",))
    
    with database.db() as c:
        cur = c.execute("SELECT COUNT(*) FROM followers_scraped")
        assert cur.fetchone()[0] == 2
