"""Tests for the database module."""
import os
import sys
import tempfile
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import database


@pytest.fixture
def temp_db():
    """Create a temporary database for testing."""
    original_db = database.DB
    fd, temp_path = tempfile.mkstemp(suffix='.db')
    os.close(fd)
    database.DB = temp_path
    database.init_db()
    
    yield temp_path
    
    database.DB = original_db
    if os.path.exists(temp_path):
        os.remove(temp_path)


class TestQueueOperations:
    def test_queue_add_and_next(self, temp_db):
        database.queue_add("user1")
        database.queue_add("user2")
        
        assert database.queue_count() == 2
        assert database.queue_next() in ["user1", "user2"]
        assert database.queue_count() == 1
    
    def test_queue_priority_order(self, temp_db):
        database.queue_add("low", priority=10)
        database.queue_add("high", priority=100)
        database.queue_add("medium", priority=50)
        
        assert database.queue_next() == "high"
        assert database.queue_next() == "medium"
        assert database.queue_next() == "low"
    
    def test_queue_ignores_duplicates(self, temp_db):
        database.queue_add("user1")
        database.queue_add("user1")
        database.queue_add("user1")
        
        assert database.queue_count() == 1
    
    def test_queue_empty_returns_none(self, temp_db):
        assert database.queue_next() is None


class TestVisitedTracking:
    def test_mark_and_check_visited(self, temp_db):
        assert database.was_visited("newuser") is False
        
        database.mark_visited("newuser", bio="Test bio", bio_score=50)
        
        assert database.was_visited("newuser") is True
    
    def test_visited_is_case_insensitive(self, temp_db):
        database.mark_visited("TestUser")
        assert database.was_visited("testuser") is True
        assert database.was_visited("TESTUSER") is True


class TestCreatorTracking:
    def test_mark_as_creator(self, temp_db):
        database.mark_visited("creator1")
        database.mark_as_creator("creator1", confidence=85, proof_path="proof.png")
        
        with database.db() as c:
            row = c.execute("SELECT is_patreon, confidence FROM profiles WHERE username=?",
                           ("creator1",)).fetchone()
            assert row["is_patreon"] == 1
            assert row["confidence"] == 85


class TestDMTracking:
    def test_dm_sent_tracking(self, temp_db):
        database.mark_visited("dmuser")
        
        assert database.was_dm_sent("dmuser") is False
        
        database.mark_dm_sent("dmuser", proof_path="dm_proof.png")
        
        assert database.was_dm_sent("dmuser") is True


class TestFollowTracking:
    def test_follow_tracking(self, temp_db):
        database.mark_visited("followuser")
        
        assert database.was_followed("followuser") is False
        
        database.mark_followed("followuser")
        
        assert database.was_followed("followuser") is True


class TestScrollIndex:
    def test_scroll_index_default(self, temp_db):
        assert database.get_scroll_index("newuser") == 0
    
    def test_scroll_index_update(self, temp_db):
        database.update_scroll_index("seeduser", 30)
        assert database.get_scroll_index("seeduser") == 30
        
        database.update_scroll_index("seeduser", 60)
        assert database.get_scroll_index("seeduser") == 60


class TestStats:
    def test_get_stats(self, temp_db):
        # Add some test data
        database.queue_add("q1")
        database.queue_add("q2")
        database.mark_visited("v1")
        database.mark_visited("v2")
        database.mark_visited("v3")
        database.mark_as_creator("v1", confidence=90)
        database.mark_dm_sent("v1")
        
        stats = database.get_stats()
        
        assert stats["queue_size"] == 2
        assert stats["total_visited"] == 3
        assert stats["confirmed_creators"] == 1
        assert stats["dms_sent"] == 1


class TestCompleteWorkflow:
    def test_full_discovery_workflow(self, temp_db):
        """Test the complete workflow: seed → visit → confirm → DM → follow."""
        
        # 1. Add seed
        database.queue_add("seed_model", priority=100, source="seed")
        
        # 2. Get from queue
        target = database.queue_next()
        assert target == "seed_model"
        
        # 3. Visit and analyze
        database.mark_visited("discovered_creator", bio="Patreon 🔥", bio_score=85)
        
        # 4. Confirm as creator
        database.mark_as_creator("discovered_creator", confidence=90, proof_path="linktree.png")
        
        # 5. Send DM
        assert database.was_dm_sent("discovered_creator") is False
        database.mark_dm_sent("discovered_creator", proof_path="dm.png")
        assert database.was_dm_sent("discovered_creator") is True
        
        # 6. Follow
        assert database.was_followed("discovered_creator") is False
        database.mark_followed("discovered_creator")
        assert database.was_followed("discovered_creator") is True
        
        # 7. Add their following to queue for expansion
        database.queue_add("discovered_creator", priority=50, source="following_of_seed_model")
        
        # Verify final state
        stats = database.get_stats()
        assert stats["confirmed_creators"] == 1
        assert stats["dms_sent"] == 1
        assert stats["queue_size"] == 1
