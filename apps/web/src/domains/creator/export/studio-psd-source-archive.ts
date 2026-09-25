import { acquireStudioPsdSourceStore, parseStudioPsdSource, readStudioPsdSource, STUDIO_PSD_SOURCE_MIME, validateStudioPsdSourceBytes, type StudioPsdSource } from "./studio-psd-source";
import type { StudioOpfsAssetStore } from "../studio-opfs-asset-store";
import type { ImportStudioProjectArchiveResult, StudioProjectArchiveAttachmentInput } from "../studio-project-archive";

interface PsdSourceReference {
  source: StudioPsdSource;
  pointer: string;
}

export function collectStudioPsdSourceReferences(project: unknown): PsdSourceReference[] {
  const result: PsdSourceReference[] = [];
  const visit = (value: unknown, pointer: string): void => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((entry, index) => visit(entry, `${pointer}/${index}`));
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      const path = `${pointer}/${key.replace(/~/gu, "~0").replace(/\//gu, "~1")}`;
      if (key === "psdSource") {
        const source = parseStudioPsdSource(child);
        if (!source) throw new Error("프로젝트의 PSD 원본 참조가 손상됐어요.");
        result.push({ source, pointer: `${path}/hash` });
      } else visit(child, path);
    }
  };
  visit(project, "");
  return result;
}

export function assertStudioPsdSourceArchiveEvidence(project: unknown, attachments: readonly {
  readonly sha256: string;
  readonly byteSize: number;
  readonly kinds: readonly string[];
  readonly documentReferences: readonly { readonly pointer: string; readonly usage: string; readonly mode?: string }[];
}[]): void {
  for (const { source, pointer } of collectStudioPsdSourceReferences(project)) {
    const attachment = attachments.find((candidate) => candidate.sha256 === source.hash.slice(7));
    if (!attachment || attachment.byteSize !== source.bytes || !attachment.kinds.includes("psd-source")
      || !attachment.documentReferences.some((reference) => reference.pointer === pointer
        && reference.usage === "psd-source" && reference.mode === "sha256-prefixed")) {
      throw new Error(`${source.name}: PSD 원본을 포함하지 않은 아카이브는 완전한 복구 파일로 저장할 수 없어요.`);
    }
  }
}

export async function prepareStudioPsdSourceArchiveExport(
  project: unknown,
  store?: StudioOpfsAssetStore,
): Promise<StudioProjectArchiveAttachmentInput[]> {
  const references = collectStudioPsdSourceReferences(project);
  if (!references.length) return [];
  const storage = store ?? await acquireStudioPsdSourceStore();
  const byHash = new Map<string, PsdSourceReference[]>();
  for (const reference of references) {
    const current = byHash.get(reference.source.hash) ?? [];
    current.push(reference);
    byHash.set(reference.source.hash, current);
  }
  const attachments: StudioProjectArchiveAttachmentInput[] = [];
  for (const group of byHash.values()) {
    const first = group[0];
    if (!first) continue;
    const bytes = await readStudioPsdSource(first.source, storage);
    if (group.some(({ source }) => source.bytes !== bytes.byteLength)) throw new Error("동일한 PSD 원본의 크기 참조가 서로 달라요.");
    attachments.push({
      kind: "psd-source", data: bytes, mimeType: STUDIO_PSD_SOURCE_MIME,
      documentReferences: group.map(({ pointer }) => ({ pointer, usage: "psd-source", mode: "sha256-prefixed" })),
    });
  }
  return attachments;
}

/** 아카이브 검증을 마친 바이트만 기존 CAS에 설치한다. 누락은 조용히 무시하지 않는다. */
export async function installStudioPsdSourceArchive(
  result: ImportStudioProjectArchiveResult,
  store?: StudioOpfsAssetStore,
): Promise<void> {
  const references = collectStudioPsdSourceReferences(result.project);
  if (!references.length) return;
  const storage = store ?? await acquireStudioPsdSourceStore();
  const installed = new Set<string>();
  for (const { source, pointer } of references) {
    const attachment = result.attachments.get(source.hash.slice(7));
    if (!attachment || !attachment.metadata.kinds.includes("psd-source")
      || !attachment.metadata.documentReferences.some((ref) => ref.pointer === pointer && ref.usage === "psd-source")) {
      throw new Error(`${source.name}: 프로젝트 아카이브에 연결된 PSD 원본이 없어요.`);
    }
    if (attachment.blob.size !== source.bytes) throw new Error("PSD 원본의 기록된 크기가 실제 바이트와 달라요.");
    if (installed.has(source.hash)) continue;
    const bytes = new Uint8Array(await attachment.blob.arrayBuffer());
    validateStudioPsdSourceBytes(bytes);
    const stored = await storage.put(bytes, { mime: STUDIO_PSD_SOURCE_MIME });
    if (stored.ref.hash !== source.hash) throw new Error("PSD 원본 SHA-256 검증에 실패했어요.");
    await storage.setOwnerRefs(`psd-original:${source.hash}`, [source.hash]);
    installed.add(source.hash);
  }
}
