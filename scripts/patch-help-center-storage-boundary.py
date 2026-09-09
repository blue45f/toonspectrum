from pathlib import Path

path = Path("apps/web/src/domains/creator/StudioHelpCenterDialog.tsx")
source = path.read_text(encoding="utf-8")

import_anchor = 'import { getStudioGpuFabricCapabilities } from "./render/studio-gpu-fabric";\n'
import_line = 'import { studioBrowserStorageEstimator } from "./studio-browser-storage-estimator";\n'
if import_line not in source:
    if source.count(import_anchor) != 1:
        raise SystemExit("Help Center GPU import anchor changed")
    source = source.replace(import_anchor, import_anchor + import_line, 1)

old = '''module.estimateStudioOpfsQuota(
              typeof navigator !== "undefined" && navigator.storage?.estimate
                ? { estimate: () => navigator.storage.estimate() }
                : null,
            )'''
new = "module.estimateStudioOpfsQuota(studioBrowserStorageEstimator())"
if old in source:
    source = source.replace(old, new, 1)
elif new not in source:
    raise SystemExit("Help Center quota estimate anchor changed")

if "navigator.storage" in source:
    raise SystemExit("Help Center still directly owns navigator.storage")
path.write_text(source, encoding="utf-8")
