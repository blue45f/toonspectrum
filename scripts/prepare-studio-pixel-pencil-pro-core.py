from __future__ import annotations

from pathlib import Path

SCRIPT = Path(__file__).resolve().with_name("apply-studio-pixel-pencil-pro-core.py")
source = SCRIPT.read_text(encoding="utf-8")
old = '''def replace_once(relative: str, old: str, new: str) -> None:
    source = read(relative)
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"{relative}: expected one match, found {count}: {old[:120]!r}")
    write(relative, source.replace(old, new, 1))
'''
new = '''def _indent_block(block: str, prefix: str) -> str:
    return "".join(
        line if not line.strip() else prefix + line
        for line in block.splitlines(keepends=True)
    )


def replace_once(relative: str, old: str, new: str) -> None:
    source = read(relative)
    candidates = [(old, new)]
    for width in range(2, 18, 2):
        prefix = " " * width
        candidates.append((_indent_block(old, prefix), _indent_block(new, prefix)))

    matches: list[tuple[str, str]] = []
    for candidate_old, candidate_new in candidates:
        count = source.count(candidate_old)
        if count == 1:
            matches.append((candidate_old, candidate_new))
        elif count > 1:
            raise RuntimeError(
                f"{relative}: ambiguous match count {count}: {candidate_old[:120]!r}"
            )

    if len(matches) != 1:
        raise RuntimeError(
            f"{relative}: expected one direct or reindented match, found {len(matches)}: {old[:120]!r}"
        )
    candidate_old, candidate_new = matches[0]
    write(relative, source.replace(candidate_old, candidate_new, 1))
'''
count = source.count(old)
if count != 1:
    raise RuntimeError(f"expected one patch helper, found {count}")
SCRIPT.write_text(source.replace(old, new, 1), encoding="utf-8")
print("Prepared indentation-safe pixel-pencil patch helper")
