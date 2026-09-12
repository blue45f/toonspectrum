# Temporary source-only patch transport. Reject stale sources and verify exact reviewed outputs.
import hashlib
import json
from pathlib import Path

updates = json.loads(r'''
[["apps/web/src/infrastructure/creator-work-read-options.test.ts","e09e0a177f7c6e98c35b0e715ce7d1e2cb7e372f1a47b680d809d31300261722","322d02d0b8571d20348ae151c44c943c49b62999491eb4fee5d75af60fd299a2",[[65,66,"    const fetch = vi.fn(async (input: string | URL | Request) => {\n      const request = input instanceof Request ? input : new Request(input);\n"],[71,72,"    const request = fetch.mock.calls[0]?.[0];\n    expect(request instanceof Request && request.signal.aborted).toBe(true);\n"]]],["apps/web/src/domains/creator/studio-autosave-opfs-product-boundary.test.ts","e7aab190059c8dbd50e5a7c283a9d8436512b460195091c3ea3338486b12b6c9","80f6027fd8d34822cb28702f2851f1aa1211913966c78148f412e722c9747685",[[105,106,"    expect(autosave).toContain(\"createStudioAutosaveSnapshotFence\");\n    expect(autosave).toContain(\"generation: studioRevisionProjectGenerationRef.current\");\n    expect(autosave).toContain(\"pendingFingerprint: studioPendingStrokeFingerprint(pendingStrokeCommitsRef.current)\");\n    expect(autosave).toContain(\"if (!canPublishSnapshot()) return;\");\n"]]]]
''')
for name, before, after, edits in updates:
    path = Path(name)
    assert name.startswith(("apps/web/src/", "scripts/")), name
    raw = path.read_bytes() if path.exists() else b""
    assert hashlib.sha256(raw).hexdigest() == before, f"Stale source: {name}"
    lines = raw.decode("utf-8").splitlines(keepends=True)
    for start, end, replacement in reversed(edits):
        lines[start:end] = [replacement]
    updated = "".join(lines).encode("utf-8")
    assert hashlib.sha256(updated).hexdigest() == after, f"Patch output mismatch: {name}"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(updated)
print(f"Applied {len(updates)} exact reviewed source changes")
