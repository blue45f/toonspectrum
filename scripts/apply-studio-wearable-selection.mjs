// One-shot, source-hash-guarded integration on the wearable review branch only.
import { createHash } from "node:crypto";
import fs from "node:fs";

function patch(path, expected, edits) {
  let text = fs.readFileSync(path, "utf8");
  const bytes = Buffer.from(text);
  const hash = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
  if (hash !== expected) throw new Error(`Refusing changed source: ${path} (${hash})`);
  for (const [before, after] of edits) {
    if (text.split(before).length !== 2) throw new Error(`Ambiguous source anchor: ${path}: ${before}`);
    text = text.replace(before, after);
  }
  fs.writeFileSync(path, text);
}

patch("src/domains/creator/vrm/StudioVrmPropPanel.tsx", "17d635840f2c8ac8bf3fd652dac8077163da4846", [
  ['import { StudioThreeDToggleControl } from "../StudioThreeDToggle";', 'import { StudioThreeDToggleControl } from "../StudioThreeDToggle";\n\nimport { studioVrmPropQualityNotice } from "./studio-vrm-prop-quality-policy";\nimport { SELECTABLE_VRM_PROPS, selectableStudioVrmPropById } from "./studio-vrm-prop-selection";'],
  ['  VRM_PROPS,\n', ''],
  ['  "book",\n  "sword",\n', '  "book",\n  "mic",\n'],
  ['.map((id) => propDefById(id))', '.map((id) => selectableStudioVrmPropById(id))'],
  ['const filteredDefinitions = VRM_PROPS.filter(', 'const filteredDefinitions = SELECTABLE_VRM_PROPS.filter('],
  ['{VRM_PROPS.length}종', '{SELECTABLE_VRM_PROPS.length}종'],
  ['    if (!vrmReady) return;\n    setRecentPropIds', '    if (!vrmReady || !selectableStudioVrmPropById(definition.id)) return;\n    setRecentPropIds'],
  ['            {definition?.hint ?? "기존 소품의 부착 위치와 모양을 조정합니다."}\n          </p>', '            {definition?.hint ?? "기존 소품의 부착 위치와 모양을 조정합니다."}\n          </p>\n          {studioVrmPropQualityNotice(item.propId) ? (\n            <p role="note" className="mt-2 rounded-lg border border-warn/30 bg-warn/10 p-2 text-[0.64rem] leading-relaxed text-warn">\n              품질 개선 대상으로 새 추가가 중단되었습니다. 기존 장면의 부착과 편집은 유지됩니다. {studioVrmPropQualityNotice(item.propId)}\n            </p>\n          ) : null}'],
  ['      <details className="group mt-4 rounded-xl border border-line bg-panel/45">', '      <p className="mt-3 text-[0.64rem] leading-relaxed text-fg-3">\n        품질 개선 중인 소품은 새 추가 목록에서 제외했습니다. 기존 장착 소품은 그대로 유지됩니다.\n      </p>\n      <details className="group mt-4 rounded-xl border border-line bg-panel/45">'],
]);

patch("src/domains/creator/vrm/useStudioVrmPoserRuntimeE.ts", "16b8d5974372c6d525959cac3413adf547a7f24d", [
  ['  createPropInstance,\n', ''],
  ['} from "./studio-vrm-props";', '} from "./studio-vrm-props";\nimport { createSelectableStudioVrmPropInstance as createPropInstance } from "./studio-vrm-prop-selection";'],
]);
console.log("Applied catalogue, recommendation, legacy notice, and rail insertion boundaries.");
