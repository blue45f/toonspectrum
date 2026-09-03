#!/usr/bin/env python3
from __future__ import annotations

import base64
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAYLOAD_DIR = ROOT / "scripts" / ".shaper-quality-payload"

encoded = "".join(
    (PAYLOAD_DIR / f"{index:02d}.txt").read_text(encoding="utf-8").strip()
    for index in range(6)
)
source = zlib.decompress(base64.b64decode(encoded, validate=True)).decode("utf-8")
exec(compile(source, str(Path(__file__).with_name("shaper-quality-closure.payload.py")), "exec"))
