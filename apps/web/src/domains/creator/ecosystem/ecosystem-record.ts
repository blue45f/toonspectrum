import { z } from "zod";

const id = z.string().min(1).max(200);
const instant = z.string().datetime();
const text = z.string().max(12_000);
const image = z.string().max(600_000).regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/u);
export const TRANSLATION_SCHEMA = z.object({ id, pageId: id, elementId: id, source: text,
  locale: z.string().regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/u), text,
  approved: z.boolean(), updatedAt: instant }).strict();
export const WORLD_CHANGE_SCHEMA = z.object({ id, entity: id, before: z.string().max(500), after: z.string().max(500),
  pageIds: z.array(id).max(500), createdAt: instant }).strict();
export const FEEDBACK_SCHEMA = z.object({ id, packageId: id, pageId: id, panelId: id.nullable(),
  clarity: z.number().int().min(1).max(5), readability: z.number().int().min(1).max(5),
  curiosity: z.number().int().min(1).max(5), comment: z.string().max(2000), createdAt: instant }).strict();
export const PROCESS_SCHEMA = z.object({ id, pageId: id, label: z.string().min(1).max(80),
  preview: image, fingerprint: z.string().max(100), createdAt: instant }).strict();
export const BETA_RECEIPT_SCHEMA = z.object({ id, documentId: id,
  fingerprints: z.record(id, z.string().max(100)), createdAt: instant }).strict();
export const ECOSYSTEM_RECORD_SCHEMA = z.object({ version: z.literal(1), documentId: id,
  revision: z.number().int().nonnegative(), translations: z.array(TRANSLATION_SCHEMA).max(1000),
  worldChanges: z.array(WORLD_CHANGE_SCHEMA).max(200), releasedPageIds: z.array(id).max(500),
  feedback: z.array(FEEDBACK_SCHEMA).max(500), process: z.array(PROCESS_SCHEMA).max(8),
  betaReceipts: z.array(BETA_RECEIPT_SCHEMA).max(50) }).strict();
export type EcosystemRecord = z.infer<typeof ECOSYSTEM_RECORD_SCHEMA>;
export type TranslationDraft = z.infer<typeof TRANSLATION_SCHEMA>;
export type BetaFeedback = z.infer<typeof FEEDBACK_SCHEMA>;
export type ProcessCheckpoint = z.infer<typeof PROCESS_SCHEMA>;
export const BETA_PACKAGE_SCHEMA = z.object({ kind: z.literal("toonstudio-beta"), version: z.literal(1), id,
  documentId: id, title: z.string().min(1).max(120), createdAt: instant, rightsAcknowledged: z.literal(true),
  pages: z.array(z.object({ id, image, fingerprint: z.string().max(100),
    panels: z.array(z.object({ id, label: z.string().max(100) }).strict()).max(200),
    dialogue: z.array(z.string().max(12_000)).max(300) }).strict()).min(1).max(12) }).strict();
export const BETA_FEEDBACK_PACKAGE_SCHEMA = z.object({ kind: z.literal("toonstudio-beta-feedback"), version: z.literal(1),
  packageId: id, documentId: id, feedback: z.array(FEEDBACK_SCHEMA).min(1).max(100) }).strict();
export const PROCESS_PACKAGE_SCHEMA = z.object({ kind: z.literal("toonstudio-process"), version: z.literal(1),
  title: z.string().min(1).max(120), credit: z.string().max(500), rightsAcknowledged: z.literal(true),
  checkpoints: z.array(PROCESS_SCHEMA).min(1).max(8), sampleId: z.string().max(100).nullable() }).strict();
export type BetaPackage = z.infer<typeof BETA_PACKAGE_SCHEMA>;
export type ProcessPackage = z.infer<typeof PROCESS_PACKAGE_SCHEMA>;
export function emptyEcosystemRecord(documentId: string): EcosystemRecord {
  return ECOSYSTEM_RECORD_SCHEMA.parse({ version: 1, documentId, revision: 0, translations: [],
    worldChanges: [], releasedPageIds: [], feedback: [], process: [], betaReceipts: [] });
}
export function parseEcosystemRecord(serialized: string, documentId: string): EcosystemRecord {
  if (serialized.length > 5 * 1024 * 1024) throw new Error("제작 기록은 5MiB 이하로 제한됩니다.");
  const record = ECOSYSTEM_RECORD_SCHEMA.parse(JSON.parse(serialized));
  if (record.documentId !== documentId) throw new Error("다른 문서의 제작 기록입니다. 기존 기록을 덮어쓰지 않았습니다.");
  return record;
}
export function isRasterPreview(value: string): boolean {
  try {
    const data = atob(value.slice(value.indexOf(",") + 1, value.indexOf(",") + 65));
    if (value.startsWith("data:image/png;")) return [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => data.charCodeAt(index) === byte);
    if (value.startsWith("data:image/jpeg;")) return data.charCodeAt(0) === 255 && data.charCodeAt(1) === 216 && data.charCodeAt(2) === 255;
    return value.startsWith("data:image/webp;") && data.startsWith("RIFF") && data.slice(8, 12) === "WEBP";
  } catch { return false; }
}
