"""Integration tests - verify modules work together."""
import os
import sys
import pytest

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def test_all_modules_import():
    """Test that all modules can be imported without errors."""
    import config
    import database
    import humanize
    import utils
    import vision
    import browser_agent
    
    # Verify key exports exist
    assert hasattr(config, 'BROWSERLESS_TOKEN')
    assert hasattr(config, 'OPENROUTER_API_KEY')
    assert hasattr(config, 'VISION_MODEL')
    assert hasattr(config, 'CONFIDENCE_THRESHOLD')
    assert hasattr(config, 'MAX_DMS_PER_DAY')
    assert hasattr(config, 'DM_MESSAGE')
    
    assert hasattr(database, 'init_db')
    assert hasattr(database, 'queue_add')
    assert hasattr(database, 'queue_next')
    assert hasattr(database, 'db')
    
    assert hasattr(humanize, 'rnd')
    assert hasattr(humanize, 'human_scroll')
    assert hasattr(humanize, 'mouse_wiggle')
    
    assert hasattr(utils, 'save_proof')
    
    assert hasattr(vision, 'analyze')
    assert hasattr(vision, 'PROMPT')
    
    assert hasattr(browser_agent, 'new_page')
    assert hasattr(browser_agent, 'login')


def test_main_module_imports():
    """Test that main.py can be imported (doesn't run main())."""
    # This import should work without starting the browser
    from main import process_one, main, init_db
    
    assert callable(process_one)
    assert callable(main)


def test_config_has_required_env_vars():
    """Test that config module reads from environment."""
    import config
    
    # These will be None/placeholder if .env not configured, but should exist
    assert hasattr(config, 'IG_USER')
    assert hasattr(config, 'IG_PASS')
    
    # These should have defaults
    assert config.CONFIDENCE_THRESHOLD == 80
    assert config.MAX_DMS_PER_DAY == 120


def test_vision_prompt_is_valid_json_request():
    """Test that the vision prompt asks for valid JSON structure."""
    from vision import PROMPT
    
    # Should ask for JSON with these required fields
    assert '"username"' in PROMPT
    assert '"is_patreon"' in PROMPT
    assert '"confidence"' in PROMPT
    assert '"link_url"' in PROMPT


def test_database_workflow():
    """Test a complete database workflow - seed to profile to DM tracking."""
    import tempfile
    import database
    
    # Use temp database
    original_db = database.DB
    fd, temp_path = tempfile.mkstemp(suffix='.db')
    os.close(fd)
    database.DB = temp_path
    
    try:
        # Initialize
        database.init_db()
        
        # Add seeds
        database.queue_add("creator1", priority=100, source="seed")
        database.queue_add("creator2", priority=50, source="seed")
        
        # Get highest priority first
        next_user = database.queue_next()
        assert next_user == "creator1"
        
        # Simulate finding an influencer
        with database.db() as c:
            c.execute("""INSERT INTO profiles(username, is_patreon, confidence)
                         VALUES(?, ?, ?)""", ("creator1", True, 95))
        
        # Mark DM sent
        with database.db() as c:
            c.execute("""UPDATE profiles SET dm_sent=1, proof_path=? 
                         WHERE username=?""", ("screenshots/proof.png", "creator1"))
        
        # Verify DM was tracked
        with database.db() as c:
            row = c.execute("SELECT dm_sent, proof_path FROM profiles WHERE username=?",
                           ("creator1",)).fetchone()
            assert row[0] == 1
            assert row[1] == "screenshots/proof.png"
        
        # Queue should still have creator2
        next_user = database.queue_next()
        assert next_user == "creator2"
        
        # Queue should now be empty
        assert database.queue_next() is None
        
    finally:
        database.DB = original_db
        os.remove(temp_path)
