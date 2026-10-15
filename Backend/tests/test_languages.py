"""The one extension map every part of the analysis shares."""
import pytest

from app.core.languages import detect_language, is_analysable


@pytest.mark.parametrize("path, language", [
    ("src/scrape.mjs", "javascript"),
    ("lib/config.cjs", "javascript"),
    ("App.jsx", "javascript"),
    ("api/server.mts", "typescript"),
    ("ui/Page.tsx", "typescript"),
    ("main.PY", "python"),
    ("core/vec.hpp", "cpp"),
    ("README.md", "unknown"),
    ("Makefile", "unknown"),
])
def test_detect_language(path, language):
    assert detect_language(path) == language


def test_es_module_projects_are_not_empty():
    """A JavaScript project in .mjs was fetched as "no code files" and scored 100."""
    from app.services.github_service import GitHubService

    service = GitHubService.__new__(GitHubService)
    assert service._is_code_file("src/scrape.mjs")
    assert service._is_code_file("infra/main.tf")
    assert not service._is_code_file("README.md")


def test_every_agent_uses_the_shared_map():
    from app.agents.best_practices_agent import BestPracticesAgent
    from app.agents.documentation_agent import DocumentationAgent
    from app.agents.quality_agent import CodeQualityAgent
    from app.agents.security_agent import SecurityAgent

    for agent in (SecurityAgent, CodeQualityAgent, DocumentationAgent, BestPracticesAgent):
        assert agent._detect_language(object.__new__(agent), "x.jsx") == "javascript"


def test_extension_check_does_not_match_inside_names():
    assert not is_analysable("notes.json.bak")
    assert is_analysable("package.json")
