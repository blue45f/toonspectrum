import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { RESOURCE_BUTTON, RESOURCE_INPUT } from "./navigation";
import { LocalSaveNotice, ResourceLayout } from "./ResourceLayout";
import { downloadText, useCreatorWorkspace } from "./workspace";

import type { StoryDraft } from "@/shared/lib/creator-workspace-persistence";

import { STORY_FIELDS, STORY_LABELS, storyMarkdown } from "@/shared/lib/creator-resources";
import {
  changedStoryFields, CREATOR_STORY_DRAFT_KEY, editStoryDraft, parseStoryDraft,
  resolveStoryConflict, storyDraftConflicts, storyDraftView,
} from "@/shared/lib/creator-workspace-persistence";
import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import { MotionIllustration } from "@/shared/motion-assets";

const SCOPE = "domains.creator.resources.StoryLabPage";
const tx = (source: string): string => translateCurrentStaticSourceText(SCOPE, "ko", source);

export function StoryLabPage() {
  useBilingualI18nRevision();
  const { workspace, saveStory, clearError, error, ready, saving, writable } = useCreatorWorkspace();
  const [draft, setDraft] = useState<StoryDraft | null>(null);
  const active = useRef(false);
  const latestDraft = useRef<StoryDraft | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [corruptDraft, setCorruptDraft] = useState(false);
  const [notice, setNotice] = useState("");
  const [draftError, setDraftError] = useState("");
  const location = useLocation();
  const navigate = useNavigate();
  const seedAttempted = useRef(false);
  useEffect(() => {
    active.current = true;
    let raw: string | null = null;
    let storageAvailable = true;
    try { raw = window.sessionStorage.getItem(CREATOR_STORY_DRAFT_KEY); }
    catch {
      storageAvailable = false;
      setDraftError(tx("브라우저가 임시 보관을 차단했습니다. 편집은 가능하지만 이동 전에 현재 기획서를 파일로 내보내세요."));
    }
    if (storageAvailable) {
      try {
        const recovered = parseStoryDraft(raw);
        setDraft(recovered); latestDraft.current = recovered;
        if (recovered && changedStoryFields(recovered).length) setNotice(tx("이 탭의 미저장 초안을 복구했습니다. 저장된 기획서와 비교한 뒤 저장하세요."));
      } catch {
        setCorruptDraft(true);
        setDraftError(tx("임시 초안을 읽을 수 없습니다. 기존 임시 데이터를 보존했습니다. 편집하려면 아래에서 임시 초안을 명시적으로 지워주세요."));
      }
    }
    setDraftReady(true);
    return () => { active.current = false; };
  }, []);
  const dirty = draft ? changedStoryFields(draft).length : 0;
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty]);
  // 홈의 아이디어 입력이 ?idea= 로 넘긴 문장: 기존 초안·저장본의 가제를 덮지 않고 빈 가제일 때만 한 번 채운다.
  useEffect(() => {
    if (!draftReady || seedAttempted.current) return;
    seedAttempted.current = true;
    const idea = new URLSearchParams(location.search).get("idea")?.trim();
    if (!idea) return;
    navigate(`${location.pathname}${location.hash}`, { replace: true });
    if (corruptDraft) return;
    const current = latestDraft.current;
    if (storyDraftView(workspace.story, current).title?.trim()) return;
    const seeded = editStoryDraft(current, workspace.story, "title", idea.slice(0, 200));
    latestDraft.current = seeded; setDraft(seeded);
    try { window.sessionStorage.setItem(CREATOR_STORY_DRAFT_KEY, JSON.stringify(seeded)); }
    catch { /* 임시 보관 실패 안내는 기존 편집 경로가 담당한다. */ }
    setNotice(tx("홈에서 입력한 아이디어를 작품 가제로 가져왔습니다. 다듬은 뒤 기획서를 저장하세요."));
  }, [draftReady, corruptDraft, location.search, location.pathname, location.hash, navigate, workspace.story]);
  const remember = (next: StoryDraft) => {
    clearError();
    latestDraft.current = next; setDraft(next); setDraftError("");
    try {
      if (changedStoryFields(next).length) window.sessionStorage.setItem(CREATOR_STORY_DRAFT_KEY, JSON.stringify(next));
      else window.sessionStorage.removeItem(CREATOR_STORY_DRAFT_KEY);
      setNotice(changedStoryFields(next).length ? tx("이 탭에 임시 보관했습니다. 기획서 저장을 눌러 보드에 반영하세요.") : tx("저장본과 같은 내용입니다."));
    } catch {
      setDraftError(tx("임시 보관에 실패했습니다. 화면의 입력은 유지했으니 이동하기 전에 현재 기획서를 내보내세요."));
    }
  };
  const discard = () => {
    if (!window.confirm(tx("이 탭의 미저장 초안을 지우고 최신 저장본으로 돌아갈까요? 필요한 내용은 먼저 내보내세요."))) return;
    try {
      window.sessionStorage.removeItem(CREATOR_STORY_DRAFT_KEY);
      clearError(); latestDraft.current = null; setDraft(null); setCorruptDraft(false); setDraftError(""); setNotice(tx("임시 초안을 지웠습니다. 최신 저장본을 표시합니다."));
    } catch { setDraftError(tx("임시 초안을 지우지 못했습니다. 브라우저 저장소 설정을 확인하세요.")); }
  };
  const submit = async () => {
    if (!draft || !dirty || saving) return;
    const submitted = draft;
    const saved = await saveStory(submitted);
    if (!saved || !active.current || latestDraft.current !== submitted) return;
    latestDraft.current = null; setDraft(null); setNotice(tx("기획서를 저장했습니다. 다른 탭에서 바꾼 별도 항목도 유지했습니다."));
    try { window.sessionStorage.removeItem(CREATOR_STORY_DRAFT_KEY); setDraftError(""); }
    catch { setDraftError(tx("기획서는 저장했지만 임시 보관본을 지우지 못했습니다. 다음 방문에서 같은 초안이 복구될 수 있습니다.")); }
  };
  const story = storyDraftView(workspace.story, draft);
  const conflicts = draft ? storyDraftConflicts(workspace.story, draft) : [];
  const completedCount = STORY_FIELDS.filter((field) => story[field]?.trim()).length;
  return <ResourceLayout title={tx("스토리 연구실")} intro={tx("인물, 욕망, 장애물과 선택을 차근차근 정리하세요. 외부 AI 호출 없이 직접 작성하는 기획 워크시트입니다.")}>
    <div className="grid gap-6 lg:grid-cols-2">
      <form className="space-y-5 rounded-2xl border border-line bg-panel p-5" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <p className="text-sm text-fg-2">{formatI18nTemplate(tx("작성한 항목 {v0}/8 · 미저장 변경 {v1}개"), { v0: completedCount, v1: dirty })}</p>
        <fieldset disabled={!ready || !draftReady || saving || corruptDraft} className="space-y-5">
          <legend className="sr-only">{tx("웹툰 기획 항목")}</legend>
          {STORY_FIELDS.map((field) => <label key={field} htmlFor={`story-${field}`} className="block text-sm font-semibold">{tx(STORY_LABELS[field])}
            <textarea id={`story-${field}`} className={`${RESOURCE_INPUT} mt-2 resize-y`} rows={field === "title" ? 1 : 3} maxLength={2000} value={story[field] ?? ""} onChange={(event) => remember(editStoryDraft(draft, workspace.story, field, event.target.value))} />
          </label>)}
        </fieldset>
        <div className="flex flex-wrap gap-3">
          <button type="submit" className={RESOURCE_BUTTON} disabled={!ready || !draftReady || !writable || saving || !dirty || conflicts.length > 0 || corruptDraft}>{saving ? tx("저장 중…") : tx("기획서 저장")}</button>
          {(dirty > 0 || corruptDraft) && <button type="button" className={RESOURCE_BUTTON} disabled={saving} onClick={discard}>{tx("임시 초안 지우기")}</button>}
        </div>
        <p role="status" className="text-sm leading-6 text-fg-2">{notice}</p>
        {draftError && <p role="alert" className="text-sm leading-6">{draftError}</p>}
        <p className="text-xs leading-6 text-fg-2">{tx("임시 초안은 이 탭의 세션 저장소에 보관합니다. 새로고침·페이지 이동 후 복구할 수 있지만, 탭 종료·브라우저 정책·저장소 삭제 후 복구는 보장하지 않습니다. 중요 작업은 파일로 내보내세요.")}</p>
      </form>
      <section className="space-y-5 rounded-2xl border border-line p-6" aria-labelledby="story-preview-title">
        <div className="flex items-center gap-3">
          <MotionIllustration name="lightbulb" size="md" className="shrink-0 text-accent" title={tx("이야기의 중심 질문 일러스트")} />
          <h2 id="story-preview-title" className="text-xl font-bold">{tx("내 이야기의 중심 질문")}</h2>
        </div>
        <p className="whitespace-pre-wrap break-words rounded-xl bg-accent-soft p-5 text-lg leading-9">{formatI18nTemplate(tx("{v0}은(는) {v1}을 얻으려 하지만, {v2} 때문에 선택을 해야 한다. 실패하면 {v3}이(가) 걸려 있다."), {
          v0: story.protagonist || tx("[주인공]"),
          v1: story.desire || tx("[원하는 것]"),
          v2: story.obstacle || tx("[장애물]"),
          v3: story.stakes || tx("[잃는 것]"),
        })}</p>
        <p className="text-sm leading-7 text-fg-2">{tx("위 문장은 입력한 내용을 배열한 템플릿입니다. 자동 평가나 AI 생성 결과가 아니므로 문장과 조사는 직접 다듬어 주세요.")}</p>
        {draft && conflicts.length > 0 && <section aria-label={tx("다른 탭과의 기획 충돌")} className="space-y-4 rounded-xl border border-line p-4">
          <h3 className="font-bold" role="alert">{tx("같은 항목이 다른 탭에서 변경되었습니다")}</h3>
          <p className="text-sm text-fg-2">{tx("항목별로 내용을 선택한 후 저장하세요. 선택만으로 저장본을 덮어쓰지는 않습니다.")}</p>
          {conflicts.map((field) => <div key={field} className="space-y-2 border-t border-line pt-3">
            <h4 className="font-semibold">{tx(STORY_LABELS[field])}</h4>
            <p className="whitespace-pre-wrap break-words text-sm">{formatI18nTemplate(tx("저장본: {v0}"), { v0: workspace.story[field] || tx("(비어 있음)") })}</p>
            <p className="whitespace-pre-wrap break-words text-sm">{formatI18nTemplate(tx("내 초안: {v0}"), { v0: draft.story[field] || tx("(비어 있음)") })}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={RESOURCE_BUTTON} onClick={() => remember(resolveStoryConflict(draft, workspace.story, field, "saved"))}>{tx("저장본 유지")}</button>
              <button type="button" className={RESOURCE_BUTTON} onClick={() => remember(resolveStoryConflict(draft, workspace.story, field, "draft"))}>{tx("내 초안 선택")}</button>
            </div>
          </div>)}
        </section>}
        <h3 className="font-bold">{tx("첫 화를 점검하는 세 가지 질문")}</h3>
        <p className="leading-8 text-fg-2">{tx("주인공이 지금 무엇을 원하나요?")}<br />{tx("그 선택에 어떤 대가가 따르나요?")}<br />{tx("마지막 장면 뒤에 독자가 궁금해할 것은 무엇인가요?")}</p>
        <button className={RESOURCE_BUTTON} onClick={() => downloadText("webtoon-story-plan.md", storyMarkdown(story))}>{tx("현재 기획서 내보내기")}</button>
        <p className="text-sm leading-7 text-fg-2">{tx("고전·공개 소재를 각색하는 경우에도 사용한 원문, 번역문, 삽화의 권리를 각각 확인하고 창작 보드에 출처를 남기세요.")}</p>
      </section>
    </div>
    <LocalSaveNotice error={error} writable={writable} saving={saving} />
  </ResourceLayout>;
}
