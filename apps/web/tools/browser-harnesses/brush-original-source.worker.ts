import { importBrushFromJson, writeBrushJson } from "../../src/domains/creator/brush/studio-brush-library";
import { createSqliteBrushLibraryRepository, studioBrushToSqlRecord } from "../../src/domains/creator/brush/studio-brush-library-sqlite-repository";
import { decodeStudioBrushOriginalSource, type StudioBrushOriginalSource } from "../../src/domains/creator/brush/studio-brush-original-source";
import { prepareStudioBrushSourceExport } from "../../src/domains/creator/brush/studio-brush-original-source-store";
import { commitStudioBrushPackImport, importStudioMybBytes, importStudioKppBytes } from "../../src/domains/creator/brush/studio-brush-pack-import";
import { openStudioLocalDatabase, type StudioSqliteApiHandle } from "../../src/domains/creator/studio-local-database";

type Receipt = { id: string; sha256: string; bytes: number; format: string; source: StudioBrushOriginalSource };
async function run(message: { phase: "write" | "reopen"; receipts?: Receipt[] }) {
  if (!globalThis.crossOriginIsolated || !navigator.storage?.getDirectory || !navigator.locks) throw new Error("Real OPFS prerequisites absent");
  const module = await import("@sqlite.org/sqlite-wasm");
  const sqlite = await module.default() as unknown as StudioSqliteApiHandle;
  const db = await openStudioLocalDatabase({ vfs: "opfs", loadSqlite: async () => sqlite });
  const repository = createSqliteBrushLibraryRepository(db);
  const receipts: Receipt[] = [];
  try {
    if (message.phase === "write") {
      for (const format of ["myb", "kpp"] as const) {
        const url = format === "myb"
          ? new URL("../../../../tests/corpus/brushes/myb/ink-crisp.myb", import.meta.url)
          : new URL("../../../../tests/corpus/brushes/kpp/paintbrush-ink-basic.kpp", import.meta.url);
        const response = await fetch(url); if (!response.ok) throw new Error("Corpus fetch failed");
        const bytes = new Uint8Array(await response.arrayBuffer());
        const imported = format === "myb" ? importStudioMybBytes(bytes, "original.myb") : importStudioKppBytes(bytes, "original.kpp");
        const committed = await commitStudioBrushPackImport(imported, repository);
        const saved = (await repository.getById(committed.materialized[0]!.id))!;
        if (saved.originalSource?.encoding !== "opfs-cas") throw new Error("Not a CAS reference");
        if (studioBrushToSqlRecord(saved).payload.includes("base64")) throw new Error("Inline original leaked into SQL");
        const updated = await repository.put({ ...saved, name: "보존 원본", strokeWidth: 29 });
        const duplicate = (await repository.duplicate(updated.id))!;
        const deleted = (await repository.delete(updated.id))!; await repository.restore(deleted);
        if (duplicate.originalSource?.sha256 !== saved.originalSource.sha256) throw new Error("Duplicate lost provenance");
        receipts.push({ id: duplicate.id, sha256: saved.originalSource.sha256, bytes: bytes.length, format, source: saved.originalSource });
      }
    } else {
      if (message.receipts?.length !== 2) throw new Error("Missing reopen receipts");
      for (const receipt of message.receipts) {
        const saved = await repository.getById(receipt.id);
        if (saved?.originalSource?.sha256 !== receipt.sha256 || saved.strokeWidth !== 29) throw new Error("OPFS reopen mismatch");
        const archived = writeBrushJson(await prepareStudioBrushSourceExport(saved));
        const restored = importBrushFromJson(archived).brush;
        const decoded = decodeStudioBrushOriginalSource(restored.originalSource);
        if (decoded.length !== receipt.bytes || restored.originalSource?.sha256 !== receipt.sha256) throw new Error("Export lost original");
        receipts.push(receipt);
      }
    }
  } finally { await db.close(); }
  return { phase: message.phase, receipts, databaseClosed: true, authority: "sqlite-opfs", originalBytes: "opfs-cas" };
}
const workerPort = globalThis as unknown as { postMessage(value: unknown): void };
globalThis.addEventListener("message", (event: MessageEvent) => {
  run(event.data).then((value) => workerPort.postMessage({ ok: true, value }),
    (error) => workerPort.postMessage({ ok: false, error: String(error) }));
});
