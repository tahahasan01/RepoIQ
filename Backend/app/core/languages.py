"""
File extensions RepoIQ understands, in one place.

The map used to be copied into the GitHub file filter and four agents, each
with a different subset. None of them knew ES-module extensions, so a
JavaScript project written in `.mjs` was fetched as "no code files" and scored
100 on everything; the security agent also skipped `.jsx`/`.tsx` rules.
"""
import posixpath

LANGUAGE_BY_EXTENSION = {
    ".py": "python",
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".mts": "typescript",
    ".cts": "typescript",
    ".java": "java",
    ".kt": "kotlin",
    ".kts": "kotlin",
    ".scala": "scala",
    ".go": "go",
    ".rb": "ruby",
    ".php": "php",
    ".cs": "csharp",
    ".rs": "rust",
    ".swift": "swift",
    ".c": "c",
    ".h": "c",
    ".cpp": "cpp",
    ".cc": "cpp",
    ".cxx": "cpp",
    ".hpp": "cpp",
    ".r": "r",
    ".sql": "sql",
    ".sh": "shell",
    ".bash": "shell",
    ".vue": "vue",
    ".svelte": "svelte",
}

# Not programming languages, but worth reading: configuration and markup are
# where secrets, CORS rules and injection sinks often live.
_OTHER_ANALYSABLE = {".yaml", ".yml", ".json", ".xml", ".html", ".css", ".scss", ".tf"}

ANALYSABLE_EXTENSIONS = frozenset(LANGUAGE_BY_EXTENSION) | frozenset(_OTHER_ANALYSABLE)


def extension(path: str) -> str:
    """The lower-cased extension of a repository path ("" if it has none)."""
    return posixpath.splitext(path)[1].lower()


def detect_language(path: str) -> str:
    """The language a file is written in, or "unknown"."""
    return LANGUAGE_BY_EXTENSION.get(extension(path), "unknown")


def is_analysable(path: str) -> bool:
    return extension(path) in ANALYSABLE_EXTENSIONS


def is_javascript_family(path: str) -> bool:
    return detect_language(path) in ("javascript", "typescript")
