import { collectDialogueItems } from "../lettering/studio-dialogue-batch";
import { SOURCE_LOCALE, applyDialogueTranslations, switchDialogueLocale } from "../lettering/studio-dialogue-translate";
import type { PageState } from "../studio-page-state";
import { normalizePageReviewState } from "../studio-page-review";
import { BETA_FEEDBACK_PACKAGE_SCHEMA, type EcosystemRecord, type TranslationDraft } from "./ecosystem-record";

export interface DialogueRow { pageId: string; elementId: string; source: string; name: string }
export function dialogueRows(pages: readonly PageState[]): DialogueRow[] {
  return collectDialogueItems(pages).map(item => ({ pageId: item.pageId, elementId: item.id,
    source: pages.find(page => page.id === item.pageId)?.dialogueI18n?.[item.id]?.[SOURCE_LOCALE] ?? item.text,
    name: item.id }));
}
/** A change hint, not a cryptographic signature, authorship claim or authorization mechanism. */
export function pageFingerprint(page: PageState): string {
  const value = JSON.stringify(page);
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return `v1-${value.length}-${(hash >>> 0).toString(16)}`;
}
export function translationState(row: DialogueRow, draft: TranslationDraft | undefined): "missing" | "stale" | "draft" | "approved" {
  if (!draft) return "missing";
  if (draft.source !== row.source) return "stale";
  return draft.approved ? "approved" : "draft";
}
export function validateAiTranslations(value: unknown, rows: readonly DialogueRow[]): Array<{ elementId: string; text: string }> {
  if (!Array.isArray(value) || value.length !== rows.length || value.length > 20) throw new Error("선택한 대사 수와 AI 결과 수가 다릅니다.");
  const expected = new Set(rows.map(row => row.elementId));
  const seen = new Set<string>();
  return value.map(item => {
    if (!item || typeof item !== "object" || typeof item.id !== "string" || !expected.has(item.id) || seen.has(item.id)
      || typeof item.text !== "string" || !item.text.trim() || item.text.length > 12_000) throw new Error("AI 번역 결과의 ID·중복·텍스트를 확인하지 못했습니다.");
    seen.add(item.id); return { elementId: item.id, text: item.text.trim() };
  });
}
export function applyApprovedTranslations(pages: readonly PageState[], drafts: readonly TranslationDraft[], locale: string): readonly PageState[] {
  const rows = dialogueRows(pages);
  const editable = pages.filter(page => !normalizePageReviewState(page.review).locked);
  const results = drafts.filter(draft => {
    const row = rows.find(item => item.pageId === draft.pageId && item.elementId === draft.elementId);
    const element = editable.find(page => page.id === draft.pageId)?.elements.find(item => item.id === draft.elementId);
    return draft.locale === locale && row && element && !element.locked && translationState(row, draft) === "approved";
  }).map(draft => ({ id: draft.elementId, pageId: draft.pageId, text: draft.text }));
  if (!results.length) return pages;
  const merged = applyDialogueTranslations(pages, results, locale);
  const targetIds = new Set(results.map(item => `${item.pageId}:${item.id}`));
  return merged.map(page => {
    const switched = switchDialogueLocale([page], locale)[0];
    if (switched === page) return page;
    return { ...page, elements: page.elements.map(element => targetIds.has(`${page.id}:${element.id}`)
      ? switched.elements.find(item => item.id === element.id) ?? element : element) };
  });
}
export interface WorldImpact { pageId: string; elementId: string; entity: string; value: string; locked: boolean }
export function worldImpacts(pages: readonly PageState[], released: readonly string[]): WorldImpact[] {
  return pages.flatMap(page => page.elements.flatMap(element => {
    if (element.type !== "draw" || !element.name?.startsWith("world:")) return [];
    const value = element.kind === "line" || element.kind === "freehand" ? element.stroke : element.fill;
    return value ? [{ pageId: page.id, elementId: element.id, entity: element.name, value,
      locked: Boolean(element.locked || normalizePageReviewState(page.review).locked || released.includes(page.id)) }] : [];
  }));
}
export function applyWorldChange(pages: readonly PageState[], released: readonly string[], entity: string, before: string, after: string, selected: readonly string[]): readonly PageState[] {
  if (!/^#[0-9a-f]{6}$/iu.test(after)) throw new Error("변경 색상은 6자리 HEX 값으로 입력하세요.");
  const targets = new Map(worldImpacts(pages, released).filter(item => item.entity === entity && item.value === before && !item.locked && selected.includes(item.pageId)).map(item => [`${item.pageId}:${item.elementId}`, item]));
  let changed = false;
  const next = pages.map(page => {
    let pageChanged = false;
    const elements = page.elements.map(element => {
      if (element.type !== "draw" || !targets.has(`${page.id}:${element.id}`)) return element;
      pageChanged = true;
      return element.kind === "line" || element.kind === "freehand" ? { ...element, stroke: after } : { ...element, fill: after };
    });
    if (!pageChanged) return page;
    changed = true; return { ...page, elements };
  });
  return changed ? next : pages;
}
export function importBetaFeedback(raw: unknown, record: EcosystemRecord): EcosystemRecord {
  const pack = BETA_FEEDBACK_PACKAGE_SCHEMA.parse(raw);
  const receipt = record.betaReceipts.find(item => item.id === pack.packageId && item.documentId === pack.documentId);
  if (pack.documentId !== record.documentId || !receipt) throw new Error("이 문서에서 만든 검토 패키지가 아닙니다.");
  const existing = new Set(record.feedback.map(item => item.id));
  const incoming = pack.feedback.filter(item => !existing.has(item.id));
  if (new Set(incoming.map(item => item.id)).size !== incoming.length || incoming.some(item => item.packageId !== pack.packageId || !Object.hasOwn(receipt.fingerprints, item.pageId))) throw new Error("검토 대상 페이지 또는 응답 ID가 올바르지 않습니다.");
  if (record.feedback.length + incoming.length > 500) throw new Error("검토 응답은 문서당 500개까지 보관합니다. 기존 응답을 백업하세요.");
  return { ...record, feedback: [...record.feedback, ...incoming] };
}
