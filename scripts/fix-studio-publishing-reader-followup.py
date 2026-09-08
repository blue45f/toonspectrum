#!/usr/bin/env python3
from pathlib import Path

path = Path("apps/web/src/domains/creator/creator-publication-page-meta.ts")
source = path.read_text(encoding="utf-8")
old = '''            let element = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
            const created = element === null;
            if (!element) {
              element = document.createElement("meta");
              element.name = "robots";
              document.head.appendChild(element);
            }
            const previous = element.getAttribute("content");'''
new = '''            const existing = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
            const created = existing === null;
            const element = existing ?? document.createElement("meta");
            if (created) {
              element.name = "robots";
              document.head.appendChild(element);
            }
            const previous = element.getAttribute("content");'''
count = source.count(old)
if count != 1:
    raise RuntimeError(f"unexpected robots hook anchor count: {count}")
path.write_text(source.replace(old, new), encoding="utf-8")
print("reader metadata hook typing hardened")
