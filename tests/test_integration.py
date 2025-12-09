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
