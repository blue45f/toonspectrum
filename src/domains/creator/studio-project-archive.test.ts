import { describe, expect, it } from "vitest";

import {
  appendStudioAiOperation,
  createEmptyStudioAiProvenanceDocument,
} from "./studio-ai-provenance";
import {
  buildStudioPackageArchiveBlob,
} from "./studio-package-archive";
import {
  buildStudioProjectArchive,
  importStudioProjectArchive,
  resolveStudioProjectArchiveAttachment,
  STUDIO_PROJECT_ARCHIVE_ASSET_URI_PREFIX,
  STUDIO_PROJECT_ARCHIVE_MIME,
  StudioProjectArchiveError,
  type StudioProjectArchiveAttachmentInput,
  type StudioProjectArchiveManifest,
} from "./studio-project-archive";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const EOCD_SIGNATURE = 0x06054b50;

function minimalPage(elements: unknown[] = [], bg = "#ffffff") {
  return { id: "page-1", elements, bg, bgGrad: null, canvasH: 1_080 };
}

function projectWith(elements: unknown[] = [], extra: Record<string, unknown> = {}) {
  return {
    version: 2,
    title: "기억 시장",
    description: "archive round trip",
    tagsText: "판타지",
    pagesList: [minimalPage(elements)],
    currentPageId: "page-1",
    webtoonTheme: "classic",
    panelGutter: 24,
    ...extra,
  };
}

function pngBytes(seed = 1): Uint8Array {
  return Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, seed]);
}

function gifBytes(seed = 1): Uint8Array {
  return Uint8Array.from([...encoder.encode("GIF89a"), seed]);
}

function glbBytes(seed = 0, externalImage = false): Uint8Array {
  const document = JSON.stringify({
    asset: { version: "2.0" },
    extras: { seed },
    ...(externalImage ? { images: [{ uri: "external-texture.png" }] } : {}),
  });
  const encoded = encoder.encode(document);
  const jsonLength = Math.ceil(encoded.length / 4) * 4;
  const bytes = new Uint8Array(12 + 8 + jsonLength);
  bytes.set(encoder.encode("glTF"), 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.byteLength, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f_534a, true);
  bytes.fill(0x20, 20);
  bytes.set(encoded, 20);
  return bytes;
}

function wavBytes(): Uint8Array {
  return Uint8Array.from([
    ...encoder.encode("RIFF"),
    4, 0, 0, 0,
    ...encoder.encode("WAVE"),
  ]);
}

function dataUrl(mimeType: string, bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${mimeType};base64,${btoa(binary)}`;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, "0")).join("");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "number" || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value !== "object") throw new Error("not canonical JSON");
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

function uint16(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 2).getUint16(0, true);
}

function uint32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, true);
}

function setUint16(bytes: Uint8Array, offset: number, value: number): void {
  new DataView(bytes.buffer, bytes.byteOffset + offset, 2).setUint16(0, value, true);
}

function setUint32(bytes: Uint8Array, offset: number, value: number): void {
  new DataView(bytes.buffer, bytes.byteOffset + offset, 4).setUint32(0, value, true);
}

function centralOffset(bytes: Uint8Array): number {
  const eocd = bytes.length - 22;
  expect(uint32(bytes, eocd)).toBe(EOCD_SIGNATURE);
  return uint32(bytes, eocd + 16);
}

function replaceEntryPath(bytes: Uint8Array, from: string, to: string): Uint8Array {
  if (encoder.encode(from).length !== encoder.encode(to).length) throw new Error("same byte length required");
  const output = bytes.slice();
  const fromBytes = encoder.encode(from);
  const toBytes = encoder.encode(to);
  const central = centralOffset(output);
  let cursor = 0;
  while (cursor < central) {
    expect(uint32(output, cursor)).toBe(LOCAL_SIGNATURE);
    const compressed = uint32(output, cursor + 18);
    const nameLength = uint16(output, cursor + 26);
    const extraLength = uint16(output, cursor + 28);
    const nameOffset = cursor + 30;
    if (decoder.decode(output.subarray(nameOffset, nameOffset + nameLength)) === from) {
      output.set(toBytes, nameOffset);
    }
    cursor = nameOffset + nameLength + extraLength + compressed;
  }
  cursor = central;
  const eocd = output.length - 22;
  while (cursor < eocd) {
    expect(uint32(output, cursor)).toBe(CENTRAL_SIGNATURE);
    const nameLength = uint16(output, cursor + 28);
    const extraLength = uint16(output, cursor + 30);
    const commentLength = uint16(output, cursor + 32);
    const nameOffset = cursor + 46;
    const name = output.subarray(nameOffset, nameOffset + nameLength);
    if (name.length === fromBytes.length && decoder.decode(name) === from) output.set(toBytes, nameOffset);
    cursor = nameOffset + nameLength + extraLength + commentLength;
  }
  return output;
}

function corruptEntryData(bytes: Uint8Array, path: string): Uint8Array {
  const output = bytes.slice();
  const central = centralOffset(output);
  let cursor = 0;
  while (cursor < central) {
    const compressed = uint32(output, cursor + 18);
    const nameLength = uint16(output, cursor + 26);
    const extraLength = uint16(output, cursor + 28);
    const nameOffset = cursor + 30;
    const name = decoder.decode(output.subarray(nameOffset, nameOffset + nameLength));
    const dataOffset = nameOffset + nameLength + extraLength;
    if (name === path) {
      output[dataOffset] = (output[dataOffset] ?? 0) ^ 0xff;
      return output;
    }
    cursor = dataOffset + compressed;
  }
  throw new Error(`entry not found: ${path}`);
}

function makeZipBombDeclaration(bytes: Uint8Array): Uint8Array {
  const output = bytes.slice();
  const central = centralOffset(output);
  setUint16(output, central + 10, 8);
  setUint32(output, central + 20, 1);
  setUint32(output, central + 24, 0x1000_0000);
  return output;
}

async function expectArchiveError(
  action: Promise<unknown>,
  code: StudioProjectArchiveError["code"]
): Promise<StudioProjectArchiveError> {
  try {
    await action;
  } catch (cause) {
    expect(cause).toBeInstanceOf(StudioProjectArchiveError);
    expect(cause).toMatchObject({ code });
    return cause as StudioProjectArchiveError;
  }
  throw new Error(`expected ${code}`);
}

interface ManualArchiveOptions {
  bytes: Uint8Array;
  declaredHash?: string;
  includeAttachment?: boolean;
  includeUnexpected?: boolean;
  declaredByteSize?: number;
}

async function manualRasterArchive(options: ManualArchiveOptions): Promise<Blob> {
  const actualHash = await sha256(options.bytes);
  const declaredHash = options.declaredHash ?? actualHash;
  const path = `assets/sha256/${declaredHash}.png`;
  const project = projectWith([], {});
  project.pagesList[0]!.bg = `${STUDIO_PROJECT_ARCHIVE_ASSET_URI_PREFIX}${declaredHash}`;
  const projectJson = canonicalJson(project);
  const projectBytes = encoder.encode(projectJson);
  const byteSize = options.declaredByteSize ?? options.bytes.length;
  const manifest: StudioProjectArchiveManifest = {
    schema: "toonspectrum.studio-project-archive",
    version: 1,
    project: {
      path: "project.json",
      mimeType: "application/json",
      byteSize: projectBytes.length,
      sha256: await sha256(projectBytes),
    },
    attachments: [{
      path,
      mimeType: "image/png",
      byteSize,
      sha256: declaredHash,
      kinds: ["raster"],
      documentReferences: [{ pointer: "/pagesList/0/bg", usage: "raster" }],
    }],
    totals: {
      entryCount: 3,
      attachmentCount: 1,
      attachmentBytes: byteSize,
      contentBytes: projectBytes.length + byteSize,
    },
  };
  const entries: Array<{ path: string; data: Uint8Array }> = [
    { path: "manifest.json", data: encoder.encode(canonicalJson(manifest)) },
    { path: "project.json", data: projectBytes },
  ];
  if (options.includeAttachment !== false) entries.push({ path, data: options.bytes });
  if (options.includeUnexpected) entries.push({ path: "unexpected.bin", data: Uint8Array.of(1) });
  return buildStudioPackageArchiveBlob(entries);
}

function retainedProvenance() {
  return appendStudioAiOperation(
    createEmptyStudioAiProvenanceDocument(),
    {
      id: "private-op",
      kind: "image",
      task: "background-image",
      provider: "provider",
      model: "model",
      transport: "byok",
      promptVersion: 1,
      prompt: "비공개 원문 프롬프트",
      status: "succeeded",
      createdAt: "2026-07-10T00:00:00.000Z",
      references: [],
    },
    { retainRawPrompt: true }
  );
}

describe("studio-project-archive", () => {
  it("canonical project.json에서 래스터·마스크·참고 data URL을 한 해시로 중복 제거하고 안전하게 왕복한다", async () => {
    const image = pngBytes(7);
    const embedded = dataUrl("image/png", image);
    const result = await buildStudioProjectArchive({
      project: projectWith(
        [{
          id: "image-1",
          type: "image",
          src: embedded,
          maskSrc: embedded,
          referenceThumbnail: embedded,
          assetUrl: "https://assets.example.test/private?id=1",
        }],
        {
          deepseekApiKey: "must-not-survive",
          aiProvenance: retainedProvenance(),
        }
      ),
    });

    expect(result.blob.type).toBe(STUDIO_PROJECT_ARCHIVE_MIME);
    expect(result.manifest.attachments).toHaveLength(1);
    expect(result.manifest.attachments[0]).toMatchObject({
      mimeType: "image/png",
      byteSize: image.length,
      kinds: ["raster", "mask", "reference"],
    });
    expect(result.manifest.attachments[0]!.path).toMatch(/^assets\/sha256\/[a-f0-9]{64}\.png$/u);
    expect(result.manifest.attachments[0]!.documentReferences.map(({ pointer }) => pointer)).toEqual([
      "/pagesList/0/elements/0/maskSrc",
      "/pagesList/0/elements/0/referenceThumbnail",
      "/pagesList/0/elements/0/src",
    ]);
    expect(result.canonicalProjectJson).not.toContain("data:image");
    expect(result.canonicalProjectJson).not.toContain("must-not-survive");
    expect(result.canonicalProjectJson).not.toContain("비공개 원문 프롬프트");
    expect(result.diagnostics.map(({ code }) => code)).toEqual(expect.arrayContaining([
      "PRIVACY_FIELD_REMOVED",
      "EXTERNAL_PROJECT_DEPENDENCY",
    ]));
    expect(result.isSelfContained).toBe(false);

    const imported = await importStudioProjectArchive(result.blob);
    const element = imported.project.pagesList[0]!.elements[0] as Record<string, unknown>;
    expect(element.src).toBe(embedded);
    expect(element.maskSrc).toBe(embedded);
    expect(element.referenceThumbnail).toBe(embedded);
    expect(imported.attachments).toHaveLength(1);
    expect(imported.canonicalProject.pagesList[0]!.elements[0]).toMatchObject({
      src: expect.stringMatching(/^toonspectrum-asset:\/\/sha256\/[a-f0-9]{64}$/u),
    });
    expect(JSON.stringify(imported.project)).not.toContain("비공개 원문 프롬프트");
    expect(imported.diagnostics.map(({ code }) => code)).toContain("EXTERNAL_PROJECT_DEPENDENCY");
    expect(imported.isSelfContained).toBe(false);

    const referenceOnly = await importStudioProjectArchive(result.blob, { rehydrateDataUrls: false });
    const referencedElement = referenceOnly.project.pagesList[0]!.elements[0] as Record<string, unknown>;
    expect(referencedElement.src).toMatch(/^toonspectrum-asset:\/\/sha256\/[a-f0-9]{64}$/u);
    expect(resolveStudioProjectArchiveAttachment(referenceOnly.attachments, referencedElement.src)?.blob.type)
      .toBe("image/png");
  });

  it("VRM/GLB 동일 바이트와 glTF/OBJ/audio를 content-addressed로 보존하고 입력 순서와 무관한 ZIP을 만든다", async () => {
    const sharedGlb = glbBytes(9, true);
    const gltf = encoder.encode(JSON.stringify({ asset: { version: "2.0" }, buffers: [{ uri: "mesh.bin" }] }));
    const obj = encoder.encode("mtllib material.mtl\no Cube\nv 0 0 0\nf 1 1 1\n");
    const audio = wavBytes();
    const project = projectWith([{
      id: "binary-links",
      type: "custom",
      vrm: "pending",
      glb: "pending",
      gltf: "pending",
      obj: "pending",
      audio: "pending",
    }]);
    const attachments: StudioProjectArchiveAttachmentInput[] = [
      {
        kind: "vrm",
        data: new Blob([sharedGlb.buffer as ArrayBuffer], { type: "model/gltf-binary" }),
        mimeType: "model/gltf-binary",
        documentReferences: [{ pointer: "/pagesList/0/elements/0/vrm", usage: "vrm" }],
      },
      {
        kind: "glb",
        data: sharedGlb,
        mimeType: "model/gltf-binary",
        documentReferences: [{ pointer: "/pagesList/0/elements/0/glb", usage: "glb" }],
      },
      {
        kind: "gltf",
        data: gltf,
        mimeType: "application/json",
        documentReferences: [{ pointer: "/pagesList/0/elements/0/gltf", usage: "gltf" }],
      },
      {
        kind: "obj",
        data: obj,
        mimeType: "text/plain",
        documentReferences: [{ pointer: "/pagesList/0/elements/0/obj", usage: "obj" }],
      },
      {
        kind: "audio",
        data: audio,
        mimeType: "audio/wav",
        documentReferences: [{ pointer: "/pagesList/0/elements/0/audio", usage: "audio" }],
      },
    ];

    const first = await buildStudioProjectArchive({ project, attachments });
    const second = await buildStudioProjectArchive({ project, attachments: [...attachments].reverse() });
    expect(new Uint8Array(await first.blob.arrayBuffer())).toEqual(new Uint8Array(await second.blob.arrayBuffer()));
    expect(first.manifest.attachments).toHaveLength(4);
    const model = first.manifest.attachments.find(({ kinds }) => kinds.includes("vrm"));
    expect(model).toMatchObject({ mimeType: "model/vrm", kinds: ["vrm", "glb"] });
    expect(model?.path.endsWith(".vrm")).toBe(true);
    expect(first.diagnostics.filter(({ code }) => code === "EXTERNAL_ATTACHMENT_DEPENDENCY")).toHaveLength(3);
    expect(first.isSelfContained).toBe(false);

    const imported = await importStudioProjectArchive(first.blob);
    expect(imported.attachments).toHaveLength(4);
    const links = imported.project.pagesList[0]!.elements[0] as Record<string, unknown>;
    for (const key of ["vrm", "glb", "gltf", "obj", "audio"]) {
      expect(links[key]).toMatch(/^toonspectrum-asset:\/\/sha256\/[a-f0-9]{64}$/u);
    }
    expect(imported.diagnostics.filter(({ code }) => code === "EXTERNAL_ATTACHMENT_DEPENDENCY")).toHaveLength(3);
  });

  it("연결되지 않은 attachment와 외부 프로젝트 의존성을 내용 노출 없는 diagnostic으로 남긴다", async () => {
    const result = await buildStudioProjectArchive({
      project: projectWith([], { referenceAssetUrl: "/external/reference.png" }),
      attachments: [{ kind: "audio", data: wavBytes(), mimeType: "audio/wav" }],
    });
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "ATTACHMENT_ORPHANED", severity: "warning" }),
      expect.objectContaining({ code: "EXTERNAL_PROJECT_DEPENDENCY", severity: "warning" }),
    ]));
    expect(JSON.stringify(result.diagnostics)).not.toContain("reference.png");
  });

  it("legacy studio-project-file 입력을 v2 canonical 경계로 변환해 왕복한다", async () => {
    const built = await buildStudioProjectArchive({
      project: { version: "1.0", title: "과거", pages: [minimalPage()] },
    });
    const imported = await importStudioProjectArchive(built.blob);
    expect(imported.project).toMatchObject({ version: 2, title: "과거", currentPageId: "page-1" });
    expect(imported.manifest.attachments).toEqual([]);
  });

  it("해시와 schema가 맞아도 canonical이 아닌 project.json은 거부한다", async () => {
    const project = projectWith();
    const nonCanonicalProject = JSON.stringify(project, null, 2);
    const projectBytes = encoder.encode(nonCanonicalProject);
    const manifest: StudioProjectArchiveManifest = {
      schema: "toonspectrum.studio-project-archive",
      version: 1,
      project: {
        path: "project.json",
        mimeType: "application/json",
        byteSize: projectBytes.length,
        sha256: await sha256(projectBytes),
      },
      attachments: [],
      totals: {
        entryCount: 2,
        attachmentCount: 0,
        attachmentBytes: 0,
        contentBytes: projectBytes.length,
      },
    };
    const archive = await buildStudioPackageArchiveBlob([
      { path: "manifest.json", data: encoder.encode(canonicalJson(manifest)) },
      { path: "project.json", data: projectBytes },
    ]);
    await expectArchiveError(importStudioProjectArchive(archive), "CANONICAL_JSON_REQUIRED");
  });

  it("명시한 문서 참조가 없거나 서로 다른 attachment가 같은 위치를 차지하면 거부한다", async () => {
    await expectArchiveError(buildStudioProjectArchive({
      project: projectWith([], {
        missingAsset: `${STUDIO_PROJECT_ARCHIVE_ASSET_URI_PREFIX}${"b".repeat(64)}`,
      }),
    }), "ATTACHMENT_MISSING");

    await expectArchiveError(buildStudioProjectArchive({
      project: projectWith(),
      attachments: [{
        kind: "audio",
        data: wavBytes(),
        documentReferences: [{ pointer: "/pagesList/0/missing", usage: "audio" }],
      }],
    }), "DOCUMENT_REFERENCE_MISSING");

    await expectArchiveError(buildStudioProjectArchive({
      project: projectWith([{ id: "x", type: "custom", asset: "pending" }]),
      attachments: [
        {
          kind: "raster",
          data: pngBytes(1),
          documentReferences: [{ pointer: "/pagesList/0/elements/0/asset", usage: "raster" }],
        },
        {
          kind: "raster",
          data: pngBytes(2),
          documentReferences: [{ pointer: "/pagesList/0/elements/0/asset", usage: "raster" }],
        },
      ],
    }), "DOCUMENT_REFERENCE_CONFLICT");
  });

  it("손상된 래스터 data URL을 inline 문자열로 우회 보존하지 않는다", async () => {
    await expectArchiveError(buildStudioProjectArchive({
      project: projectWith([{ id: "bad", type: "image", src: "data:image/png;base64,%%%" }]),
    }), "MIME_SIGNATURE_MISMATCH");
  });

  it("attachment와 archive 브라우저 메모리 상한을 낮춰 강제할 수 있다", async () => {
    await expectArchiveError(buildStudioProjectArchive(
      { project: projectWith(), attachments: [{ kind: "raster", data: pngBytes() }] },
      { limits: { maxAttachmentBytes: 4 } }
    ), "ATTACHMENT_SIZE_LIMIT");

    const built = await buildStudioProjectArchive({ project: projectWith() });
    await expectArchiveError(buildStudioProjectArchive(
      { project: projectWith() },
      { limits: { maxArchiveBytes: 64 } }
    ), "ARCHIVE_SIZE_LIMIT");
    await expectArchiveError(importStudioProjectArchive(built.blob, {
      limits: { maxArchiveBytes: built.blob.size - 1 },
    }), "ARCHIVE_SIZE_LIMIT");
  });

  it("path traversal, 중복 경로, 숨은 압축 폭탄 선언을 중앙 디렉터리 사용 전에 차단한다", async () => {
    const base = await buildStudioProjectArchive({ project: projectWith() });
    const baseBytes = new Uint8Array(await base.blob.arrayBuffer());
    await expectArchiveError(
      importStudioProjectArchive(replaceEntryPath(baseBytes, "project.json", "../evil.json")),
      "PATH_INVALID"
    );
    await expectArchiveError(importStudioProjectArchive(makeZipBombDeclaration(baseBytes)), "ZIP_BOMB");

    const twoAssets = await buildStudioProjectArchive({
      project: projectWith([{ id: "x", type: "custom", first: "a", second: "b" }]),
      attachments: [
        {
          kind: "raster",
          data: pngBytes(1),
          documentReferences: [{ pointer: "/pagesList/0/elements/0/first", usage: "raster" }],
        },
        {
          kind: "raster",
          data: gifBytes(2),
          documentReferences: [{ pointer: "/pagesList/0/elements/0/second", usage: "raster" }],
        },
      ],
    });
    const [first, second] = twoAssets.manifest.attachments;
    expect(first?.path.length).toBe(second?.path.length);
    await expectArchiveError(
      importStudioProjectArchive(replaceEntryPath(
        new Uint8Array(await twoAssets.blob.arrayBuffer()),
        second!.path,
        first!.path
      )),
      "DUPLICATE_PATH"
    );
  });

  it("CRC 손상과 attachment SHA-256 불일치를 각각 구분한다", async () => {
    const built = await buildStudioProjectArchive({
      project: projectWith([], { cover: dataUrl("image/png", pngBytes(3)) }),
    });
    const attachmentPath = built.manifest.attachments[0]!.path;
    await expectArchiveError(
      importStudioProjectArchive(corruptEntryData(new Uint8Array(await built.blob.arrayBuffer()), attachmentPath)),
      "CRC_MISMATCH"
    );

    const wrongHash = "a".repeat(64);
    await expectArchiveError(importStudioProjectArchive(await manualRasterArchive({
      bytes: pngBytes(4),
      declaredHash: wrongHash,
    })), "HASH_MISMATCH");
  });

  it("유효한 해시를 가진 잘못된 MIME 파일 서명과 manifest 크기 위조를 거부한다", async () => {
    await expectArchiveError(importStudioProjectArchive(await manualRasterArchive({
      bytes: encoder.encode("not-a-png"),
    })), "MIME_SIGNATURE_MISMATCH");

    const bytes = pngBytes(5);
    await expectArchiveError(importStudioProjectArchive(await manualRasterArchive({
      bytes,
      declaredByteSize: bytes.length + 1,
    })), "ATTACHMENT_SIZE_LIMIT");
  });

  it("manifest가 선언한 누락 attachment와 선언하지 않은 추가 파일을 구분한다", async () => {
    await expectArchiveError(importStudioProjectArchive(await manualRasterArchive({
      bytes: pngBytes(6),
      includeAttachment: false,
    })), "ATTACHMENT_MISSING");

    await expectArchiveError(importStudioProjectArchive(await manualRasterArchive({
      bytes: pngBytes(7),
      includeUnexpected: true,
    })), "UNEXPECTED_ENTRY");
  });

  it("가져오기 attachment 수 한도로 과도한 ZIP 항목을 조기에 차단한다", async () => {
    const built = await buildStudioProjectArchive({
      project: projectWith([{ id: "x", type: "custom", first: "a", second: "b" }]),
      attachments: [
        {
          kind: "raster",
          data: pngBytes(1),
          documentReferences: [{ pointer: "/pagesList/0/elements/0/first", usage: "raster" }],
        },
        {
          kind: "raster",
          data: pngBytes(2),
          documentReferences: [{ pointer: "/pagesList/0/elements/0/second", usage: "raster" }],
        },
      ],
    });
    await expectArchiveError(importStudioProjectArchive(built.blob, {
      limits: { maxAttachments: 1 },
    }), "ZIP_ENTRY_COUNT_LIMIT");
  });
});
