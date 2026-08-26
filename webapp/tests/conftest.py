"""Make the webapp package importable when tests run from the repo root."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest

import extractor


@pytest.fixture
def stub_classify(monkeypatch):
    """
    Replace the Claude call with a recorder.

    Returns the list of prompts it received, so tests can assert on what would
    have been sent without needing an API key.
    """
    seen = []

    def fake(text):
        seen.append(text)
        return {
            'text': text,
            'file_type': 'stubbed type',
            'table_data': None,
            'metadata': {'llm_only': 'from-model', 'report': 'model-value'},
            'summary': {'model_total': 1},
        }

    monkeypatch.setattr(extractor, '_classify_text', fake)
    return seen
