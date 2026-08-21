"""
Compatibility shim. The application lives in Backend/main.py.

There were two divergent entrypoints. `main:app` is what railway.toml,
nixpacks.toml and the Procfile deploy; `app.main:app` is what the Dockerfile,
docker-compose.yml and start.sh ran. They were not the same application:

  - `app.main:app` registered only 5 of the 11 routers (auth, users, github,
    analysis, chat). Anything hitting webhooks, organizations, teams, developers,
    executive or alerts got a 404 in Docker and worked on Railway.
  - it used `allow_methods=["*"], allow_headers=["*"]` - the exact CORS pattern
    main.py documents as a security fix.
  - it had no rate limiting, no admin gating on the operational endpoints, and
    none of the middleware configured in main.py.
  - it called setup_logging(); main.py did not, which is why logging was
    unconfigured in production (see AUDIT.md L-1).

Rather than delete this module and break any deployment still pointing at it,
it now re-exports the real application. The container manifests have been
updated to `main:app`; this shim can go once nothing references it.
"""
from main import app

__all__ = ["app"]
