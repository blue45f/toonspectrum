import { LockKeyhole, Shuffle, UnlockKeyhole } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import { freshSeed, parseStoryCode, rerollStory, STORY_DECKS, storyIndices, storyText } from "../../lab/creative-core";
import { downloadFile } from "../../lab/creative-export";
import { CopyButton, DraftNotice, StudioBridge } from "../../lab/LabShared";
import { recordResult, usePlayDraft } from "../../lab/play-storage";
import type { PlayGameProps } from "../../play-types";

type Draft = { indices: number[]; locks: boolean[]; note: string };
const validDraft = (value: unknown): value is Draft => {
  if (!value || typeof value !== "object") return false;
  const v = value as Draft;
  return Array.isArray(v.indices) && !!parseStoryCode(v.indices.join(".")) && Array.isArray(v.locks) && v.locks.length === 5 && v.locks.every((l) => typeof l === "boolean") && typeof v.note === "string" && v.note.length <= 1200;
};
export default function StoryDice({ seed }: PlayGameProps) {
  const [params] = useSearchParams(); const shared = parseStoryCode(params.get("idea"));
  const { value, setValue, saved } = usePlayDraft<Draft>(`story-${shared?.join("-") ?? "draft"}`, () => ({ indices: shared ?? storyIndices(seed ?? "story"), locks: [false, false, false, false, false], note: "" }), validDraft);
  const [message, setMessage] = useState("");
  const text = `${storyText(value.indices)}\n\n나의 로그라인\n${value.note}`;
  const shareUrl = `${window.location.origin}/play?game=story-dice&idea=${value.indices.join(".")}`;
  return <div className="play-lab-content">
    <div className="play-exercise-heading"><div><span className="play-eyebrow">STORY DICE · WHAT IF?</span><h2>이 조합, 이야기가 되겠는데?</h2><p>마음에 드는 카드는 잠그고, 나머지만 바꿔 보세요. 모든 소재는 직접 만든 한국어 창작 프롬프트입니다.</p></div>
      <button className="play-button primary" type="button" disabled={value.locks.every(Boolean)} onClick={() => { setValue({ ...value, indices: rerollStory(value.indices, value.locks, freshSeed()) }); setMessage("잠긴 카드와 메모는 유지하고 새 조합을 만들었습니다."); }}><Shuffle size={16} />새 조합 만들기</button>
    </div>
    <div className="play-story-cards">{STORY_DECKS.map((deck, index) => <article className="play-story-card" key={deck.label} data-locked={value.locks[index]}>
      <div className="play-story-card-top"><span>{String(index + 1).padStart(2, "0")} / {deck.label}</span><button className="play-icon-button" type="button" aria-label={`${deck.label} 카드 ${value.locks[index] ? "잠금 해제" : "잠그기"}`} aria-pressed={value.locks[index]} onClick={() => setValue({ ...value, locks: value.locks.map((lock, i) => i === index ? !lock : lock) })}>{value.locks[index] ? <LockKeyhole size={16} /> : <UnlockKeyhole size={16} />}</button></div>
      <p>{deck.items[value.indices[index]]}</p><span className="play-story-mark" aria-hidden="true">{["✳", "◎", "⌂", "↗", "↻"][index]}</span>
    </article>)}</div>
    <label className="play-field"><span>나의 로그라인 <small>누가, 무엇을 원하고, 어떤 장애물과 마주하나요?</small></span><textarea value={value.note} maxLength={1200} rows={4} placeholder="이 카드들이 한 이야기로 만난다면…" onChange={(event) => setValue({ ...value, note: event.target.value })} /><span className="play-note">{value.note.length}/1200</span></label>
    <div className="play-actions"><CopyButton text={text} label="창작 노트 복사" /><CopyButton text={shareUrl} label="같은 주제 링크 복사" />
      <button className="play-button" type="button" onClick={() => downloadFile(`# ToonStudio 창작 노트\n\n${text}`, "toonstudio-story.md")}>노트 파일 저장</button>
      <button className="play-button primary" type="button" disabled={!value.note.trim()} onClick={() => setMessage(recordResult({ id: `story-${value.indices.join("-")}`, game: "story-dice", label: "나만의 로그라인 완성" }) ? "로그라인 완성을 내 창작 기록에 남겼습니다." : "기록 저장이 차단되었습니다. 창작 노트를 파일로 보관해 주세요.")}>로그라인 완성</button>
    </div>
    <p className="play-note">공유 링크에는 주제 카드만 담기며 작성한 메모는 포함되지 않습니다. AI 생성·서버 전송을 사용하지 않습니다.</p>
    <p className="play-feedback" role="status">{message}</p><DraftNotice saved={saved} /><StudioBridge />
  </div>;
}
