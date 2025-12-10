"""Tests for bio matching logic."""
import os
import sys
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from bio_matcher import (
    count_link_emojis, find_keywords, extract_links,
    calculate_score, is_likely_creator
)


class TestEmojiCounting:
    def test_counts_fire_emoji(self):
        assert count_link_emojis("🔥🔥🔥") == 3
    
    def test_counts_mixed_emojis(self):
        assert count_link_emojis("Hey 🔥 babe 💋 link below 👇") == 3
    
    def test_ignores_normal_emojis(self):
        # Regular emojis shouldn't count
        assert count_link_emojis("Hello 👋 world 🌍") == 0
    
    def test_empty_string(self):
        assert count_link_emojis("") == 0


class TestKeywordFinding:
    def test_finds_patreon(self):
        keywords = find_keywords("Check out my Patreon!")
        assert "patreon" in keywords
    
    def test_finds_link_in_bio(self):
        keywords = find_keywords("Link in bio ⬇️")
        assert "link in bio" in keywords
    
    def test_finds_exclusive(self):
        keywords = find_keywords("Exclusive content available")
        assert "exclusive" in keywords
    
    def test_case_insensitive(self):
        keywords = find_keywords("PATREON LINK IN BIO")
        assert "patreon" in keywords
        assert "link in bio" in keywords
    
    def test_no_keywords(self):
        keywords = find_keywords("Just a normal bio about cats")
        assert keywords == []


class TestLinkExtraction:
    def test_finds_linktree(self):
        links = extract_links("linktr.ee/username123")
        assert len(links) == 1
        assert "linktr.ee/username123" in links
    
    def test_finds_patreon_link(self):
        links = extract_links("patreon.com/creator")
        assert "patreon.com/creator" in links
    
    def test_finds_multiple_links(self):
        links = extract_links("linktr.ee/user patreon.com/user ko-fi.com/user")
        assert len(links) == 3
    
    def test_no_links(self):
        links = extract_links("No links here")
        assert links == []


class TestScoreCalculation:
    def test_high_score_for_obvious_creator(self):
        bio = "🔥💋 influencer 🔥 Link in bio ⬇️ linktr.ee/hotgirl"
        result = calculate_score(bio)
        assert result["score"] >= 80
        assert "patreon" in [k.lower() for k in result["keywords"]]
    
    def test_medium_score_for_link(self):
        bio = "🔥🔥🔥 DM me for exclusive content 💋"
        result = calculate_score(bio)
        assert 30 <= result["score"] <= 70
    
    def test_low_score_for_normal_bio(self):
        bio = "Coffee lover ☕ | NYC | Dog mom 🐕"
        result = calculate_score(bio)
        assert result["score"] < 20
    
    def test_empty_bio(self):
        result = calculate_score("")
        assert result["score"] == 0
    
    def test_none_bio(self):
        result = calculate_score(None)
        assert result["score"] == 0


class TestIsLikelyCreator:
    def test_obvious_creator_passes(self):
        bio = "Patreon model 🔥 Link below ⬇️"
        is_likely, data = is_likely_creator(bio, threshold=40)
        assert is_likely is True
    
    def test_normal_bio_fails(self):
        bio = "Just a regular person with hobbies"
        is_likely, data = is_likely_creator(bio, threshold=40)
        assert is_likely is False
    
    def test_threshold_works(self):
        bio = "🔥💋 Exclusive content"
        
        # Lower threshold should pass
        is_likely_low, _ = is_likely_creator(bio, threshold=20)
        
        # Higher threshold might not
        is_likely_high, _ = is_likely_creator(bio, threshold=90)
        
        assert is_likely_low is True
        # High threshold is stricter


