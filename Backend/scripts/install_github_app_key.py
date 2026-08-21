"""
Install a downloaded GitHub App private key into Backend/.env.

Run once after generating the key at
https://github.com/settings/apps/<slug>#private-key

  python scripts/install_github_app_key.py <path-to.pem>

The key is validated, written in the escaped-newline form the settings loader
normalises, and the source file is shredded. The key material is never printed:
the script reports only which variable names it set.

Using the escaped-newline form locally as well as in deployment matters - it is
what a secret store holds, so local and deployed configs cannot diverge in a way
that only shows up in production.
"""
import pathlib
import sys

from cryptography.hazmat.primitives import serialization

APP_ID = "4673401"
APP_SLUG = "repoiq-code-intelligence"
APP_CLIENT_ID = "Iv23liI2R5feYNQ42ohU"

BACKEND = pathlib.Path(__file__).resolve().parent.parent


def set_env_values(values: dict) -> None:
    """Write or replace keys in Backend/.env, reporting names only."""
    env_path = BACKEND / ".env"
    if not env_path.exists():
        env_path.write_text(
            (BACKEND / ".env.example").read_text(encoding="utf-8"), encoding="utf-8"
        )
        print("Created Backend/.env from .env.example")

    lines = env_path.read_text(encoding="utf-8").splitlines()
    out, seen = [], set()

    for line in lines:
        name = line.lstrip("# ").split("=")[0].strip()
        if name in values:
            out.append(f"{name}={values[name]}")
            seen.add(name)
        else:
            out.append(line)

    for name, value in values.items():
        if name not in seen:
            out.append(f"{name}={value}")

    env_path.write_text("\n".join(out) + "\n", encoding="utf-8")
    print("Set in Backend/.env:", ", ".join(sorted(values)))


def main() -> int:
    # Secondary mode: install a client secret.
    #   python scripts/install_github_app_key.py --client-secret <value>
    if len(sys.argv) == 3 and sys.argv[1] == "--client-secret":
        set_env_values({"GITHUB_APP_CLIENT_SECRET": sys.argv[2]})
        print()
        print("NOTE: a secret passed as a command-line argument is visible in")
        print("shell history and process listings. Rotate it before production:")
        print(f"  https://github.com/settings/apps/{APP_SLUG}")
        return 0

    if len(sys.argv) != 2:
        print(__doc__)
        return 2

    pem_path = pathlib.Path(sys.argv[1])
    if not pem_path.exists():
        print(f"No such file: {pem_path}")
        return 1

    raw = pem_path.read_bytes()

    # Validate before writing. A key that cannot sign is worse than no key -
    # it fails at first login with an opaque 401 from GitHub.
    try:
        key = serialization.load_pem_private_key(raw, password=None)
    except Exception as e:
        print(f"Not a valid PEM private key: {type(e).__name__}")
        return 1

    print(f"Validated: {key.key_size}-bit RSA private key")

    env_path = BACKEND / ".env"
    if not env_path.exists():
        env_path.write_text(
            (BACKEND / ".env.example").read_text(encoding="utf-8"), encoding="utf-8"
        )
        print("Created Backend/.env from .env.example")

    values = {
        "GITHUB_AUTH_MODE": "app",
        "GITHUB_APP_ID": APP_ID,
        "GITHUB_APP_SLUG": APP_SLUG,
        "GITHUB_APP_CLIENT_ID": APP_CLIENT_ID,
        "GITHUB_APP_PRIVATE_KEY": raw.decode("utf-8").strip().replace("\n", "\\n"),
    }

    lines = env_path.read_text(encoding="utf-8").splitlines()
    out, seen = [], set()

    for line in lines:
        name = line.lstrip("# ").split("=")[0].strip()
        if name in values:
            out.append(f"{name}={values[name]}")
            seen.add(name)
        else:
            out.append(line)

    for name, value in values.items():
        if name not in seen:
            out.append(f"{name}={value}")

    env_path.write_text("\n".join(out) + "\n", encoding="utf-8")
    print("Set in Backend/.env:", ", ".join(sorted(values)))

    # Overwrite before unlinking. A plain delete leaves the key recoverable on
    # disk, and this one can mint tokens for every installation of the app.
    try:
        with open(pem_path, "wb") as handle:
            handle.write(b"\0" * len(raw))
            handle.flush()
        pem_path.unlink()
        print(f"Shredded {pem_path.name}")
    except Exception as e:
        print(f"WARNING: could not remove {pem_path}: {e}")
        print("Delete it manually - it is a live credential.")

    print()
    print("Remaining: GITHUB_APP_CLIENT_SECRET (generate at")
    print(f"  https://github.com/settings/apps/{APP_SLUG} )")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
