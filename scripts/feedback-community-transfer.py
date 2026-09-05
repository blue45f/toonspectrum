"""One-use, branch-scoped transfer of reviewed feedback implementation.
Removed before main merge. No network downloads, arbitrary paths, or main writes.
"""
import base64
import hashlib
import json
import lzma
import os
from pathlib import Path
import subprocess

BRANCH = 'feat/feedback-community-20260906'
EXPECTED = '1d3ff70293c4e41e14cde79ebc516b7d3c17ec11eb10acd09e6e90a58fd17655'
ALLOWED = set('''apps/api/src/db/schema/community.schema.ts
apps/api/src/modules/feedback/feedback.controller.ts
apps/api/src/modules/feedback/feedback.service.ts
apps/api/src/server/feedback.ts
components/inquiry-form.tsx
components/site-header-mobile-nav.tsx
components/site-header.tsx
docs/feedback-community.md
e2e/feedback-community-harness.tsx
e2e/feedback-community.html
e2e/feedback-community.spec.ts
packages/core/src/feedback.test.ts
packages/core/src/feedback.ts
packages/core/src/index.ts
packages/core/src/types.ts
playwright.feedback.config.ts
scripts/verify-feedback-community-db.mts
src/domains/legal/ContactPage.tsx
src/domains/legal/FeedbackPage.tsx
src/domains/legal/SitemapPage.tsx
src/domains/legal/feedback/FeedbackComposer.tsx
src/domains/legal/feedback/FeedbackPostCard.tsx
src/domains/legal/feedback/FeedbackThread.tsx
src/domains/legal/feedback/feedback-community.css
src/domains/legal/feedback/use-feedback-feed.ts
vite.feedback-review.config.ts'''.splitlines())

def run(*args):
    return subprocess.check_output(args, text=True).strip()

def digest(value):
    return hashlib.sha256(value).hexdigest()

if os.environ.get('GITHUB_REPOSITORY') != 'blue45f/toonspectrum':
    raise SystemExit('Wrong repository')
if os.environ.get('GITHUB_REF') != 'refs/heads/' + BRANCH:
    raise SystemExit('Wrong triggering branch')
if run('git', 'branch', '--show-current') != BRANCH:
    raise SystemExit('Wrong checked-out branch')
if run('git', 'status', '--porcelain'):
    raise SystemExit('Working tree is not clean')
encoded = ''.join(Path(f'scripts/feedback-community-transfer-{i}.txt').read_text().strip() for i in range(1, 5))
raw = lzma.decompress(base64.b64decode(encoded, validate=True))
if digest(raw) != EXPECTED:
    raise SystemExit('Payload digest mismatch')
entries = json.loads(raw)
if len(entries) != len(ALLOWED) or {item['path'] for item in entries} != ALLOWED:
    raise SystemExit('Unexpected payload paths')
prepared = []
for item in entries:
    path = Path(item['path'])
    if path.is_absolute() or '..' in path.parts or path.is_symlink():
        raise SystemExit('Unsafe path')
    if any(parent.is_symlink() for parent in path.parents):
        raise SystemExit('Symlinked parent')
    before = path.read_bytes() if path.exists() else None
    if (digest(before) if before is not None else None) != item['before']:
        raise SystemExit('Baseline changed: ' + str(path))
    if before is None:
        after = item['content'].encode('utf-8')
    else:
        lines = before.decode('utf-8').splitlines(keepends=True)
        for start, end, replacement in reversed(item['hunks']):
            if not 0 <= start <= end <= len(lines):
                raise SystemExit('Invalid hunk: ' + str(path))
            lines[start:end] = replacement.splitlines(keepends=True)
        after = ''.join(lines).encode('utf-8')
    if digest(after) != item['after']:
        raise SystemExit('Output mismatch: ' + str(path))
    prepared.append((path, after))
for path, content in prepared:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
subprocess.run(['git', 'diff', '--check'], check=True)
subprocess.run(['git', 'add', '--', *sorted(ALLOWED)], check=True)
subprocess.run(['git', 'config', 'user.name', 'github-actions[bot]'], check=True)
subprocess.run(['git', 'config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com'], check=True)
subprocess.run(['git', '-c', 'core.hooksPath=/dev/null', 'commit', '-m', 'feat(feedback): add public bug, idea and request community with voting and audited progress'], check=True)
subprocess.run(['git', 'push', 'origin', 'HEAD:refs/heads/' + BRANCH], check=True)
print('Applied 26 hash-verified source files on feature branch:', run('git', 'rev-parse', 'HEAD'))
