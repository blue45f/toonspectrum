import { useState } from "react";

import { RESOURCE_BUTTON, RESOURCE_INPUT } from "./navigation";
import { LocalSaveNotice, ResourceLayout } from "./ResourceLayout";
import { downloadText, useCreatorWorkspace } from "./workspace";

import { STORY_FIELDS, STORY_LABELS, storyMarkdown } from "@/lib/creator-resources";

export function StoryLabPage() {
  const { workspace, update, error } = useCreatorWorkspace();
  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const [notice, setNotice] = useState("");
  const story = draft ?? workspace.story;
  return <ResourceLayout title="스토리 연구실" intro="인물, 욕망, 장애물과 선택을 차근차근 정리하세요. 외부 AI 호출 없이 직접 작성하는 기획 워크시트입니다.">
    <div className="grid gap-6 lg:grid-cols-2">
      <form className="space-y-5 rounded-2xl border border-line bg-panel p-5" onSubmit={(event) => { event.preventDefault(); if (update((value) => ({ ...value, story }))) { setDraft(null); setNotice("이 브라우저에 기획서를 저장했습니다."); } }}>
        {STORY_FIELDS.map((field) => <label key={field} htmlFor={`story-${field}`} className="block text-sm font-semibold">{STORY_LABELS[field]}
          <textarea id={`story-${field}`} className={`${RESOURCE_INPUT} mt-2 resize-y`} rows={field === "title" ? 1 : 3} maxLength={2000} value={story[field] ?? ""} onChange={(event) => { setDraft({ ...story, [field]: event.target.value }); setNotice("아직 저장하지 않은 변경이 있습니다."); }} />
        </label>)}
        <button type="submit" className={RESOURCE_BUTTON}>기획서 저장</button><p role="status" className="text-sm text-fg-2">{notice}</p>
      </form>
      <section className="space-y-5 rounded-2xl border border-line p-6" aria-labelledby="story-preview-title">
        <h2 id="story-preview-title" className="text-xl font-bold">내 이야기의 중심 질문</h2>
        <p className="whitespace-pre-wrap break-words rounded-xl bg-accent-soft p-5 text-lg leading-9">{story.protagonist || "[주인공]"}은(는) {story.desire || "[원하는 것]"}을 얻으려 하지만, {story.obstacle || "[장애물]"} 때문에 선택을 해야 한다. 실패하면 {story.stakes || "[잃는 것]"}이(가) 걸려 있다.</p>
        <p className="text-sm leading-7 text-fg-2">위 문장은 입력한 내용을 배열한 템플릿입니다. 자동 평가나 AI 생성 결과가 아니므로 문장과 조사는 직접 다듬어 주세요.</p>
        <h3 className="font-bold">첫 화를 점검하는 세 가지 질문</h3>
        <p className="leading-8 text-fg-2">주인공이 지금 무엇을 원하나요?<br />그 선택에 어떤 대가가 따르나요?<br />마지막 장면 뒤에 독자가 궁금해할 것은 무엇인가요?</p>
        <button className={RESOURCE_BUTTON} onClick={() => downloadText("webtoon-story-plan.md", storyMarkdown(story))}>현재 기획서 내보내기</button>
        <p className="text-sm leading-7 text-fg-2">고전·공개 소재를 각색하는 경우에도 사용한 원문, 번역문, 삽화의 권리를 각각 확인하고 창작 보드에 출처를 남기세요.</p>
      </section>
    </div>
    <LocalSaveNotice error={error} />
  </ResourceLayout>;
}
