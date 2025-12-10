"""Integration tests - verify all modules work together."""
import os
import sys
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestModuleImports:
    def test_all_modules_import(self):
        """Test that all modules can be imported without errors."""
        import config
        import database
        import humanize
        import utils
        import vision
        import browser_agent
        import bio_matcher
    
    def test_main_imports(self):
        """Test that main.py can be imported."""
        from main import process_profile, process_following_list, main
        
        assert callable(process_profile)
        assert callable(process_following_list)
        assert callable(main)


class TestConfigValues:
    def test_config_has_required_values(self):
        import config
        
        assert hasattr(config, 'BROWSERLESS_TOKEN')
        assert hasattr(config, 'OPENROUTER_API_KEY')
        assert hasattr(config, 'IG_USER')
        assert hasattr(config, 'IG_PASS')
        assert hasattr(config, 'VISION_MODEL')
        assert hasattr(config, 'DM_MESSAGE')
        
        # Defaults should be set
        assert config.CONFIDENCE_THRESHOLD == 80
        assert config.MAX_DMS_PER_DAY == 120


class TestBioMatcherIntegration:
    def test_realistic_patreon_bio(self):
        from bio_matcher import is_likely_creator
        
        bio = """✨ Your favorite girl next door ✨
🔥 Spicy content creator 🔥
💋 Link in bio for exclusive content
⬇️ linktr.ee/hotmodel
DM for collabs 💕"""
        
        is_likely, data = is_likely_creator(bio, threshold=40)
        
        assert is_likely is True
        assert data["score"] >= 50
        assert len(data["keywords"]) > 0
        assert data["emojis"] >= 3
    
    def test_realistic_normal_bio(self):
        from bio_matcher import is_likely_creator
        
        bio = """Software engineer @ Google
📍 San Francisco
🎸 Guitar | 📚 Books | 🏃 Running
Building cool stuff"""
        
        is_likely, data = is_likely_creator(bio, threshold=40)
        
        assert is_likely is False
        assert data["score"] < 40


class TestVisionPrompt:
    def test_vision_prompt_structure(self):
        from vision import LINKTREE_PROMPT
        
        # Should ask for specific fields
        assert '"is_adult_creator"' in LINKTREE_PROMPT
        assert '"confidence"' in LINKTREE_PROMPT
        assert '"platform_links"' in LINKTREE_PROMPT
        assert '"indicators"' in LINKTREE_PROMPT


class TestDatabaseIntegration:
    def test_database_init_creates_tables(self):
        import tempfile
        import database
        
        original_db = database.DB
        fd, temp_path = tempfile.mkstemp(suffix='.db')
        os.close(fd)
        database.DB = temp_path
        
        try:
            database.init_db()
            
            with database.db() as c:
                # Check all tables exist
                tables = c.execute(
                    "SELECT name FROM sqlite_master WHERE type='table'"
                ).fetchall()
                table_names = [t[0] for t in tables]
                
                assert 'profiles' in table_names
                assert 'queue' in table_names
                assert 'following_scraped' in table_names
        finally:
            database.DB = original_db
            os.remove(temp_path)


class TestScrollAndQueuePersistence:
    def test_scroll_index_persists_across_updates(self, tmp_path, monkeypatch):
        import database

        original_db = database.DB
        database.DB = tmp_path / "test_scroll.db"
        database.init_db()

        # initial should be zero
        assert database.get_scroll_index("seed1") == 0

        # update and confirm persistence
        database.update_scroll_index("seed1", 15)
        assert database.get_scroll_index("seed1") == 15

        database.update_scroll_index("seed1", 30)
        assert database.get_scroll_index("seed1") == 30

        # another user unaffected
        assert database.get_scroll_index("seed2") == 0

        database.DB = original_db

    def test_queue_and_profiles_flow_no_browser(self, tmp_path, monkeypatch):
        import database

        original_db = database.DB
        database.DB = tmp_path / "test_queue.db"
        database.init_db()

        # Seed queue
        database.queue_add("seeduser", priority=100, source="seed")
        database.queue_add("otheruser", priority=50, source="seed")
        assert database.queue_count() == 2

        # Dequeue highest priority
        nxt = database.queue_next()
        assert nxt == "seeduser"
        assert database.queue_count() == 1

        # Mark visits and creator path
        database.mark_visited("seeduser", bio="Patreon 🔥", bio_score=85)
        database.mark_as_creator("seeduser", confidence=90, proof_path="proof.png")
        database.mark_dm_sent("seeduser", proof_path="dm.png")
        database.mark_followed("seeduser")

        # Stats reflect updates
        stats = database.get_stats()
        assert stats["confirmed_creators"] == 1
        assert stats["dms_sent"] == 1
        assert stats["total_visited"] == 1
        assert stats["queue_size"] == 1

        database.DB = original_db

