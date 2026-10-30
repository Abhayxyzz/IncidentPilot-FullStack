import os
import sys

import pytest

# Make agent.py / main.py / config.py (project root) importable from tests/
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

# Never hit a real provider from tests
os.environ.setdefault("ENVIRONMENT", "local")

from helpers import FakeClient  # noqa: E402


@pytest.fixture
def install_llm(monkeypatch):
    """Usage: fake = install_llm(good_response()) or install_llm(bad, good) or install_llm(OpenAIError("x"))"""
    import agent

    def _install(*responses):
        fake = FakeClient(responses)
        monkeypatch.setattr(agent, "client", fake)
        return fake

    return _install
