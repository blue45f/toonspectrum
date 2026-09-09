from pathlib import Path

path = Path(
    "apps/web/src/domains/creator/scene3d/studio-scene3d-document-contract-hardening.test.ts"
)
text = path.read_text(encoding="utf-8")

old_import = '''import {
  assertStudioScene3dDocument,
  createStudioScene3dDocument,
} from "./studio-scene3d-document";

function mutableDocument() {
  return structuredClone(createStudioScene3dDocument("contract-test"));
}
'''
new_import = '''import {
  assertStudioScene3dDocument,
  createStudioScene3dDocument,
  type StudioScene3dDocumentV1,
} from "./studio-scene3d-document";

type DeepMutable<T> = T extends readonly (infer Item)[]
  ? DeepMutable<Item>[]
  : T extends object
    ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
    : T;

function mutableDocument(): DeepMutable<StudioScene3dDocumentV1> {
  return structuredClone(
    createStudioScene3dDocument("contract-test"),
  ) as DeepMutable<StudioScene3dDocumentV1>;
}
'''
if text.count(old_import) != 1:
    raise SystemExit("Scene3D contract test fixture anchor changed")
path.write_text(text.replace(old_import, new_import, 1), encoding="utf-8")
