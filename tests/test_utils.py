"""Tests for the utils module - basic sanity checks."""
import os
import sys
import pytest

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def test_utils_module_imports():
    """Test that utils module can be imported."""
    import utils
    assert hasattr(utils, 'save_proof')


def test_screenshots_dir_creation():
    """Test that screenshots directory can be created."""
    import os
    os.makedirs("screenshots", exist_ok=True)
    assert os.path.isdir("screenshots")
