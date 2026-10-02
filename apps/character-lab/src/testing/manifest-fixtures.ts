/**
 * Blender 제작 패키지 manifest fixture(pipeline.py 실측 형식).
 */
import type { CharacterPackageManifest } from "../contracts";

/** face.py `_shape_specs`가 만드는 shape key 24종(실측) */
export const BLENDER_FACE_SHAPE_KEYS: readonly string[] = [
  "faceEyeSizeBig",
  "faceEyeSizeSmall",
  "faceEyeSpacingWide",
  "faceEyeSpacingNarrow",
  "faceEyeTiltUp",
  "faceEyeTiltDown",
  "faceNoseHeightHigh",
  "faceNoseHeightLow",
  "faceNoseWidthWide",
  "faceNoseWidthNarrow",
  "faceNoseDepthHigh",
  "faceNoseDepthLow",
  "faceMouthWidthWide",
  "faceMouthWidthNarrow",
  "faceLipFullnessHigh",
  "faceLipFullnessLow",
  "faceJawWidthWide",
  "faceJawWidthNarrow",
  "faceChinLengthLong",
  "faceChinLengthShort",
  "faceCheekVolumeHigh",
  "faceCheekVolumeLow",
  "faceEarSizeBig",
  "faceEarSizeSmall",
];

export const FIXTURE_GLB_SHA256 = "0".repeat(64);

export interface ManifestFixtureOverrides {
  readonly characterId?: string;
  readonly hairStyle?: CharacterPackageManifest["capabilities"]["authoredHair"]["style"];
  readonly shapeKeys?: readonly string[];
  readonly qualityPassed?: boolean;
  readonly glbSha256?: string;
  readonly glbBytes?: number;
  readonly withVrm?: boolean;
  readonly characterLab?: CharacterPackageManifest["characterLab"];
}

/** JSON으로 직렬화해도 같은 구조(알 수 없는 상위 키 보존 테스트용 `provenance`·`extraTopLevel` 포함) */
export function characterPackageManifestFixture(overrides: ManifestFixtureOverrides = {}): CharacterPackageManifest {
  const characterId = overrides.characterId ?? "mina";
  const style = overrides.hairStyle === undefined ? "soft-bob" : overrides.hairStyle;
  const files: CharacterPackageManifest["files"] = {
    glb: { path: `${characterId}.glb`, bytes: overrides.glbBytes ?? 1024, sha256: overrides.glbSha256 ?? FIXTURE_GLB_SHA256 },
    qualityReport: { path: "quality-report.json", bytes: 256, sha256: "1".repeat(64) },
    thumbnail: { path: "thumbnail.png", bytes: 512, sha256: "2".repeat(64) },
    "preview:front": { path: "preview-front.png", bytes: 2048, sha256: "3".repeat(64) },
  };
  if (overrides.withVrm) files.vrm = { path: `${characterId}.vrm`, bytes: 4096, sha256: "4".repeat(64) };
  return {
    schemaVersion: 1,
    kind: "toonstudio.character-package",
    characterId,
    displayName: "미나",
    configDigest: "cfg-0123456789abcdef",
    pipelineVersion: 1,
    capabilities: {
      authoredHair: {
        enabled: style !== null,
        style,
        lodTriangles: style === null ? [] : [12000, 6000, 3000],
        replacedSourceMeshes: style === null ? [] : ["Hair_Source"],
      },
      semanticFaceShapes: {
        mode: "procedural",
        confidence: 0.92,
        objects: ["Face"],
        shapeKeys: [...(overrides.shapeKeys ?? BLENDER_FACE_SHAPE_KEYS)],
      },
      mtoonReady: true,
      vrmCustomExpressions: { status: "ok", names: ["happy", "angry", "sad", "surprised", "blink"] },
      lods: style !== null,
    },
    quality: { score: 0.91, passed: overrides.qualityPassed ?? true, minimumScore: 0.8, report: "quality-report.json" },
    files,
    provenance: { blenderVersion: "4.2.0", kitVersion: "0.3.0", sourceActualSha256: "5".repeat(64) },
    ...(overrides.characterLab ? { characterLab: overrides.characterLab } : {}),
  };
}

/** index.json fixture */
export function characterPackageIndexFixture(characterIds: readonly string[] = ["mina"]) {
  return {
    packages: characterIds.map((id) => ({
      characterId: id,
      displayName: id,
      baseUrl: `/assets/characters/${id}`,
      licenseNote: "ToonStudio 내부 제작(원본 라이선스: 자체 제작)",
    })),
  };
}
