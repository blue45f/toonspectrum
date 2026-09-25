import { describe, expect, it } from "vitest";
import { createStudioOpfsAssetStore } from "../studio-opfs-asset-store";
import { createStudioOpfsMemoryFileSystem } from "../studio-opfs-filesystem";
import { buildStudioProjectArchive, importStudioProjectArchive } from "../studio-project-archive";
import { installStudioPsdSourceArchive, prepareStudioPsdSourceArchiveExport } from "./studio-psd-source-archive";
import { readStudioPsdSource, storeStudioPsdSource } from "./studio-psd-source";

function sourceFile(): File {
  const bytes = new Uint8Array(30);
  bytes.set([0x38, 0x42, 0x50, 0x53, 0, 1]);
  new DataView(bytes.buffer).setUint16(12, 3);
  new DataView(bytes.buffer).setUint32(14, 1);
  new DataView(bytes.buffer).setUint32(18, 1);
  new DataView(bytes.buffer).setUint16(22, 8);
  new DataView(bytes.buffer).setUint16(24, 3);
  bytes.set([10, 20, 30, 40], 26);
  return new File([bytes], "원본.psd");
}
function storage() { return createStudioOpfsAssetStore({ fs: createStudioOpfsMemoryFileSystem() }); }

describe("PSD 원본 CAS·아카이브 보존", () => {
  it("원본 바이트를 중복 없이 보존하고 다른 저장소에서 아카이브로 정확히 복구한다", async () => {
    const first = storage();
    const original = sourceFile();
    const source = await storeStudioPsdSource(original, first);
    const duplicate = await storeStudioPsdSource(original, first);
    expect(duplicate.hash).toBe(source.hash);
    expect(await first.list()).toHaveLength(1);
    const project = {
      version: 2, pagesList: [{ id: "page", elements: [
        { id: "layer", type: "image", src: "", psdSource: source },
        { id: "second", type: "image", src: "", psdSource: source },
      ], bg: "#fff", bgGrad: null, canvasH: 100 }],
    };
    const attachments = await prepareStudioPsdSourceArchiveExport(project, first);
    expect(attachments).toHaveLength(1);
    expect(attachments[0]?.documentReferences).toHaveLength(2);
    const archive = await buildStudioProjectArchive({ project, attachments }, { crc32ExecutionMode: "direct-headless" });
    expect(archive.isSelfContained).toBe(true);
    expect(archive.canonicalProjectJson).not.toContain("data:");
    const restored = await importStudioProjectArchive(archive.blob);
    const second = storage();
    await installStudioPsdSourceArchive(restored, second);
    expect(await readStudioPsdSource(source, second)).toEqual(new Uint8Array(await original.arrayBuffer()));
    expect(restored.manifest.attachments[0]?.path).toMatch(/\.psd$/u);
    expect(await second.ownerRefs(`psd-original:${source.hash}`)).toEqual([source.hash]);
  });

  it("원본 누락·손상·위조 참조를 조용히 성공으로 처리하지 않는다", async () => {
    const first = storage();
    const source = await storeStudioPsdSource(sourceFile(), first);
    await expect(readStudioPsdSource(source, storage())).rejects.toThrow("원본이 없어요");
    const project = { version: 2, pagesList: [{ id: "page", elements: [{ id: "layer", type: "image", src: "", psdSource: source }], bg: "#fff", bgGrad: null, canvasH: 100 }] };
    await expect(buildStudioProjectArchive({ project })).rejects.toThrow("원본을 포함하지 않은 아카이브");
    await expect(storeStudioPsdSource(new File(["not a PSD"], "wrong.psd"), first)).rejects.toThrow("서명 또는 크기");
    await expect(prepareStudioPsdSourceArchiveExport({ psdSource: { ...source, hash: "javascript:alert(1)" } }, first)).rejects.toThrow("참조가 손상");
  });
});
