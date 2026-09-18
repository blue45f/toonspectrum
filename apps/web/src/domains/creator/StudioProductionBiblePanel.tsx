import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import {
  AlertTriangle,
  BookMarked,
  Box,
  Check,
  Clapperboard,
  Copy,
  Database,
  FileJson,
  Flag,
  Link2,
  MapPinned,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { confirmStudioDestructiveAction } from "./studio-destructive-action-preview";
import { studioDeleteProductionBibleEntryRequest } from "./studio-destructive-command-catalog";
import {
  addStudioProductionBibleEntry,
  createStudioProductionBibleEntryId,
  diagnoseStudioProductionBibleReferences,
  duplicateStudioProductionBibleEntry,
  mergeStudioProductionBibles,
  parseStudioProductionBibleImport,
  patchStudioProductionBibleEntry,
  replaceStudioProductionBiblePromisePayoffLedger,
  removeStudioProductionBibleEntry,
  searchStudioProductionBible,
  serializeStudioProductionBible,
  STUDIO_PRODUCTION_BIBLE_MAX_DESCRIPTION_LENGTH,
  STUDIO_PRODUCTION_BIBLE_MAX_ENTRIES,
  STUDIO_PRODUCTION_BIBLE_MAX_LIST_ITEM_LENGTH,
  STUDIO_PRODUCTION_BIBLE_MAX_LIST_ITEMS,
  STUDIO_PRODUCTION_BIBLE_MAX_NAME_LENGTH,
  STUDIO_PRODUCTION_BIBLE_MAX_TIME_LENGTH,
  type StudioProductionBible,
  type StudioProductionBibleEntryKind,
  type StudioProductionBibleEntryPatch,
  type StudioProductionBiblePersistenceBackend,
} from "./studio-production-bible";
import { createEmptyStudioPromisePayoffLedger } from "./studio-promise-payoff-ledger";
import { StudioPromisePayoffLedgerPanel } from "./StudioPromisePayoffLedgerPanel";

export interface StudioProductionBibleLinkOption {
  readonly id: string;
  readonly label: string;
}

export interface StudioProductionBiblePanelPersistence {
  readonly backend: StudioProductionBiblePersistenceBackend;
  readonly persisted: boolean;
  readonly warning?: string;
}

export interface StudioProductionBiblePanelProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly bible: StudioProductionBible;
  readonly onChange: (bible: StudioProductionBible) => void;
  readonly characterOptions?: readonly StudioProductionBibleLinkOption[];
  readonly assetOptions?: readonly StudioProductionBibleLinkOption[];
  readonly persistence?: StudioProductionBiblePanelPersistence;
}

export type StudioProductionBiblePanelSurfaceProps = Omit<
  StudioProductionBiblePanelProps,
  "open"
>;

type EntryFilter = "all" | StudioProductionBibleEntryKind | "dangling";
type ProductionBibleView = "reference" | "promise-payoff";

const ENTRY_KIND_META: Record<
  StudioProductionBibleEntryKind,
  {
    readonly label: string;
    readonly plural: string;
    readonly description: string;
    readonly icon: typeof Clapperboard;
  }
> = {
  scene: {
    label: "장면",
    plural: "장면",
    description: "한 컷 또는 시퀀스의 장소·소품·시간대를 묶습니다.",
    icon: Clapperboard,
  },
  location: {
    label: "장소",
    plural: "장소",
    description: "반복 등장하는 공간의 구조와 빛, 색 기준을 기록합니다.",
    icon: MapPinned,
  },
  prop: {
    label: "소품",
    plural: "소품",
    description: "형태가 바뀌면 안 되는 물건과 연결 인물을 관리합니다.",
    icon: Box,
  },
};

const CONTROL_CLASS =
  "mt-1.5 min-h-11 w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm leading-relaxed text-fg outline-none transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] placeholder:text-fg-3 hover:border-line-strong focus:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const TOUCH_BUTTON_CLASS =
  "inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45";

function kindLabel(kind: StudioProductionBibleEntryKind): string {
  return ENTRY_KIND_META[kind].label;
}

function parseListInput(value: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const candidate of value.split(/[\n,;]+/u)) {
    const item = candidate.trim().slice(0, STUDIO_PRODUCTION_BIBLE_MAX_LIST_ITEM_LENGTH);
    if (!item || seen.has(item)) continue;
    seen.add(item);
    result.push(item);
    if (result.length >= STUDIO_PRODUCTION_BIBLE_MAX_LIST_ITEMS) break;
  }
  return result;
}

function generatedEntryId(kind: StudioProductionBibleEntryKind): string {
  return createStudioProductionBibleEntryId(kind);
}

interface TextFieldProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly placeholder: string;
  readonly maxLength: number;
  readonly multiline?: boolean;
  readonly hint?: string;
  readonly onChange: (value: string) => void;
}

function TextField({
  id,
  label,
  value,
  placeholder,
  maxLength,
  multiline = false,
  hint,
  onChange,
}: TextFieldProps) {
  return (
    <label htmlFor={id} className="block border-t border-line py-3 first:border-t-0">
      <span className="text-xs font-semibold text-fg-2">{label}</span>
      {multiline ? (
        <textarea
          id={id}
          value={value}
          rows={3}
          maxLength={maxLength}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "en", "{v0} resize-y"), { v0: String(CONTROL_CLASS) })}
        />
      ) : (
        <input
          id={id}
          type="text"
          value={value}
          maxLength={maxLength}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className={CONTROL_CLASS}
        />
      )}
      {hint && <span className="mt-1 block text-[0.65rem] leading-relaxed text-fg-3">{hint}</span>}
    </label>
  );
}

interface ListFieldProps {
  readonly id: string;
  readonly label: string;
  readonly value: readonly string[];
  readonly placeholder: string;
  readonly onChange: (value: string[]) => void;
}

function ListField({ id, label, value, placeholder, onChange }: ListFieldProps) {
  return (
    <TextField
      id={id}
      label={label}
      value={value.join("\n")}
      placeholder={placeholder}
      maxLength={
        STUDIO_PRODUCTION_BIBLE_MAX_LIST_ITEMS
        * (STUDIO_PRODUCTION_BIBLE_MAX_LIST_ITEM_LENGTH + 1)
      }
      multiline
      hint={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "쉼표 또는 줄바꿈으로 구분 · 최대 {v0}개"), { v0: String(STUDIO_PRODUCTION_BIBLE_MAX_LIST_ITEMS) })}
      onChange={(next) => onChange(parseListInput(next))}
    />
  );
}

interface LinkFieldProps {
  readonly id: string;
  readonly label: string;
  readonly value: readonly string[];
  readonly options: readonly StudioProductionBibleLinkOption[];
  readonly emptyHint: string;
  readonly onChange: (value: string[]) => void;
}

function LinkField({
  id,
  label,
  value,
  options,
  emptyHint,
  onChange,
}: LinkFieldProps) {
  const toggle = (optionId: string) => {
    onChange(
      value.includes(optionId)
        ? value.filter((candidate) => candidate !== optionId)
        : [...value, optionId]
    );
  };

  return (
    <div className="border-t border-line py-3">
      <label htmlFor={id} className="text-xs font-semibold text-fg-2">
        {label}
      </label>
      <textarea
        id={id}
        value={value.join("\n")}
        rows={2}
        maxLength={
          STUDIO_PRODUCTION_BIBLE_MAX_LIST_ITEMS
          * (STUDIO_PRODUCTION_BIBLE_MAX_LIST_ITEM_LENGTH + 1)
        }
        placeholder={translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "연결할 안정 ID를 한 줄에 하나씩 입력")}
        onChange={(event) => onChange(parseListInput(event.target.value))}
        className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "en", "{v0} resize-y font-mono text-xs"), { v0: String(CONTROL_CLASS) })}
      />
      <p className="mt-1 text-[0.65rem] leading-relaxed text-fg-3">
        {translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "이름이 바뀌어도 연결이 유지되도록 표시 이름 대신 안정 ID를 저장합니다.")}</p>
      {options.length > 0 ? (
        <div className="mt-2 flex max-h-32 flex-wrap gap-1.5 overflow-y-auto" aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "{v0} 빠른 연결"), { v0: String(label) })}>
          {options.map((option) => {
            const selected = value.includes(option.id);
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={selected}
                onClick={() => toggle(option.id)}
                className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "en", "inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-lg border px-2.5 text-left text-[0.68rem] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent {v0}"), { v0: String(selected
                    ? "border-accent/50 bg-accent-soft text-accent"
                    : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg") })}
              >
                {selected ? <Check size={12} aria-hidden /> : <Link2 size={12} aria-hidden />}
                <span className="min-w-0">
                  <span className="block truncate">{option.label}</span>
                  <span className="block truncate font-mono text-[0.58rem] font-normal text-fg-3">
                    {option.id}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="mt-2 text-[0.65rem] leading-relaxed text-fg-3">{emptyHint}</p>
      )}
    </div>
  );
}

function persistenceCopy(
  persistence: StudioProductionBiblePanelPersistence | undefined
): { label: string; tone: string } {
  if (!persistence) {
    return {
      label: "SQLite/OPFS 상태 확인 중 · 서버 동기화 없음",
      tone: "border-warn/35 bg-warn/10 text-warn",
    };
  }
  if (persistence.backend === "unavailable") {
    return {
      label: "SQLite/OPFS 사용 불가 · 저장되지 않음",
      tone: "border-bad/35 bg-bad/10 text-bad",
    };
  }
  if (persistence.backend === "memory") {
    return {
      label: "메모리 임시 · 새로고침 전까지",
      tone: "border-bad/35 bg-bad/10 text-bad",
    };
  }
  if (persistence.backend === "sqlite") {
    return {
      label: persistence.persisted
        ? "이 기기 SQLite/OPFS 저장 · 서버 동기화 없음"
        : "SQLite/OPFS 준비 · 첫 변경 시 저장",
      tone: "border-good/35 bg-good/10 text-good",
    };
  }
  return {
    label:
      persistence.backend === "legacy-indexeddb"
        ? "명시적으로 가져온 레거시 IndexedDB · V12 제품 저장 아님"
        : "명시적으로 가져온 레거시 localStorage · V12 제품 저장 아님",
    tone: "border-warn/35 bg-warn/10 text-warn",
  };
}

export function StudioProductionBiblePanelSurface({
  onClose,
  bible,
  onChange,
  characterOptions: characterOptionsProp,
  assetOptions: assetOptionsProp,
  persistence,
}: StudioProductionBiblePanelSurfaceProps) {
  const importInputRef = useRef<HTMLInputElement>(null);
  const [requestedEntryId, setRequestedEntryId] = useState<string | null>(null);
  const [filter, setFilter] = useState<EntryFilter>("all");
  const [view, setView] = useState<ProductionBibleView>("reference");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const characterOptions = characterOptionsProp ?? [];
  const assetOptions = assetOptionsProp ?? [];
  const characterCatalogAvailable = characterOptionsProp !== undefined;
  const assetCatalogAvailable = assetOptionsProp !== undefined;
  const knownCharacterIds = characterOptions.map(({ id }) => id);
  const knownAssetIds = assetOptions.map(({ id }) => id);
  const issues = diagnoseStudioProductionBibleReferences(bible, {
    ...(characterCatalogAvailable ? { knownCharacterIds } : {}),
    ...(assetCatalogAvailable ? { knownAssetIds } : {}),
  });
  const visibleEntries = searchStudioProductionBible(bible, {
    query,
    ...(filter === "all" || filter === "dangling" ? {} : { kinds: [filter] }),
    ...(filter === "dangling"
      ? {
          danglingOnly: true,
          ...(characterCatalogAvailable ? { knownCharacterIds } : {}),
          ...(assetCatalogAvailable ? { knownAssetIds } : {}),
        }
      : {}),
  });
  const selectedEntry =
    visibleEntries.find(({ id }) => id === requestedEntryId)
    ?? visibleEntries[0]
    ?? null;
  const selectedIssues = selectedEntry
    ? issues.filter(({ entryId }) => entryId === selectedEntry.id)
    : [];
  const locations = bible.entries
    .filter(({ kind, id }) => kind === "location" && id !== selectedEntry?.id)
    .map(({ id, name }) => ({ id, label: name || id }));
  const props = bible.entries
    .filter(({ kind, id }) => kind === "prop" && id !== selectedEntry?.id)
    .map(({ id, name }) => ({ id, label: name || id }));
  const persistenceStatus = persistenceCopy(persistence);
  const promisePayoffLedger =
    bible.promisePayoffLedger ?? createEmptyStudioPromisePayoffLedger();
  const sceneOptions = bible.entries
    .filter(({ kind }) => kind === "scene")
    .map(({ id, name }) => ({ id, label: name || id }));

  const applyChange = (nextBible: StudioProductionBible, nextId?: string) => {
    try {
      onChange(nextBible);
      if (nextId) setRequestedEntryId(nextId);
      setError(null);
      setNotice(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "프로덕션 바이블을 저장하지 못했어요.");
    }
  };

  const addEntry = (kind: StudioProductionBibleEntryKind) => {
    const id = generatedEntryId(kind);
    try {
      applyChange(
        addStudioProductionBibleEntry(bible, {
          id,
          kind,
          name: `${kindLabel(kind)} ${bible.entries.filter((entry) => entry.kind === kind).length + 1}`,
        }),
        id
      );
      setFilter(kind);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `${kindLabel(kind)}을(를) 추가하지 못했어요.`);
    }
  };

  const patchEntry = (patch: StudioProductionBibleEntryPatch) => {
    if (!selectedEntry) return;
    applyChange(patchStudioProductionBibleEntry(bible, selectedEntry.id, patch));
  };

  const duplicateEntry = () => {
    if (!selectedEntry) return;
    const id = generatedEntryId(selectedEntry.kind);
    try {
      applyChange(
        duplicateStudioProductionBibleEntry(bible, selectedEntry.id, { id }),
        id
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "항목을 복제하지 못했어요.");
    }
  };

  const deleteEntry = () => {
    if (!selectedEntry) return;
    const label = selectedEntry.name || kindLabel(selectedEntry.kind);
    void (async () => {
      if (
        !(await confirmStudioDestructiveAction(
          studioDeleteProductionBibleEntryRequest(label)
        ))
      ) return;
      const next = visibleEntries.find(({ id }) => id !== selectedEntry.id) ?? null;
      setRequestedEntryId(next?.id ?? null);
      applyChange(removeStudioProductionBibleEntry(bible, selectedEntry.id));
    })();
  };

  const copyExport = async () => {
    try {
      if (!globalThis.navigator?.clipboard?.writeText) {
        throw new Error("이 브라우저에서 클립보드 복사를 지원하지 않아요.");
      }
      await globalThis.navigator.clipboard.writeText(
        serializeStudioProductionBible(bible, true)
      );
      setNotice("정규화된 JSON을 클립보드에 복사했어요.");
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "JSON을 복사하지 못했어요.");
    }
  };

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed = parseStudioProductionBibleImport(await file.text());
      if (!parsed.ok) throw new Error(parsed.error);
      const merged = mergeStudioProductionBibles(bible, parsed.bible);
      applyChange(merged.bible, merged.addedIds[0] ?? merged.updatedIds[0]);
      setNotice(
        `${merged.addedIds.length}개 자료 추가 · ${merged.updatedIds.length}개 자료 병합 · ${merged.promiseAddedIds.length}개 약속 추가 · ${merged.promiseUpdatedIds.length}개 약속 병합 · ${merged.kindConflictIds.length}개 종류 충돌 보존`
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "JSON을 가져오지 못했어요.");
    } finally {
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-7xl flex-col overflow-hidden rounded-lg border border-line bg-panel shadow-2xl">
      <header className="flex shrink-0 items-start gap-3 border-b border-line px-3 py-3 sm:px-5">
        <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
          <BookMarked size={19} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="studio-production-bible-title" className="text-base font-bold text-fg">
              {translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "프로덕션 바이블")}</h2>
            <span
              data-studio-production-bible-local-only="true"
              className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "en", "inline-flex min-h-7 items-center gap-1 rounded-full border px-2 text-[0.62rem] font-semibold {v0}"), { v0: String(persistenceStatus.tone) })}
            >
              <Database size={11} aria-hidden />
              {persistenceStatus.label}
            </span>
          </div>
          <p className="mt-0.5 max-w-[76ch] text-xs leading-relaxed text-fg-3">
            {view === "reference"
              ? translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "장면·장소·소품의 시각 기준을 연결하고 이름이 바뀌어도 유지되는 안정 ID로 관리합니다.")
              : translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "독자에게 건 약속의 첫 장면, 중간 단서, 회수 컷과 마감을 한 원장에서 추적합니다.")}
          </p>
        </div>
        <span className="hidden rounded-full border border-line bg-card px-2.5 py-1 text-[0.68rem] tabular-nums text-fg-3 sm:inline-flex">
          {view === "reference"
            ? `${bible.entries.length}/${STUDIO_PRODUCTION_BIBLE_MAX_ENTRIES}`
            : formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "약속 {v0}"), { v0: String(promisePayoffLedger.entries.length) })}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label={translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "프로덕션 바이블 닫기")}
          className="grid size-11 shrink-0 place-items-center rounded-lg border border-line bg-card text-fg-3 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <X size={16} aria-hidden />
        </button>
      </header>

      {(error || notice || persistence?.warning) && (
        <div className="shrink-0 border-b border-line">
          {error && (
            <p role="alert" className="bg-bad/10 px-4 py-2 text-xs leading-relaxed text-bad">
              {error}
            </p>
          )}
          {!error && notice && (
            <p role="status" className="bg-good/10 px-4 py-2 text-xs leading-relaxed text-good">
              {notice}
            </p>
          )}
          {persistence?.warning && (
            <p className="bg-warn/10 px-4 py-2 text-xs leading-relaxed text-warn">
              {persistence.warning}
            </p>
          )}
        </div>
      )}

      <div
        role="tablist"
        aria-label={translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "프로덕션 바이블 작업 영역")}
        className="flex shrink-0 gap-1 overflow-x-auto border-b border-line bg-card/35 px-3 py-2 sm:px-5"
      >
        {([
          ["reference", "장면·장소·소품", BookMarked],
          ["promise-payoff", "약속·회수 원장", Flag],
        ] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            onClick={() => setView(id)}
            className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "en", "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent {v0}"), { v0: String(view === id
                ? "border-accent bg-accent text-on-accent"
                : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg") })}
          >
            <Icon size={13} aria-hidden />
            {label}
            <span className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "en", "rounded px-1.5 py-0.5 text-[0.6rem] tabular-nums {v0}"), { v0: String(view === id ? "bg-black/15 text-on-accent" : "bg-raised text-fg-3") })}>
              {id === "reference"
                ? bible.entries.length
                : promisePayoffLedger.entries.length}
            </span>
          </button>
        ))}
      </div>

      {view === "promise-payoff" ? (
        <StudioPromisePayoffLedgerPanel
          ledger={promisePayoffLedger}
          sceneOptions={sceneOptions}
          onChange={(nextLedger) =>
            applyChange(
              replaceStudioProductionBiblePromisePayoffLedger(bible, nextLedger)
            )}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col md:grid md:grid-cols-[20rem_minmax(0,1fr)]">
        <aside className="flex max-h-[45vh] min-h-0 shrink-0 flex-col border-b border-line bg-card/35 md:max-h-none md:border-b-0 md:border-r">
          <div className="shrink-0 space-y-2 border-b border-line p-3">
            <label className="relative block">
              <Search
                size={15}
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3"
              />
              <span className="sr-only">{translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "프로덕션 바이블 검색")}</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "이름·별칭·키워드·ID 검색")}
                className="min-h-11 w-full rounded-lg border border-line bg-panel py-2 pl-9 pr-3 text-xs text-fg outline-none placeholder:text-fg-3 hover:border-line-strong focus:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              />
            </label>

            <div className="flex gap-1 overflow-x-auto pb-0.5" role="tablist" aria-label={translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "바이블 종류 필터")}>
              {([
                ["all", "전체"],
                ["scene", "장면"],
                ["location", "장소"],
                ["prop", "소품"],
                ["dangling", `끊긴 연결 ${issues.length}`],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={filter === id}
                  onClick={() => setFilter(id)}
                  className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "en", "min-h-11 shrink-0 rounded-lg border px-3 text-[0.68rem] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent {v0}"), { v0: String(filter === id
                      ? "border-accent bg-accent text-on-accent"
                      : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg") })}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-1.5" aria-label={translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "바이블 항목 추가")}>
              {(["scene", "location", "prop"] as const).map((kind) => {
                const Icon = ENTRY_KIND_META[kind].icon;
                return (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => addEntry(kind)}
                    disabled={bible.entries.length >= STUDIO_PRODUCTION_BIBLE_MAX_ENTRIES}
                    className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "en", "{v0} border-line bg-card text-fg-2 hover:border-accent/45 hover:bg-accent-soft hover:text-accent"), { v0: String(TOUCH_BUTTON_CLASS) })}
                  >
                    <Icon size={13} aria-hidden />
                    {kindLabel(kind)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {visibleEntries.length === 0 ? (
              <div className="grid min-h-32 place-items-center rounded-lg border border-dashed border-line px-4 text-center">
                <div>
                  <BookMarked size={21} className="mx-auto text-fg-3" aria-hidden />
                  <p className="mt-2 text-xs font-semibold text-fg-2">
                    {bible.entries.length === 0 ? translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "첫 항목을 추가하세요") : translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "조건에 맞는 항목이 없어요")}
                  </p>
                  <p className="mt-1 text-[0.65rem] leading-relaxed text-fg-3">
                    {translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "장면은 장소와 소품을 연결하는 허브가 됩니다.")}</p>
                </div>
              </div>
            ) : (
              <ol className="space-y-1" aria-label={translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "프로덕션 바이블 항목")}>
                {visibleEntries.map((entry) => {
                  const selected = entry.id === selectedEntry?.id;
                  const meta = ENTRY_KIND_META[entry.kind];
                  const Icon = meta.icon;
                  const issueCount = issues.filter(({ entryId }) => entryId === entry.id).length;
                  return (
                    <li key={entry.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setRequestedEntryId(entry.id);
                          setError(null);
                          setNotice(null);
                        }}
                        aria-current={selected ? translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "en", "true") : undefined}
                        className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "en", "flex min-h-11 w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent {v0}"), { v0: String(selected
                            ? "border-accent/50 bg-accent-soft/20"
                            : "border-transparent text-fg-2 hover:border-line hover:bg-raised") })}
                      >
                        <span
                          className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "en", "grid size-8 shrink-0 place-items-center rounded-lg {v0}"), { v0: String(selected ? "bg-accent text-on-accent" : "bg-raised text-fg-3") })}
                        >
                          <Icon size={14} aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-semibold text-fg">
                            {entry.name || formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "이름 없는 {v0}"), { v0: String(meta.label) })}
                          </span>
                          <span className="mt-0.5 block truncate font-mono text-[0.6rem] text-fg-3">
                            {entry.id}
                          </span>
                        </span>
                        {issueCount > 0 && (
                          <span
                            aria-label={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "끊긴 연결 {v0}개"), { v0: String(issueCount) })}
                            className="inline-flex shrink-0 items-center gap-0.5 text-[0.62rem] font-semibold text-warn"
                          >
                            <AlertTriangle size={11} aria-hidden />
                            {issueCount}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          <div className="grid shrink-0 grid-cols-2 gap-1.5 border-t border-line p-3">
            <button
              type="button"
              onClick={() => void copyExport()}
              className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "en", "{v0} border-line bg-card text-fg-2 hover:bg-raised hover:text-fg"), { v0: String(TOUCH_BUTTON_CLASS) })}
            >
              <Copy size={13} aria-hidden /> {translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "JSON 복사")}</button>
            <button
              type="button"
              onClick={() => importInputRef.current?.click()}
              className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "en", "{v0} border-line bg-card text-fg-2 hover:bg-raised hover:text-fg"), { v0: String(TOUCH_BUTTON_CLASS) })}
            >
              <Upload size={13} aria-hidden /> {translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "JSON 병합")}</button>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              aria-label={translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "프로덕션 바이블 JSON 파일 선택")}
              onChange={(event) => void importFile(event.target.files?.[0])}
            />
          </div>
        </aside>

        <div className="min-h-0 overflow-y-auto overscroll-contain">
          {!selectedEntry ? (
            <div className="grid min-h-full place-items-center px-5 py-12 text-center">
              <div className="max-w-md">
                <span className="mx-auto grid size-12 place-items-center rounded-lg border border-line bg-card text-fg-3">
                  <FileJson size={22} aria-hidden />
                </span>
                <h3 className="mt-3 text-sm font-bold text-fg">{translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "프로덕션 기준을 작품과 함께 쌓으세요")}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-fg-3">
                  {translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "장소의 구조, 소품의 형태, 장면의 시간대를 분리해 기록하면 캐릭터 바이블과 연결해도 중복되지 않습니다.")}</p>
                <button
                  type="button"
                  onClick={() => addEntry("scene")}
                  className="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-accent px-4 text-xs font-semibold text-on-accent transition-colors hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <Plus size={14} aria-hidden /> {translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "첫 장면 만들기")}</button>
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6 sm:py-5">
              <div className="flex flex-wrap items-start gap-3 border-b border-line pb-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
                  {(() => {
                    const Icon = ENTRY_KIND_META[selectedEntry.kind].icon;
                    return <Icon size={18} aria-hidden />;
                  })()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-base font-bold text-fg">
                      {selectedEntry.name || formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "이름 없는 {v0}"), { v0: String(kindLabel(selectedEntry.kind)) })}
                    </h3>
                    <span className="rounded-full border border-line bg-card px-2 py-0.5 text-[0.65rem] font-semibold text-fg-3">
                      {kindLabel(selectedEntry.kind)}
                    </span>
                    {selectedIssues.length > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-warn/35 bg-warn/10 px-2 py-0.5 text-[0.65rem] font-semibold text-warn">
                        <AlertTriangle size={11} aria-hidden /> {translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "끊긴 연결 ")}{selectedIssues.length}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 break-all font-mono text-[0.65rem] text-fg-3">
                    {translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "안정 ID · ")}{selectedEntry.id}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={duplicateEntry}
                  className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "en", "{v0} border-line bg-card text-fg-2 hover:bg-raised hover:text-fg"), { v0: String(TOUCH_BUTTON_CLASS) })}
                >
                  <Copy size={13} aria-hidden /> {translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "복제")}</button>
                <button
                  type="button"
                  onClick={deleteEntry}
                  className={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "en", "{v0} border-bad/30 bg-bad/10 text-bad hover:bg-bad/15"), { v0: String(TOUCH_BUTTON_CLASS) })}
                >
                  <Trash2 size={13} aria-hidden /> {translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "삭제")}</button>
              </div>

              {selectedIssues.length > 0 && (
                <section aria-labelledby="production-bible-reference-issues" className="border-b border-line py-4">
                  <h4
                    id="production-bible-reference-issues"
                    className="flex items-center gap-1.5 text-xs font-bold text-warn"
                  >
                    <AlertTriangle size={13} aria-hidden />
                    {translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "연결 확인 필요")}</h4>
                  <ul className="mt-2 space-y-1">
                    {selectedIssues.map((issue) => (
                      <li
                        key={`${issue.field}:${issue.referenceId}`}
                        className="text-[0.68rem] leading-relaxed text-fg-2"
                      >
                        {issue.message}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section aria-labelledby="production-bible-identity">
                <div className="py-4">
                  <h4 id="production-bible-identity" className="text-xs font-bold text-fg">
                    {translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "정체성과 검색")}</h4>
                  <p className="mt-1 text-[0.68rem] leading-relaxed text-fg-3">
                    {translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "표시 이름은 바꿀 수 있지만 연결은 위 안정 ID를 사용합니다.")}</p>
                </div>
                <TextField
                  id={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "en", "production-bible-{v0}-name"), { v0: String(selectedEntry.id) })}
                  label={translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "이름")}
                  value={selectedEntry.name}
                  placeholder={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "{v0}의 표시 이름"), { v0: String(kindLabel(selectedEntry.kind)) })}
                  maxLength={STUDIO_PRODUCTION_BIBLE_MAX_NAME_LENGTH}
                  onChange={(name) => patchEntry({ name })}
                />
                <ListField
                  id={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "en", "production-bible-{v0}-aliases"), { v0: String(selectedEntry.id) })}
                  label={translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "별칭")}
                  value={selectedEntry.aliases}
                  placeholder={translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "작중 호칭, 검색할 다른 이름")}
                  onChange={(aliases) => patchEntry({ aliases })}
                />
                <TextField
                  id={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "en", "production-bible-{v0}-description"), { v0: String(selectedEntry.id) })}
                  label={translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "설명")}
                  value={selectedEntry.description}
                  placeholder={ENTRY_KIND_META[selectedEntry.kind].description}
                  maxLength={STUDIO_PRODUCTION_BIBLE_MAX_DESCRIPTION_LENGTH}
                  multiline
                  onChange={(description) => patchEntry({ description })}
                />
              </section>

              <section aria-labelledby="production-bible-visual" className="mt-5">
                <div className="border-t border-line py-4">
                  <h4 id="production-bible-visual" className="text-xs font-bold text-fg">
                    {translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "시각 일관성")}</h4>
                  <p className="mt-1 text-[0.68rem] leading-relaxed text-fg-3">
                    {translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "생성 프롬프트와 작화 체크리스트가 공유할 빛·색·형태 기준입니다.")}</p>
                </div>
                <ListField
                  id={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "en", "production-bible-{v0}-keywords"), { v0: String(selectedEntry.id) })}
                  label={translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "시각 키워드")}
                  value={selectedEntry.visualKeywords}
                  placeholder={translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "역광, 로우 앵글, 낡은 철망")}
                  onChange={(visualKeywords) => patchEntry({ visualKeywords })}
                />
                <ListField
                  id={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "en", "production-bible-{v0}-colors"), { v0: String(selectedEntry.id) })}
                  label={translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "대표 색")}
                  value={selectedEntry.colors}
                  placeholder={translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "#D86B38, 먹색, 저채도 청록")}
                  onChange={(colors) => patchEntry({ colors })}
                />
                <TextField
                  id={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "en", "production-bible-{v0}-time"), { v0: String(selectedEntry.id) })}
                  label={translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "시간대·조명")}
                  value={selectedEntry.timeOfDay}
                  placeholder={translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "예: 해질녘 · 서쪽 역광")}
                  maxLength={STUDIO_PRODUCTION_BIBLE_MAX_TIME_LENGTH}
                  onChange={(timeOfDay) => patchEntry({ timeOfDay })}
                />
              </section>

              <section aria-labelledby="production-bible-links" className="mt-5">
                <div className="border-t border-line py-4">
                  <h4 id="production-bible-links" className="text-xs font-bold text-fg">
                    {translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "연결과 참고 에셋")}</h4>
                  <p className="mt-1 text-[0.68rem] leading-relaxed text-fg-3">
                    {translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "캐릭터 바이블과 에셋 라이브러리는 외부 ID로 연결하며 원본 데이터를 복제하지 않습니다.")}</p>
                </div>
                <LinkField
                  id={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "en", "production-bible-{v0}-characters"), { v0: String(selectedEntry.id) })}
                  label={translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "연결 인물")}
                  value={selectedEntry.linkedCharacterIds}
                  options={characterOptions}
                  emptyHint={translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "캐릭터 바이블 통합 전에는 안정 ID를 직접 입력할 수 있습니다.")}
                  onChange={(linkedCharacterIds) => patchEntry({ linkedCharacterIds })}
                />
                <LinkField
                  id={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "en", "production-bible-{v0}-locations"), { v0: String(selectedEntry.id) })}
                  label={translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "연결 장소")}
                  value={selectedEntry.linkedLocationIds}
                  options={locations}
                  emptyHint={translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "등록된 다른 장소가 없습니다.")}
                  onChange={(linkedLocationIds) => patchEntry({ linkedLocationIds })}
                />
                <LinkField
                  id={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "en", "production-bible-{v0}-props"), { v0: String(selectedEntry.id) })}
                  label={translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "연결 소품")}
                  value={selectedEntry.linkedPropIds}
                  options={props}
                  emptyHint={translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "등록된 다른 소품이 없습니다.")}
                  onChange={(linkedPropIds) => patchEntry({ linkedPropIds })}
                />
                <LinkField
                  id={formatI18nTemplate(translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "en", "production-bible-{v0}-assets"), { v0: String(selectedEntry.id) })}
                  label={translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "참고 에셋")}
                  value={selectedEntry.referenceAssetIds}
                  options={assetOptions}
                  emptyHint={translateCurrentStaticSourceText("domains.creator.StudioProductionBiblePanel", "ko", "에셋 라이브러리 통합 전에는 참고 에셋 ID를 직접 입력할 수 있습니다.")}
                  onChange={(referenceAssetIds) => patchEntry({ referenceAssetIds })}
                />
              </section>
            </div>
          )}
        </div>
        </div>
      )}
    </div>
  );
}

export function StudioProductionBiblePanel({
  open,
  onClose,
  ...surfaceProps
}: StudioProductionBiblePanelProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    globalThis.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      globalThis.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="studio-production-bible-title"
      tabIndex={-1}
      className="fixed inset-0 z-[80] bg-[oklch(0.08_0.01_70/0.82)] p-2 text-fg backdrop-blur-sm focus:outline-none sm:p-4"
    >
      <StudioProductionBiblePanelSurface
        onClose={onClose}
        {...surfaceProps}
      />
    </div>,
    document.body
  );
}
