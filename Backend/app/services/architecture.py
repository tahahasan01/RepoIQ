"""
Architecture overview: structured layers and connections, rendered as Mermaid.

The overview used to be ASCII art written by the model. A model cannot count
columns, so box edges never lined up, and one stray character broke the
picture. The model now returns data (layers, the components in each, and how
layers connect), validated against a schema; this module turns that data into
Mermaid flowchart text itself, escaping every label, so the diagram is always
syntactically valid and is laid out by Mermaid rather than by hand.
"""
import re
from typing import Any, Dict, List

MAX_LAYERS = 7
MAX_COMPONENTS = 8
MAX_PATHS = 4

ARCHITECTURE_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "layers": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "name": {"type": "string"},
                    "description": {"type": "string"},
                    "components": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "description": {"type": "string"},
                                "paths": {"type": "array", "items": {"type": "string"}},
                            },
                            "required": ["name", "description", "paths"],
                            "additionalProperties": False,
                        },
                    },
                },
                "required": ["id", "name", "description", "components"],
                "additionalProperties": False,
            },
        },
        "connections": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "from": {"type": "string"},
                    "to": {"type": "string"},
                    "label": {"type": "string"},
                },
                "required": ["from", "to", "label"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["summary", "layers", "connections"],
    "additionalProperties": False,
}


def _text(value: Any, limit: int) -> str:
    return " ".join(str(value or "").split())[:limit]


def validate_architecture(raw: Dict[str, Any], known_paths: List[str]) -> Dict[str, Any]:
    """
    Normalise a model answer: bounded sizes, unique ids, connections only
    between layers that exist, and component paths only if the repository
    really has them (the model is told to cite paths; it can still invent one).
    """
    known = set(known_paths)
    known_dirs = {p.rsplit("/", 1)[0] for p in known_paths if "/" in p}

    def real(path: str) -> bool:
        path = path.strip().strip("/")
        return path in known or path in known_dirs

    layers, ids = [], set()
    for index, layer in enumerate((raw.get("layers") or [])[:MAX_LAYERS]):
        name = _text(layer.get("name"), 60)
        if not name:
            continue
        layer_id = re.sub(r"[^a-z0-9_]", "", str(layer.get("id") or "").lower()) or f"layer{index}"
        while layer_id in ids:
            layer_id += "_"
        ids.add(layer_id)
        components = []
        for component in (layer.get("components") or [])[:MAX_COMPONENTS]:
            component_name = _text(component.get("name"), 60)
            if not component_name:
                continue
            paths = [p.strip().strip("/") for p in (component.get("paths") or []) if isinstance(p, str) and real(p)]
            components.append({
                "name": component_name,
                "description": _text(component.get("description"), 240),
                "paths": paths[:MAX_PATHS],
            })
        layers.append({
            "id": layer_id,
            "name": name,
            "description": _text(layer.get("description"), 240),
            "components": components,
        })

    connections, seen = [], set()
    for connection in raw.get("connections") or []:
        source = re.sub(r"[^a-z0-9_]", "", str(connection.get("from") or "").lower())
        target = re.sub(r"[^a-z0-9_]", "", str(connection.get("to") or "").lower())
        if source in ids and target in ids and source != target and (source, target) not in seen:
            seen.add((source, target))
            connections.append({"from": source, "to": target, "label": _text(connection.get("label"), 40)})

    return {"summary": _text(raw.get("summary"), 400), "layers": layers, "connections": connections}


# -- deterministic fallback --------------------------------------------------

_GROUPS = [
    # (layer id, layer name, description, [(component, path keywords)])
    ("frontend", "Frontend", "What the user sees and interacts with.", [
        ("Pages", ("pages/", "app/routes", "views/")),
        ("Components", ("components/",)),
        ("State and hooks", ("hooks/", "stores/", "store/")),
    ]),
    ("api", "API", "Request handling.", [
        ("Routes", ("routes/", "controllers/", "api/", "endpoints/")),
        ("Middleware", ("middleware/",)),
    ]),
    ("logic", "Application logic", "Business rules and background work.", [
        ("Services", ("services/", "service/")),
        ("Agents", ("agents/",)),
        ("Background tasks", ("tasks/", "jobs/", "workers/")),
    ]),
    ("data", "Data", "Storage and schema.", [
        ("Models and schemas", ("models/", "schemas/", "entities/")),
        ("Database and migrations", ("migrations/", "database/", "db/")),
    ]),
]


def fallback_architecture(file_paths: List[str]) -> Dict[str, Any]:
    """An overview from the file layout alone, for when the model is unavailable."""
    lowered = [(p, p.lower()) for p in file_paths]
    layers = []
    for layer_id, name, description, groups in _GROUPS:
        components = []
        for component, keywords in groups:
            matches = [p for p, low in lowered if any(k in low for k in keywords)]
            if matches:
                dirs = sorted({m.rsplit("/", 1)[0] for m in matches if "/" in m})
                components.append({
                    "name": f"{component} ({len(matches)} files)",
                    "description": "",
                    "paths": dirs[:MAX_PATHS],
                })
        if components:
            layers.append({"id": layer_id, "name": name, "description": description, "components": components})
    connections = [
        {"from": a["id"], "to": b["id"], "label": ""} for a, b in zip(layers, layers[1:])
    ]
    return {
        "summary": "Drawn from the file layout only; the AI overview was unavailable.",
        "layers": layers,
        "connections": connections,
    }


# -- Mermaid -------------------------------------------------------------------

def _label(text: str) -> str:
    """A label safe inside Mermaid's ["..."] quotes."""
    return (
        text.replace("&", "#amp;").replace('"', "#quot;").replace("<", "#lt;")
        .replace(">", "#gt;").replace("|", "#124;").replace("`", "#96;")
    )


def _markdown_text(text: str) -> str:
    """
    Text safe inside a Mermaid markdown string ("`...`"). Entity codes are not
    decoded there, so characters with meaning are replaced instead: backticks
    and quotes would end the string, * and _ would turn into emphasis, and
    angle brackets are kept out entirely.
    """
    return (
        text.replace("`", "'").replace('"', "'").replace("*", "").replace("_", " ")
        .replace("<", "(").replace(">", ")").replace("|", "/")
    )


def to_mermaid(architecture: Dict[str, Any]) -> str:
    """
    Mermaid flowchart text: one box per layer (its name in bold, components
    listed under it), joined by labelled arrows.

    Components used to be nodes inside a subgraph per layer. Mermaid's
    cluster layout stacks those vertically whatever direction is asked for,
    so a five-layer repository came out as a column over 1,700px tall.
    """
    lines = ["flowchart TD"]
    for layer in architecture.get("layers", []):
        names = [_markdown_text(c["name"]) for c in layer.get("components") or []]
        body = f"**{_markdown_text(layer['name'])}**"
        if names:
            body += "\n" + " · ".join(names)
        lines.append(f'    {layer["id"]}["`{body}`"]')
    for connection in architecture.get("connections", []):
        label = connection.get("label")
        arrow = f'-->|"{_label(label)}"|' if label else "-->"
        lines.append(f'    {connection["from"]} {arrow} {connection["to"]}')
    return "\n".join(lines)
