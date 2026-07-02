// 배치된 대사 일괄 편집 패널(코미포식) — 캔버스의 말풍선·텍스트 요소를 목록으로 보고
// (1) 요소별 인라인 수정, (2) 전체/현재 페이지 찾아바꾸기, (3) 클릭으로 캔버스 선택을 제공한다.
// 순수 계산은 studio-dialogue-batch, 상태 커밋(히스토리)은 StudioPage(메인 루프)가 담당한다.
// 자체완결 플로팅 패널: 캔버스 컨테이너(relative) 안에서 우측에 떠 있고 Esc 로 닫힌다.
import { MessageCircle, Replace, Search, Type as TypeIcon, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  collectDialogueItems,
  dialogueExcerpt,
  dialogueItemTypeLabel,
  filterDialogueItems,
  planDialogueReplace,
  type DialogueBatchItem,
  type DialoguePageLike,
  type DialogueReplacePlan,
  type DialogueReplaceScope,
} from "./studio-dialogue-batch";

import { cx } from "@/lib/cx";

export type StudioDialogueBatchPanelProps = {
  /** 전체 페이지(요소·그룹 포함) — StudioPage 의 pages 를 그대로 받는다. */
  pages: readonly DialoguePageLike[];
  /** 현재 편집 중인 페이지 id(스코프 "현재 페이지"·현재 배지 기준). */
  currentPageId: string;
  /** 캔버스에서 선택된 요소 id(목록 하이라이트). */
  selectedId: string | null;
  onClose: () => void;
  /** 목록 행 클릭 → 해당 요소 선택(다른 페이지면 페이지 전환 포함). */
  onSelectElement: (pageId: string, elId: string) => void;
  /** 인라인 수정 확정(포커스 아웃/⌘Enter) — 텍스트가 실제로 바뀐 경우에만 호출된다. */
  onPatchText: (pageId: string, elId: string, text: string) => void;
  /** 찾아바꾸기 일괄 적용 — 메인 루프가 applyReplacePlanToPages 로 단일 커밋한다. */
  onApplyReplace: (plan: DialogueReplacePlan) => void;
};

const SCOPES: { id: DialogueReplaceScope; label: string }[] = [
  { id: "all", label: "전체 페이지" },
  { id: "current", label: "현재 페이지" },
];

const inputClass =
  "w-full rounded-lg border border-line bg-card px-2 py-1.5 text-[0.7rem] text-fg outline-none transition-colors placeholder:text-fg-4 focus:border-accent/50";

export function StudioDialogueBatchPanel({
  pages,
  currentPageId,
  selectedId,
  onClose,
  onSelectElement,
  onPatchText,
  onApplyReplace,
}: StudioDialogueBatchPanelProps) {
  // 찾아바꾸기 입력 — 찾기는 공백도 의미가 있어 trim 하지 않는다.
  const [find, setFind] = useState("");
  const [replaceWith, setReplaceWith] = useState("");
  const [scope, setScope] = useState<DialogueReplaceScope>("all");
  const [caseSensitive, setCaseSensitive] = useState(false);
  // 목록 검색어(찾아바꾸기와 독립).
  const [listQuery, setListQuery] = useState("");
  // 인라인 수정 임시본 — 포커스 아웃/⌘Enter 에만 확정해 히스토리를 키 입력마다 만들지 않는다.
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const findInputRef = useRef<HTMLInputElement>(null);

  // 열리면 찾기 입력으로 포커스 이동(패널을 연 의도가 편집이므로).
  useEffect(() => {
    findInputRef.current?.focus();
  }, []);

  // Esc 로 닫기 — 입력 필드 안의 Esc 는 임시본 되돌리기에 쓰므로 제외한다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "TEXTAREA" || target.tagName === "INPUT" || target.isContentEditable)
      ) {
        return;
      }
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const items = collectDialogueItems(pages);
  const shown = filterDialogueItems(items, listQuery);
  // 페이지 순서대로 묶어 페이지 헤더를 붙인다(목록은 collect 가 페이지순으로 보장).
  const grouped: { pageId: string; pageIndex: number; items: DialogueBatchItem[] }[] = [];
  for (const item of shown) {
    const last = grouped[grouped.length - 1];
    if (last && last.pageId === item.pageId) last.items.push(item);
    else grouped.push({ pageId: item.pageId, pageIndex: item.pageIndex, items: [item] });
  }

  const plan = planDialogueReplace(pages, find, replaceWith, {
    caseSensitive,
    scope,
    currentPageId,
  });

  const commitDraft = (item: DialogueBatchItem) => {
    const draft = drafts[item.id];
    if (draft == null) return;
    setDrafts((prev) => {
      const { [item.id]: _omit, ...rest } = prev;
      return rest;
    });
    if (draft !== item.text) onPatchText(item.pageId, item.id, draft);
  };

  const revertDraft = (id: string) => {
    setDrafts((prev) => {
      const { [id]: _omit, ...rest } = prev;
      return rest;
    });
  };

  const applyReplace = () => {
    if (plan.totalCount === 0) return;
    // 확정 전 임시본은 치환 결과를 가리므로 함께 비운다(예측 가능성).
    setDrafts({});
    onApplyReplace(plan);
  };

  return (
    <section
      aria-label="대사 일괄 편집"
      className="absolute right-3 top-3 z-40 flex max-h-[calc(100%-5rem)] w-[min(21rem,calc(100%-1.5rem))] flex-col overflow-hidden rounded-xl border border-line bg-panel/95 shadow-xl backdrop-blur"
    >
      <div className="flex items-center justify-between gap-2 border-b border-line/60 px-3 py-2">
        <p className="text-xs font-bold text-fg">
          대사 일괄 편집
          <span className="ml-1.5 font-medium text-fg-4">{items.length}개</span>
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="대사 일괄 편집 닫기"
          className="grid size-6 place-items-center rounded-lg border border-line text-fg-2 transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          <X size={13} />
        </button>
      </div>

      {/* 찾아바꾸기 — 적용 전 매치 미리보기를 보여주고, 적용은 실행취소 1회로 복구된다. */}
      <div className="space-y-1.5 border-b border-line/60 px-3 py-2.5">
        <div className="grid grid-cols-2 gap-1.5">
          <input
            ref={findInputRef}
            type="text"
            value={find}
            onChange={(e) => setFind(e.target.value)}
            placeholder="찾기"
            aria-label="찾을 대사"
            className={inputClass}
          />
          <input
            type="text"
            value={replaceWith}
            onChange={(e) => setReplaceWith(e.target.value)}
            placeholder="바꾸기"
            aria-label="바꿀 대사"
            className={inputClass}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {SCOPES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setScope(s.id)}
              aria-pressed={scope === s.id}
              className={cx(
                "rounded-full border px-2 py-0.5 text-[0.62rem] font-medium transition-colors",
                scope === s.id
                  ? "border-accent bg-accent text-on-accent"
                  : "border-line bg-card text-fg-3 hover:bg-raised"
              )}
            >
              {s.label}
            </button>
          ))}
          <label className="ml-auto flex cursor-pointer items-center gap-1 text-[0.62rem] text-fg-3">
            <input
              type="checkbox"
              checked={caseSensitive}
              onChange={(e) => setCaseSensitive(e.target.checked)}
              className="accent-accent"
            />
            대소문자 구분
          </label>
        </div>
        {find ? (
          <p className="text-[0.62rem] leading-snug text-fg-3" role="status">
            {plan.totalCount > 0 ? (
              <>
                <span className="font-semibold text-fg-2">{plan.totalCount}건</span> · 요소{" "}
                {plan.elementCount}개 · {plan.pageCount}페이지
              </>
            ) : (
              "일치하는 대사가 없어요."
            )}
            {plan.lockedSkipped > 0 && (
              <span className="text-fg-4"> · 잠긴 요소 {plan.lockedSkipped}개 제외</span>
            )}
          </p>
        ) : (
          <p className="text-[0.62rem] leading-snug text-fg-4">
            찾을 문구를 입력하면 바꾸기 전에 매치 수를 미리 보여줘요.
          </p>
        )}
        <button
          type="button"
          onClick={applyReplace}
          disabled={plan.totalCount === 0}
          className={cx(
            "flex w-full items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-semibold transition-colors",
            plan.totalCount > 0
              ? "bg-accent text-on-accent hover:opacity-90"
              : "cursor-not-allowed bg-card text-fg-4"
          )}
        >
          <Replace size={12} /> 모두 바꾸기
        </button>
      </div>

      {/* 대사 목록 — 클릭=캔버스 선택, 텍스트는 그 자리에서 수정. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2.5">
        <div className="relative mb-2">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-fg-4" aria-hidden />
          <input
            type="text"
            value={listQuery}
            onChange={(e) => setListQuery(e.target.value)}
            placeholder="목록에서 검색..."
            aria-label="대사 목록 검색"
            className={cx(inputClass, "pl-6")}
          />
        </div>
        {items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-2 py-4 text-center text-[0.66rem] leading-relaxed text-fg-4">
            아직 말풍선·텍스트가 없어요. 상단 도구의 말풍선 메뉴에서 대사를 넣으면 여기에서 한꺼번에
            고칠 수 있어요.
          </p>
        ) : shown.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line px-2 py-4 text-center text-[0.66rem] leading-relaxed text-fg-4">
            검색과 일치하는 대사가 없어요.
          </p>
        ) : (
          <div className="space-y-2.5">
            {grouped.map((group) => (
              <section key={group.pageId} aria-label={`${group.pageIndex + 1}페이지 대사`}>
                <p className="mb-1 flex items-center gap-1 text-[0.62rem] font-semibold uppercase tracking-wide text-fg-3">
                  {group.pageIndex + 1}페이지
                  {group.pageId === currentPageId && (
                    <span className="rounded-full border border-accent/40 bg-accent-soft/40 px-1.5 text-[0.55rem] font-medium normal-case text-accent">
                      현재
                    </span>
                  )}
                </p>
                <ul className="space-y-1.5">
                  {group.items.map((item) => (
                    <li
                      key={item.id}
                      className={cx(
                        "rounded-lg border p-1.5 transition-colors",
                        item.id === selectedId
                          ? "border-accent/60 bg-accent-soft/30"
                          : "border-line bg-card/45"
                      )}
                    >
                      <div className="mb-1 flex items-center gap-1.5">
                        {item.elType === "bubble" ? (
                          <MessageCircle size={11} className="shrink-0 text-fg-3" aria-hidden />
                        ) : (
                          <TypeIcon size={11} className="shrink-0 text-fg-3" aria-hidden />
                        )}
                        <button
                          type="button"
                          onClick={() => onSelectElement(item.pageId, item.id)}
                          className="min-w-0 flex-1 truncate text-left text-[0.66rem] font-medium text-fg-2 transition-colors hover:text-accent"
                          aria-label={`${item.pageIndex + 1}페이지 ${dialogueItemTypeLabel(item)} "${dialogueExcerpt(item.text, 16)}" 캔버스에서 선택`}
                          title="캔버스에서 이 요소 선택"
                        >
                          {dialogueItemTypeLabel(item)}
                        </button>
                        {item.locked && (
                          <span className="shrink-0 rounded border border-line px-1 text-[0.55rem] text-fg-4">
                            잠김
                          </span>
                        )}
                        {item.hidden && (
                          <span className="shrink-0 rounded border border-line px-1 text-[0.55rem] text-fg-4">
                            숨김
                          </span>
                        )}
                      </div>
                      <textarea
                        value={drafts[item.id] ?? item.text}
                        onChange={(e) =>
                          setDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))
                        }
                        onBlur={() => commitDraft(item)}
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            // 패널 닫힘(Esc)과 분리 — 임시본만 되돌린다.
                            e.stopPropagation();
                            revertDraft(item.id);
                          } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                            e.currentTarget.blur();
                          }
                        }}
                        disabled={item.locked}
                        rows={Math.min(4, Math.max(1, (drafts[item.id] ?? item.text).split("\n").length))}
                        aria-label={`${item.pageIndex + 1}페이지 ${dialogueItemTypeLabel(item)} 대사 수정`}
                        className={cx(
                          inputClass,
                          "resize-y py-1 leading-snug disabled:cursor-not-allowed disabled:opacity-50"
                        )}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      <p className="border-t border-line/60 px-3 py-1.5 text-[0.58rem] leading-snug text-fg-4">
        수정은 포커스 아웃 또는 ⌘Enter 로 저장 · 바꾸기/수정 모두 ⌘Z 로 복구할 수 있어요.
      </p>
    </section>
  );
}
