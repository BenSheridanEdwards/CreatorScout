"""Tests for the utils module."""
import os
import sys
import pytest

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils import sanitize_username, is_valid_username, format_timestamp


def test_sanitize_username_removes_at():
    """Test that @ symbol is removed from username."""
    assert sanitize_username("@testuser") == "testuser"
    assert sanitize_username("testuser") == "testuser"


def test_sanitize_username_strips_whitespace():
    """Test that whitespace is stripped."""
    assert sanitize_username("  testuser  ") == "testuser"
    assert sanitize_username("  @testuser  ") == "testuser"


def test_sanitize_username_lowercase():
    """Test that username is lowercased."""
    assert sanitize_username("TestUser") == "testuser"
    assert sanitize_username("@TESTUSER") == "testuser"


def test_is_valid_username_valid_cases():
    """Test valid Instagram usernames."""
    assert is_valid_username("testuser") is True
    assert is_valid_username("test_user") is True
    assert is_valid_username("test.user") is True
    assert is_valid_username("test123") is True
    assert is_valid_username("a") is True  # Single character


def test_is_valid_username_invalid_cases():
    """Test invalid Instagram usernames."""
    assert is_valid_username("") is False
    assert is_valid_username("   ") is False
    assert is_valid_username("test user") is False  # No spaces
    assert is_valid_username("test@user") is False  # No @ in middle
    assert is_valid_username("test-user") is False  # No hyphens
    assert is_valid_username("a" * 31) is False  # Too long (max 30)


def test_is_valid_username_with_at_prefix():
    """Test that @ prefix is handled correctly."""
    assert is_valid_username("@testuser") is True  # @ is stripped


def test_format_timestamp():
    """Test timestamp formatting."""
    from datetime import datetime
    
    dt = datetime(2024, 1, 15, 10, 30, 45)
    result = format_timestamp(dt)
    assert result == "2024-01-15 10:30:45"


def test_format_timestamp_default():
    """Test timestamp formatting with default (current time)."""
    result = format_timestamp()
    # Just check it returns something in the right format
    assert len(result) == 19  # YYYY-MM-DD HH:MM:SS
    assert "-" in result
    assert ":" in result
