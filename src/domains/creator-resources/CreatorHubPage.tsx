import { useState } from "react";
import { Link } from "react-router-dom";

import { RESOURCE_BUTTON, RESOURCE_PAGES } from "./navigation";
import { LocalSaveNotice, ResourceLayout } from "./ResourceLayout";
import { downloadText, useCreatorWorkspace } from "./workspace";

import { attributionMarkdown, parseWorkspace } from "@/lib/creator-resources";

export function CreatorHubPage() {
  const { workspace, restore, error } = useCreatorWorkspace();
  const [importNotice, setImportNotice] = useState("");
  const importBackup = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > 1000000) throw new Error("1 MB 이하의 백업을 선택하세요.");
      const raw = await file.text();
      parseWorkspace(raw);
      if (!window.confirm("현재 브라우저의 창작 보드·기획서·체크리스트를 이 백업으로 대체할까요?")) return;
      if (restore(raw)) setImportNotice("백업을 복원했습니다.");
    } catch (cause) { setImportNotice(cause instanceof Error ? cause.message : "백업을 읽지 못했습니다."); }
  };
  return <ResourceLayout title="아이디어를 다음 작업으로" intro="소재를 모으고, 이야기를 설계하고, 한 장면을 완성하세요. 외부 자료는 출처와 이용조건을 함께 확인합니다.">
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {RESOURCE_PAGES.slice(1).map((page, index) => <Link to={page.path} key={page.path} className="group rounded-2xl border border-line bg-panel p-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent hover:bg-raised">
        <span className="text-sm text-accent">{String(index + 1).padStart(2, "0")}</span>
        <h2 className="mt-4 text-xl font-bold">{page.title} →</h2><p className="mt-3 leading-7 text-fg-2">{page.description}</p>
      </Link>)}
    </div>
    <section className="space-y-4 rounded-2xl border border-line p-6" aria-labelledby="hub-saved-title">
      <h2 id="hub-saved-title" className="text-xl font-bold">내 창작 보드 · {workspace.saved.length}개</h2>
      <p className="text-fg-2">검색 결과의 저장 버튼으로 참고 자료와 지원사업을 모아보세요. 각 검색 페이지에서 저장한 항목을 다시 확인하고 삭제할 수 있습니다.</p>
      <div className="flex flex-wrap gap-3">
        <button className={RESOURCE_BUTTON} disabled={!workspace.saved.length} onClick={() => downloadText("toonstudio-sources.md", attributionMarkdown(workspace.saved))}>출처 목록 내보내기</button>
        <button className={RESOURCE_BUTTON} onClick={() => downloadText("toonstudio-creator-board.json", JSON.stringify(workspace, null, 2), "application/json")}>자료·기획서 백업</button>
      </div>
      <label htmlFor="creator-board-import" className="block text-sm font-semibold">백업 복원 · 현재 브라우저 보드를 대체합니다
        <input id="creator-board-import" className="mt-2 block max-w-full text-sm" type="file" accept="application/json,.json" onChange={(event) => { void importBackup(event.target.files?.[0]); event.target.value = ""; }} />
      </label>
      <p role="status" className="text-sm text-fg-2">{importNotice}</p>
    </section>
    <LocalSaveNotice error={error} />
  </ResourceLayout>;
}
