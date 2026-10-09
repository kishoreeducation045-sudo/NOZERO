"""
Unit tests for deterministic classification rules.
"""
import pytest
from app.services.classification import classify, classify_application, classify_domain


def test_classify_known_coding_applications():
    cat, prod = classify_application("Visual Studio Code")
    assert cat == "Coding"
    assert prod is True

    cat, prod = classify_application("Cursor")
    assert cat == "Coding"
    assert prod is True

    cat, prod = classify_application("devenv")
    assert cat == "Coding"
    assert prod is True


def test_classify_distraction_applications():
    cat, prod = classify_application("Spotify")
    assert cat == "Entertainment"
    assert prod is False

    cat, prod = classify_application("Steam")
    assert cat == "Gaming"
    assert prod is False


def test_classify_known_domains():
    cat, prod = classify_domain("github.com")
    assert cat == "Coding"
    assert prod is True

    cat, prod = classify_domain("leetcode.com")
    assert cat == "DSA"
    assert prod is True

    cat, prod = classify_domain("youtube.com")
    assert cat == "Entertainment"
    assert prod is False


def test_classify_combined():
    # Browser with domain
    cat, prod = classify(app_name="chrome.exe", domain="docs.python.org", source="desktop")
    assert cat == "Study"
    assert prod is True

    # Unknown
    cat, prod = classify(app_name="random_unknown_app.exe", domain=None, source="desktop")
    assert cat == "Other"
    assert prod is False
