from __future__ import annotations

from pathlib import Path

script_path = Path(__file__).with_name("pr690-reconcile.py")
source = script_path.read_text(encoding="utf-8")

label = 'label="character shaper surface runtime",'
label_index = source.find(label)
if label_index < 0:
    raise SystemExit("character shaper runtime block not found in reconciliation script")
block_start = source.rfind("host = replace_once(\n", 0, label_index)
block_end = source.find("\n)\n", label_index)
if block_start < 0 or block_end < 0:
    raise SystemExit("character shaper runtime block boundaries not found")
block_end += len("\n)\n")

replacement = '''# Preserve the existing poser opener. Its exact implementation changed while the\n# architecture branch was open, so only add the new character surface seam here.\nif "const [characterShaperOpen, setCharacterShaperOpen]" not in host:\n    state_anchor = '  const [poserVrmOpen, setPoserVrmOpen] = useState(false);\\n'\n    if state_anchor not in host:\n        raise SystemExit("character shaper state: poser state anchor not found")\n    host = host.replace(\n        state_anchor,\n        state_anchor\n        + '  const [characterShaperOpen, setCharacterShaperOpen] = useState(false);\\n',\n        1,\n    )\n\nif "function openCharacterShaperFromMenu()" not in host:\n    function_anchor = '  function openBackground3dFromMenu() {\\n'\n    if function_anchor not in host:\n        raise SystemExit("character shaper opener: background 3D function anchor not found")\n    host = host.replace(\n        function_anchor,\n        '  function openCharacterShaperFromMenu() {\\n'\n        '    setPoserVrmOpen(false);\\n'\n        '    setCharacterShaperOpen(true);\\n'\n        '    navigateStudio2dSurface("character");\\n'\n        '  }\\n'\n        + function_anchor,\n        1,\n    )\n'''
source = source[:block_start] + replacement + source[block_end:]

write_anchor = 'host_path.write_text(host, encoding="utf-8")\n'
if write_anchor not in source:
    raise SystemExit("host write anchor not found")
source = source.replace(
    write_anchor,
    '''# The v1 script generated a temporary hook before the host's current opener\n# shape was known. The inline function declaration is intentional here because\n# it is hoisted across the legacy command wiring; remove the unused transport.\nhost = host.replace(\n    'import { useStudioCharacterShaperSurfaceRuntime } from "./studio-cuttoon-editor/runtime/useStudioCharacterShaperSurfaceRuntime";\\n',\n    "",\n)\nruntime_path.unlink(missing_ok=True)\n''' + write_anchor,
    1,
)

cleanup_anchor = '    ROOT / "scripts/pr690-reconcile.py",\n):'
if cleanup_anchor not in source:
    raise SystemExit("temporary cleanup anchor not found")
source = source.replace(
    cleanup_anchor,
    '    ROOT / "scripts/pr690-reconcile.py",\n'
    '    ROOT / "scripts/pr690-reconcile-v2.py",\n'
    '    ROOT / ".github/workflows/pr690-reconcile-now.yml",\n'
    '):',
    1,
)

exec(compile(source, str(script_path), "exec"), {"__name__": "__main__", "__file__": str(script_path)})
