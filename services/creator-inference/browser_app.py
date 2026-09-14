"""Browser-facing Creator Runtime entry with an exact CORS allowlist.

Run with:
  CREATOR_BROWSER_ORIGINS=https://www.toonstudio.cloud \
  uvicorn browser_app:app --host 0.0.0.0 --port 8000

Never use '*' with bearer credentials. The base runtime remains available for private-network use.
"""
from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import urlsplit

from fastapi.middleware.cors import CORSMiddleware

from app import Runtime, create_app


def browser_origins() -> list[str]:
    origins = [value.strip() for value in os.environ.get("CREATOR_BROWSER_ORIGINS", "").split(",") if value.strip()]
    if not origins:
        raise RuntimeError("CREATOR_BROWSER_ORIGINS requires at least one exact browser origin")
    for origin in origins:
        parsed = urlsplit(origin)
        local = parsed.hostname in {"localhost", "127.0.0.1", "::1"}
        if (
            parsed.scheme not in {"https", "http"}
            or not parsed.netloc
            or parsed.username
            or parsed.password
            or parsed.path not in {"", "/"}
            or parsed.query
            or parsed.fragment
            or "*" in origin
            or (parsed.scheme == "http" and not local)
        ):
            raise RuntimeError("CREATOR_BROWSER_ORIGINS accepts exact HTTPS origins; localhost may use HTTP")
    return origins


def create_browser_app():
    runtime = Runtime(
        Path(os.environ.get("CREATOR_DATA_DIR", "./creator-data")),
        os.environ.get("CREATOR_INFERENCE_TOKEN", ""),
    )
    application = create_app(runtime)
    application.add_middleware(
        CORSMiddleware,
        allow_origins=browser_origins(),
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=[
            "Authorization",
            "Content-Type",
            "Idempotency-Key",
            "X-Creator-Owner",
        ],
        expose_headers=["Content-Length", "X-Content-SHA256"],
        max_age=600,
    )
    return application


app = create_browser_app()
