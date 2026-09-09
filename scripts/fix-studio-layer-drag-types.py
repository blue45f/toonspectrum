from pathlib import Path

path = Path(__file__).resolve().parents[1] / "apps/web/src/domains/creator/layer/StudioLayerNavigator.tsx"
source = path.read_text(encoding="utf-8")
old = '''                : liveSelectionBlocked
                  ? selectionEditGate.reason
                  : batchSelectedIds.length === 0
'''
new = '''                : liveSelectionBlocked
                  ? selectionEditGate.reason ?? undefined
                  : batchSelectedIds.length === 0
'''
count = source.count(old)
if count != 1:
    raise SystemExit(f"expected one reorder unavailable-reason target, found {count}")
path.write_text(source.replace(old, new, 1), encoding="utf-8")
print("studio layer drag type refinement applied")
