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
    original_path = database.DB_PATH
    
    # Use a temporary file
    fd, temp_path = tempfile.mkstemp(suffix='.db')
    os.close(fd)
    database.DB_PATH = temp_path
    
    # Initialize the database
    database.init_db()
    
    yield temp_path
    
    # Cleanup
    database.DB_PATH = original_path
    if os.path.exists(temp_path):
        os.remove(temp_path)


def test_init_db(temp_db):
    """Test database initialization creates tables."""
    with database.get_conn() as conn:
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


def test_add_to_queue(temp_db):
    """Test adding usernames to queue."""
    database.add_to_queue("testuser1")
    database.add_to_queue("testuser2", priority=20)
    
    with database.get_conn() as conn:
        cur = conn.execute("SELECT COUNT(*) FROM queue")
        assert cur.fetchone()[0] == 2


def test_get_next_from_queue_priority(temp_db):
    """Test that queue returns highest priority first."""
    database.add_to_queue("low_priority", priority=5)
    database.add_to_queue("high_priority", priority=20)
    database.add_to_queue("medium_priority", priority=10)
    
    # Should get high priority first
    assert database.get_next_from_queue() == "high_priority"
    assert database.get_next_from_queue() == "medium_priority"
    assert database.get_next_from_queue() == "low_priority"
    assert database.get_next_from_queue() is None


def test_add_to_queue_ignores_duplicates(temp_db):
    """Test that duplicate usernames are ignored."""
    database.add_to_queue("testuser")
    database.add_to_queue("testuser")
    database.add_to_queue("testuser")
    
    with database.get_conn() as conn:
        cur = conn.execute("SELECT COUNT(*) FROM queue")
        assert cur.fetchone()[0] == 1


def test_save_and_get_profile(temp_db):
    """Test saving and retrieving profiles."""
    database.save_profile(
        username="creator123",
        display_name="Test Creator",
        bio_text="Check my links!",
        link_url="https://linktr.ee/creator123",
        is_patreon=True,
        confidence=85
    )
    
    profile = database.get_profile("creator123")
    assert profile is not None
    assert profile[0] == "creator123"  # username
    assert profile[1] == "Test Creator"  # display_name


def test_mark_dm_sent(temp_db):
    """Test marking a DM as sent."""
    # First save the profile
    database.save_profile(
        username="dmtest",
        display_name="DM Test User",
        is_patreon=True,
        confidence=90
    )
    
    # Check DM not sent yet
    assert database.was_dm_sent("dmtest") is False
    
    # Mark as sent
    database.mark_dm_sent("dmtest", "screenshots/proof.png")
    
    # Check DM is now marked as sent
    assert database.was_dm_sent("dmtest") is True


def test_was_dm_sent_nonexistent_user(temp_db):
    """Test checking DM status for non-existent user."""
    assert database.was_dm_sent("nonexistent") is False
