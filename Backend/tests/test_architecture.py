"""Architecture overview: validated data rendered as Mermaid (app/services/architecture.py)."""
from app.services.architecture import fallback_architecture, to_mermaid, validate_architecture

FILES = ["Frontend/src/pages/Home.tsx", "Backend/app/api/routes/auth.py", "Backend/app/services/scoring.py"]


def _raw(**overrides):
    raw = {
        "summary": "A web app.",
        "layers": [
            {"id": "ui", "name": "Frontend", "description": "React", "components": [
                {"name": "Pages", "description": "Routes", "paths": ["Frontend/src/pages", "made/up/path"]},
            ]},
            {"id": "api", "name": "API", "description": "FastAPI", "components": [
                {"name": "Routes", "description": "", "paths": ["Backend/app/api/routes/auth.py"]},
            ]},
        ],
        "connections": [
            {"from": "ui", "to": "api", "label": "REST / JSON"},
            {"from": "api", "to": "nowhere", "label": "x"},
            {"from": "ui", "to": "ui", "label": "self"},
        ],
    }
    raw.update(overrides)
    return raw


def test_invented_paths_and_dangling_connections_are_dropped():
    arch = validate_architecture(_raw(), FILES)

    assert arch["layers"][0]["components"][0]["paths"] == ["Frontend/src/pages"]
    assert arch["layers"][1]["components"][0]["paths"] == ["Backend/app/api/routes/auth.py"]
    assert arch["connections"] == [{"from": "ui", "to": "api", "label": "REST / JSON"}]


def test_ids_are_made_safe_and_unique():
    raw = _raw(layers=[
        {"id": "Front End!", "name": "A", "description": "", "components": []},
        {"id": "frontend", "name": "B", "description": "", "components": []},
    ], connections=[])
    ids = [layer["id"] for layer in validate_architecture(raw, FILES)["layers"]]

    assert ids == ["frontend", "frontend_"]


def test_labels_cannot_break_the_mermaid_syntax():
    raw = _raw()
    raw["layers"][0]["name"] = 'UI "quoted" <b>|x|</b>'
    raw["connections"][0]["label"] = 'calls "api" | <script>'
    text = to_mermaid(validate_architecture(raw, FILES))

    assert text.startswith("flowchart TD")
    # Layer names go in markdown strings: no quote, backtick, angle bracket or
    # pipe survives to end the string or inject markup.
    assert "**UI 'quoted' (b)/x/(/b)**" in text
    # Edge labels use entity codes.
    assert '-->|"calls #quot;api#quot; #124; #lt;script#gt;"|' in text
    for line in text.splitlines()[1:]:
        inside = line.split('"')[1::2]
        assert all(not any(c in part for c in '<>|') for part in inside)


def test_each_layer_is_one_box_listing_its_components():
    text = to_mermaid(validate_architecture(_raw(), FILES))

    assert 'ui["`**Frontend**\nPages`"]' in text
    assert "subgraph" not in text


def test_fallback_groups_the_file_layout():
    arch = fallback_architecture(FILES)

    assert [layer["id"] for layer in arch["layers"]] == ["frontend", "api", "logic"]
    assert arch["connections"] == [
        {"from": "frontend", "to": "api", "label": ""},
        {"from": "api", "to": "logic", "label": ""},
    ]
    assert "flowchart TD" in to_mermaid(arch)
