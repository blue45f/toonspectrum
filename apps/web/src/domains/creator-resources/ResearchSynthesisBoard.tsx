import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import type {
  ChangeEvent,
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
} from "react";

import { RESOURCE_BUTTON, RESOURCE_INPUT } from "./navigation";
import {
  addResearchNotebookEntry,
  isResearchNoteTextValid,
  parseResearchNotebook,
  RESEARCH_NOTE_KINDS,
  RESEARCH_NOTE_LIMIT,
  RESEARCH_NOTE_SOURCE_LIMIT,
  RESEARCH_NOTE_TEXT_LIMIT,
  removeResearchNotebookEntry,
  researchNotebookEntryId,
  researchNotebookSearchQuery,
  serializeResearchNotebook,
  summarizeResearchNotebook,
  updateResearchNotebookEntry,
} from "./research-notebook";
import type {
  ResearchNotebook,
  ResearchNoteKind,
} from "./research-notebook";
import type { ResearchNotebookRestoreMode } from "./useResearchNotebook";
import { downloadText } from "./workspace";

import type { CreatorResource } from "@/shared/lib/creator-resources";

const NOTE_DATE_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function noteTimeLabel(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? NOTE_DATE_FORMATTER.format(date) : "시간 확인 필요";
}

function sourceSearchText(resource: CreatorResource): string {
  return [resource.title, resource.creator, resource.description, resource.isbn]
    .filter(Boolean)
    .join(" ")
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR");
}

export function ResearchSynthesisBoard({
  notebook,
  resources,
  ready,
  writable,
  error,
  onChange,
  onReset,
  onRestore,
  onInvestigate,
}: {
  notebook: ResearchNotebook;
  resources: readonly CreatorResource[];
  ready: boolean;
  writable: boolean;
  error: string;
  onChange: (updater: (current: ResearchNotebook) => ResearchNotebook) => void;
  onReset: () => void;
  onRestore: (raw: string, mode: ResearchNotebookRestoreMode) => boolean;
  onInvestigate: (query: string) => void;
}) {
  const [kind, setKind] = useState<ResearchNoteKind>("observation");
  const [text, setText] = useState("");
  const [sourceQuery, setSourceQuery] = useState("");
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [restoreMode, setRestoreMode] = useState<ResearchNotebookRestoreMode>("merge");
  const [restoring, setRestoring] = useState(false);
  const [notice, setNotice] = useState("");
  const summary = useMemo(() => summarizeResearchNotebook(notebook), [notebook]);
  const resourceMap = useMemo(() => new Map(resources.map((resource) => [resource.id, resource])), [resources]);
  const normalizedSourceQuery = sourceQuery.normalize("NFKC").trim().toLocaleLowerCase("ko-KR");
  const sourceCandidates = useMemo(() => [...resources]
    .reverse()
    .filter((resource) => !normalizedSourceQuery || sourceSearchText(resource).includes(normalizedSourceQuery))
    .slice(0, 8), [normalizedSourceQuery, resources]);
  const selectedKind = RESEARCH_NOTE_KINDS.find((entry) => entry.id === kind) ?? RESEARCH_NOTE_KINDS[0];
  const canAdd = isResearchNoteTextValid(text) && summary.total < RESEARCH_NOTE_LIMIT;

  const addEntry = () => {
    if (!isResearchNoteTextValid(text)) {
      setNotice(`노트는 2~${RESEARCH_NOTE_TEXT_LIMIT}자로 입력하세요.`);
      return;
    }
    if (summary.total >= RESEARCH_NOTE_LIMIT) {
      setNotice(`판단 노트는 최대 ${RESEARCH_NOTE_LIMIT}개까지 보관할 수 있습니다.`);
      return;
    }
    const id = researchNotebookEntryId();
    onChange((current) => addResearchNotebookEntry(current, {
      id,
      kind,
      text,
      sourceIds: selectedSourceIds,
    }));
    setText("");
    setSelectedSourceIds([]);
    setNotice(`${selectedKind.label} 노트를 저장했습니다.`);
  };

  const submitEntry = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    addEntry();
  };

  const toggleSource = (sourceId: string, checked: boolean) => {
    if (!checked) {
      setSelectedSourceIds((current) => current.filter((id) => id !== sourceId));
      return;
    }
    setSelectedSourceIds((current) => {
      if (current.includes(sourceId)) return current;
      if (current.length >= RESEARCH_NOTE_SOURCE_LIMIT) {
        setNotice(`노트 하나에 자료를 최대 ${RESEARCH_NOTE_SOURCE_LIMIT}개까지 연결할 수 있습니다.`);
        return current;
      }
      return [...current, sourceId];
    });
  };

  const importNotebook = async (file: File | undefined) => {
    if (!file || restoring) return;
    setRestoring(true);
    try {
      if (file.size > 1_000_000) throw new Error("1 MB 이하의 판단 노트 백업을 선택하세요.");
      const raw = await file.text();
      parseResearchNotebook(raw);
      if (restoreMode === "replace" && !window.confirm("현재 관찰·질문·결정 노트를 모두 이 백업으로 대체할까요?")) return;
      setNotice(onRestore(raw, restoreMode)
        ? restoreMode === "replace" ? "판단 노트를 백업으로 대체했습니다." : "현재 판단 노트를 유지하고 백업을 합쳤습니다."
        : "판단 노트 백업을 적용하지 못했습니다.");
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "판단 노트 백업을 읽지 못했습니다.");
    } finally {
      setRestoring(false);
    }
  };

  return <section id="research-synthesis" className="scroll-mt-24 space-y-5" aria-labelledby="research-synthesis-title">
    <header className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
      <div>
        <p className="text-sm font-semibold text-accent">근거 → 질문 → 결정</p>
        <h2 id="research-synthesis-title" className="mt-1 text-2xl font-bold">자료를 장면 선택으로 바꾸는 판단 노트</h2>
        <p className="mt-2 max-w-4xl leading-7 text-fg-2">저장 자료에서 직접 확인한 관찰, 아직 풀리지 않은 질문, 실제 장면에 반영할 결정을 분리해 기록하세요. 연결 자료는 출처 추적을 돕지만 사실이나 권리를 자동 보증하지 않습니다.</p>
      </div>
      <span className="w-fit rounded-full border border-line bg-panel px-3 py-1 text-xs text-fg-2">브라우저 로컬 · 최대 {RESEARCH_NOTE_LIMIT}개</span>
    </header>

    <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <div className="rounded-2xl border border-line bg-panel p-4"><dt className="text-xs text-fg-2">전체 판단 노트</dt><dd className="mt-2 text-2xl font-bold">{summary.total}<span className="ml-1 text-sm">개</span></dd></div>
      <div className="rounded-2xl border border-line bg-panel p-4"><dt className="text-xs text-fg-2">확인한 관찰</dt><dd className="mt-2 text-2xl font-bold">{summary.observationCount}<span className="ml-1 text-sm">개</span></dd></div>
      <div className="rounded-2xl border border-line bg-panel p-4"><dt className="text-xs text-fg-2">남은 질문</dt><dd className="mt-2 text-2xl font-bold">{summary.questionCount}<span className="ml-1 text-sm">개</span></dd></div>
      <div className="rounded-2xl border border-line bg-panel p-4"><dt className="text-xs text-fg-2">장면 결정</dt><dd className="mt-2 text-2xl font-bold">{summary.decisionCount}<span className="ml-1 text-sm">개</span></dd></div>
      <div className="rounded-2xl border border-line bg-panel p-4 sm:col-span-2 xl:col-span-1"><dt className="text-xs text-fg-2">자료가 연결된 노트</dt><dd className="mt-2 text-2xl font-bold">{summary.linkedCount}<span className="ml-1 text-sm">개</span></dd>{summary.unlinkedDecisionCount > 0 && <dd className="mt-1 text-xs text-fg-2">근거 미연결 결정 {summary.unlinkedDecisionCount}개</dd>}</div>
    </dl>

    <form className="grid gap-5 rounded-3xl border border-line bg-panel p-5 sm:p-6 xl:grid-cols-5" onSubmit={submitEntry} noValidate>
      <div className="space-y-4 xl:col-span-3">
        <div>
          <p className="text-xs font-bold text-accent">새 판단 노트</p>
          <h3 className="mt-1 text-lg font-bold">한 문장으로 기록하고 근거를 연결하세요</h3>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="판단 노트 유형">
          {RESEARCH_NOTE_KINDS.map((entry) => <button
            key={entry.id}
            type="button"
            aria-pressed={kind === entry.id}
            className={`${RESOURCE_BUTTON} ${kind === entry.id ? "border-accent bg-accent-soft text-accent" : "bg-canvas"}`}
            onClick={() => {
              setKind(entry.id);
              setNotice("");
            }}
          >{entry.label}</button>)}
        </div>
        <p className="text-sm leading-6 text-fg-2">{selectedKind.description}</p>
        <label htmlFor="research-note-text" className="block text-sm font-semibold">{selectedKind.eyebrow}
          <textarea
            id="research-note-text"
            rows={4}
            maxLength={RESEARCH_NOTE_TEXT_LIMIT}
            value={text}
            className={`${RESOURCE_INPUT} mt-2 min-h-28 resize-y`}
            placeholder={kind === "observation"
              ? "예: 역무실 벽시계는 승강장과 같은 방향에서 보이도록 배치되어 있다."
              : kind === "question"
                ? "예: 겨울 야간 근무 때 역무원이 휴대한 조명은 어떤 연료를 사용했을까?"
                : "예: 1화 역무실 장면은 천장등 대신 손전등의 좁은 빛으로 인물의 불안을 강조한다."}
            aria-describedby="research-note-help research-note-status"
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
              setText(event.target.value);
              if (notice) setNotice("");
            }}
            onKeyDown={(event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                addEntry();
              }
            }}
          />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p id="research-note-help" className="text-xs text-fg-2">⌘/Ctrl + Enter로 저장 · {text.length}/{RESEARCH_NOTE_TEXT_LIMIT}자 · 연결 자료 {selectedSourceIds.length}/{RESEARCH_NOTE_SOURCE_LIMIT}개</p>
          <button type="submit" className={`${RESOURCE_BUTTON} border-accent bg-accent-soft text-accent`} disabled={!canAdd || !ready}>노트 저장</button>
        </div>
      </div>

      <aside className="space-y-4 rounded-2xl border border-line bg-canvas p-4 xl:col-span-2" aria-labelledby="research-note-sources-title">
        <div>
          <p className="text-xs font-bold text-accent">출처 연결</p>
          <h3 id="research-note-sources-title" className="mt-1 font-bold">저장 보드의 근거 선택</h3>
          <p className="mt-2 text-xs leading-5 text-fg-2">현재 저장된 자료만 연결합니다. 자료가 보드에서 삭제되어도 노트 자체는 유지됩니다.</p>
        </div>
        {resources.length ? <>
          <label htmlFor="research-note-source-search" className="block text-sm font-semibold">연결할 저장 자료 검색
            <input
              id="research-note-source-search"
              type="search"
              value={sourceQuery}
              className={`${RESOURCE_INPUT} mt-2`}
              placeholder="제목·저작자·설명·ISBN"
              onChange={(event: ChangeEvent<HTMLInputElement>) => setSourceQuery(event.target.value)}
            />
          </label>
          <div className="max-h-64 space-y-2 overflow-y-auto pr-1" aria-label="연결 가능한 저장 자료">
            {sourceCandidates.map((resource) => <label key={resource.id} className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-line bg-panel p-3 text-sm hover:bg-raised">
              <span className="sr-only">연결 자료 선택</span>
              <input
                type="checkbox"
                className="mt-0.5 size-5 shrink-0"
                checked={selectedSourceIds.includes(resource.id)}
                onChange={(event: ChangeEvent<HTMLInputElement>) => toggleSource(resource.id, event.target.checked)}
              />
              <span className="min-w-0"><span className="block truncate font-semibold">{resource.title}</span><span className="block truncate text-xs text-fg-2">{resource.creator || resource.credit}</span></span>
            </label>)}
            {!sourceCandidates.length && <p className="rounded-xl border border-dashed border-line p-4 text-sm text-fg-2">검색과 일치하는 저장 자료가 없습니다.</p>}
          </div>
        </> : <p className="rounded-xl border border-dashed border-line p-4 text-sm leading-6 text-fg-2">먼저 시각 레퍼런스나 판본 자료를 저장하면 판단 노트에 출처를 연결할 수 있습니다.</p>}
      </aside>
      <p id="research-note-status" role="status" aria-live="polite" className="text-sm text-fg-2 xl:col-span-5">{error || notice || (!ready ? "판단 노트를 불러오는 중입니다." : writable ? "노트는 이 브라우저에만 저장되며 계정과 동기화되지 않습니다." : "이 환경에서는 저장할 수 없어 현재 탭에서만 유지됩니다.")}</p>
    </form>

    <div className="grid gap-4 xl:grid-cols-3" aria-label="판단 노트 보드">
      {RESEARCH_NOTE_KINDS.map((lane) => {
        const entries = notebook.entries.filter((entry) => entry.kind === lane.id);
        return <section key={lane.id} className="min-w-0 rounded-2xl border border-line bg-panel p-4" aria-labelledby={`research-note-lane-${lane.id}`}>
          <header className="flex items-start justify-between gap-3 border-b border-line pb-4">
            <div><p className="text-xs font-bold text-accent">{lane.eyebrow}</p><h3 id={`research-note-lane-${lane.id}`} className="mt-1 text-lg font-bold">{lane.label}</h3></div>
            <span className="rounded-full border border-line bg-canvas px-2.5 py-1 text-xs text-fg-2">{entries.length}</span>
          </header>
          <div className="mt-4 space-y-3">
            {entries.map((entry) => {
              const linkedResources = entry.sourceIds
                .map((sourceId) => resourceMap.get(sourceId))
                .filter((resource): resource is CreatorResource => Boolean(resource));
              const missingSourceCount = entry.sourceIds.length - linkedResources.length;
              const searchQuery = researchNotebookSearchQuery(entry.text);
              return <article key={entry.id} className="rounded-xl border border-line bg-canvas p-4">
                <p className="whitespace-pre-wrap break-words text-sm leading-6">{entry.text}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {linkedResources.map((resource) => <a
                    key={resource.id}
                    href={resource.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="max-w-full truncate rounded-full border border-line bg-panel px-2.5 py-1 text-xs text-accent hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                  >{resource.title} ↗</a>)}
                  {missingSourceCount > 0 && <span className="rounded-full border border-line px-2.5 py-1 text-xs text-fg-2">보드에서 제거된 자료 {missingSourceCount}개</span>}
                  {!entry.sourceIds.length && <span className="rounded-full border border-dashed border-line px-2.5 py-1 text-xs text-fg-2">근거 미연결</span>}
                </div>
                <div className="mt-4 flex flex-wrap items-end justify-between gap-3 border-t border-line pt-3">
                  <label className="text-xs text-fg-2">유형
                    <select
                      value={entry.kind}
                      className="ml-2 min-h-9 rounded-lg border border-line bg-panel px-2 text-xs text-fg"
                      aria-label={`${entry.text} 노트 유형`}
                      onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange((current) => updateResearchNotebookEntry(current, entry.id, { kind: event.target.value as ResearchNoteKind }))}
                    >
                      {RESEARCH_NOTE_KINDS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                    </select>
                  </label>
                  <span className="text-xs text-fg-2">{noteTimeLabel(entry.updatedAt)}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {entry.kind === "question" && <button type="button" className={RESOURCE_BUTTON} disabled={searchQuery.length < 2} onClick={() => onInvestigate(searchQuery)}>이 질문 조사</button>}
                  {entry.kind === "decision" && <Link className={RESOURCE_BUTTON} to="/story-lab">Story Lab에 반영</Link>}
                  <button type="button" className={RESOURCE_BUTTON} onClick={() => {
                    if (!window.confirm("이 판단 노트를 삭제할까요?")) return;
                    onChange((current) => removeResearchNotebookEntry(current, entry.id));
                    setNotice("판단 노트를 삭제했습니다.");
                  }}>삭제</button>
                </div>
              </article>;
            })}
            {!entries.length && <p className="rounded-xl border border-dashed border-line bg-canvas p-4 text-sm leading-6 text-fg-2">{lane.empty}</p>}
          </div>
        </section>;
      })}
    </div>

    <details className="rounded-2xl border border-line bg-panel p-5">
      <summary className="cursor-pointer font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">판단 노트 휴대·복구 · JSON 내보내기와 가져오기</summary>
      <div className="mt-4 space-y-4 border-t border-line pt-4">
        <p className="text-sm leading-6 text-fg-2">판단 노트는 기존 자료·기획서 백업과 분리된 버전형 JSON입니다. 합치기는 현재 노트를 우선 보존하며, 완전 대체는 명시적으로 확인한 뒤 실행합니다.</p>
        <div className="flex flex-wrap gap-3">
          <button type="button" className={RESOURCE_BUTTON} disabled={!notebook.entries.length} onClick={() => downloadText("toonstudio-research-notes.json", serializeResearchNotebook(notebook), "application/json")}>판단 노트 백업</button>
          <button type="button" className={RESOURCE_BUTTON} disabled={!notebook.entries.length} onClick={() => {
            if (!window.confirm("현재 관찰·질문·결정 노트를 모두 초기화할까요? 저장 자료와 기획서는 유지됩니다.")) return;
            onReset();
            setNotice("판단 노트를 초기화했습니다.");
          }}>판단 노트 초기화</button>
        </div>
        <label htmlFor="research-notebook-replace" className="flex min-h-11 items-center gap-3 text-sm">
          <input
            id="research-notebook-replace"
            type="checkbox"
            className="size-5"
            checked={restoreMode === "replace"}
            disabled={!ready || restoring}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setRestoreMode(event.target.checked ? "replace" : "merge")}
          />
          현재 판단 노트를 유지하지 않고 백업으로 완전히 대체
        </label>
        <label htmlFor="research-notebook-import" className="block text-sm font-semibold">{restoreMode === "merge" ? "판단 노트 백업 합치기" : "판단 노트 백업으로 대체"}
          <input
            id="research-notebook-import"
            className="mt-2 block max-w-full text-sm"
            type="file"
            accept="application/json,.json"
            disabled={!ready || restoring}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              void importNotebook(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
        </label>
      </div>
    </details>
  </section>;
}
