import { useState } from "react";
import { Link } from "react-router-dom";

import { RESOURCE_BUTTON, RESOURCE_PAGES } from "./navigation";
import { ProviderStatus } from "./ProviderStatus";
import { LocalSaveNotice, ResourceLayout } from "./ResourceLayout";
import { SavedBoard } from "./SavedBoard";
import { downloadText, useCreatorWorkspace } from "./workspace";

import { attributionMarkdown, parseWorkspace } from "@/shared/lib/creator-resources";

const WORKFLOW = [
  { step: "01", title: "발견", body: "작품·판본·복식·소품·지원사업을 목적에 맞게 찾습니다." },
  { step: "02", title: "검토", body: "원문, 제공처, 조회일과 이용조건을 함께 확인하고 보드에 저장합니다." },
  { step: "03", title: "제작", body: "정리한 자료를 Story Lab·Studio·출판 준비로 이어갑니다." },
] as const;

export function CreatorHubPage() {
  const { workspace, update, restore, readSnapshot, ready, writable, saving, error } = useCreatorWorkspace();
  const [restoreMode, setRestoreMode] = useState<"merge" | "replace">("merge");
  const [restoring, setRestoring] = useState(false);
  const [importNotice, setImportNotice] = useState("");
  const importBackup = async (file: File | undefined) => {
    if (!file || restoring || saving) return;
    setRestoring(true);
    const mode = restoreMode;
    try {
      if (file.size > 1000000) throw new Error("1 MB 이하의 백업을 선택하세요.");
      const raw = await file.text();
      parseWorkspace(raw);
      const expectedRaw = mode === "replace" ? readSnapshot() : undefined;
      const question = mode === "merge"
        ? "현재 자료와 작성한 기획서는 유지하고, 백업의 새 자료·빈 기획 항목·체크 항목을 합칠까요?"
        : "현재 창작 보드·기획서·체크리스트를 모두 이 백업으로 대체할까요? 먼저 현재 보드를 백업하는 것을 권장합니다.";
      if (!window.confirm(question)) return;
      if (await restore(raw, mode, expectedRaw)) setImportNotice(mode === "merge" ? "현재 작업을 유지하고 백업을 합쳤습니다." : "백업으로 보드를 대체했습니다.");
    } catch (cause) { setImportNotice(cause instanceof Error ? cause.message : "백업을 읽지 못했습니다."); }
    finally { setRestoring(false); }
  };
  return <ResourceLayout title="창작 리서치 데스크" intro="작품과 판본을 찾고, 출처가 있는 창작 자료를 모아 이야기 설계와 Studio 작업으로 연결하세요. 외부 데이터는 제공처·조회일·이용조건을 함께 보존합니다.">
    <ProviderStatus />
    <section className="grid gap-3 rounded-2xl border border-line bg-card/40 p-5 sm:grid-cols-3 sm:p-6" aria-label="리서치 작업 흐름">
      {WORKFLOW.map((item) => <article key={item.step} className="rounded-xl border border-line bg-panel p-4">
        <span className="text-xs font-bold text-accent">{item.step}</span>
        <h2 className="mt-2 font-bold text-fg">{item.title}</h2>
        <p className="mt-2 text-sm leading-6 text-fg-2">{item.body}</p>
      </article>)}
    </section>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {RESOURCE_PAGES.slice(1).map((page, index) => <Link to={page.path} key={page.path} className="group rounded-2xl border border-line bg-panel p-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent hover:bg-raised">
        <span className="text-sm text-accent">{String(index + 1).padStart(2, "0")}</span>
        <h2 className="mt-4 text-xl font-bold">{page.title} →</h2><p className="mt-3 leading-7 text-fg-2">{page.description}</p>
      </Link>)}
    </div>
    <section className="space-y-4 rounded-2xl border border-line p-6" aria-labelledby="hub-saved-title">
      <h2 id="hub-saved-title" className="text-xl font-bold">내 창작 보드 · {workspace.saved.length}개</h2>
      <p className="text-fg-2">검색 결과를 저장하고, 아래 보드에서 제공처·마감 날짜별로 찾아보세요. 백업은 기본적으로 현재 작업을 유지하며 합칩니다.</p>
      <div className="flex flex-wrap gap-3">
        <button className={RESOURCE_BUTTON} disabled={!workspace.saved.length} onClick={() => downloadText("toonstudio-sources.md", attributionMarkdown(workspace.saved))}>출처 목록 내보내기</button>
        <button className={RESOURCE_BUTTON} onClick={() => downloadText("toonstudio-creator-board.json", JSON.stringify(workspace, null, 2), "application/json")}>자료·기획서 백업</button>
      </div>
      <label htmlFor="creator-board-replace" className="flex min-h-11 items-center gap-3 text-sm">
        <input id="creator-board-replace" type="checkbox" disabled={!ready || !writable || restoring || saving} className="size-5" checked={restoreMode === "replace"} onChange={(event) => setRestoreMode(event.target.checked ? "replace" : "merge")} />
        현재 보드를 유지하지 않고 백업으로 완전히 대체
      </label>
      <label htmlFor="creator-board-import" className="block text-sm font-semibold">{restoreMode === "merge" ? "백업 합치기 · 현재 자료와 작성한 기획서 유지" : "백업 대체 · 현재 작업이 변경됩니다"}
        <input id="creator-board-import" className="mt-2 block max-w-full text-sm" type="file" disabled={!ready || !writable || restoring || saving} accept="application/json,.json" onChange={(event) => { void importBackup(event.target.files?.[0]); event.target.value = ""; }} />
      </label>
      <p role="status" className="text-sm text-fg-2">{importNotice}</p>
    </section>
    <SavedBoard items={workspace.saved} disabled={!ready || !writable || saving} onRemove={(id) => { void update((value) => ({ ...value, saved: value.saved.filter((item) => item.id !== id) })); }} />
    <LocalSaveNotice error={error} writable={writable} saving={saving} />
  </ResourceLayout>;
}
