"""Regenerate only Cyber Agent Zero through the official VRM exporter.

Kept as a compatibility entry point for earlier development commands.  The
authoritative implementation lives in ``generate_toonspectrum_vrm_pack.py``;
there is deliberately no glTF JSON injection or fake humanoid metadata here.

Run from the repository root:
  blender --background --python scripts/blender/generate_vrm_character.py
"""

import sys
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parent))

from generate_toonspectrum_vrm_pack import (  # noqa: E402
    CHARACTERS,
    generate_character,
)


def main():
    spec = next(
        character
        for character in CHARACTERS
        if character["file"] == "cyber_agent_zero.vrm"
    )
    generate_character(spec)
    print("VRM_CHARACTER_COMPLETE " + spec["file"])


if __name__ == "__main__":
    main()
