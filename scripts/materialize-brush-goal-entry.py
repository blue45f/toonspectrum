from pathlib import Path

path = Path("apps/web/src/domains/creator/brush/StudioBrushStudio.tsx")
text = path.read_text(encoding="utf-8")

import_anchor = 'import { StudioBrushInputControls } from "./StudioBrushInputControls";\n'
import_line = 'import { StudioBrushGoalStart } from "./StudioBrushGoalStart";\n'
if import_line not in text:
    if text.count(import_anchor) != 1:
        raise SystemExit("Brush Studio import anchor changed")
    text = text.replace(import_anchor, import_line + import_anchor, 1)

if "<StudioBrushGoalStart" not in text:
    restore_index = text.find("{restoreAction}")
    mobile_marker = '<div className="shrink-0 border-b border-line p-2 sm:hidden">'
    mobile_index = text.find(mobile_marker, restore_index)
    if restore_index < 0 or mobile_index < 0:
        raise SystemExit(
            f"Brush Studio structural markers changed: restore={restore_index}, mobile={mobile_index}"
        )
    line_start = text.rfind("\n", 0, mobile_index) + 1
    indent = text[line_start:mobile_index]
    if not indent.isspace():
        raise SystemExit("Brush Studio mobile preview is not at a standalone JSX line")
    block = (
        f"{indent}<StudioBrushGoalStart\n"
        f"{indent}  activePresetId={{matchedPreset}}\n"
        f"{indent}  activeSection={{category}}\n"
        f"{indent}  onSelectPreset={{(presetId) =>\n"
        f"{indent}    onSelectDynamicsPreset(\n"
        f"{indent}      presetId,\n"
        f"{indent}      studioBrushDynamicsPresetSelectionSettings(presetId),\n"
        f"{indent}    )\n"
        f"{indent}  }}\n"
        f"{indent}  onOpenSection={{(section) => setCategory(section)}}\n"
        f"{indent}/>\n\n"
    )
    text = text[:line_start] + block + text[line_start:]

path.write_text(text, encoding="utf-8")
