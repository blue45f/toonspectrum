import { Save } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { PROMOTION_GENRES, PROMOTION_KINDS, PROMOTION_STAGES, validatePromotion } from "../../../../../packages/core/src/promotion";
import { PromotionCoverDropzone } from "./PromotionCoverDropzone";
import { PromotionReadiness } from "./PromotionReadiness";
import { PromotionVideo } from "./PromotionVideo";
import { preparePromotionCover } from "./promotion-media";
import { clearPromotionDraft, initialPromotionDraft, readPromotionDraft, savePromotionDraft } from "./promotion-draft";
import type { PromotionDraft as Draft } from "./promotion-draft";
import "./promotion-community.css";


import { promotionClient } from "@/platform/promotion-client";
import { getApiErrorMessage } from "@/platform/api";
import { isNotFoundError } from "@/platform/api-error";
import { NotFoundPage } from "@/shared/components/feedback/NotFoundPage";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { useApp, useHydrated } from "@/shared/lib/store";
import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { formatNumber } from "@toonstudio/core";

const SCOPE = "domains.promotion.PromotionEditorPage";

const KIND_EN: Record<keyof typeof PROMOTION_KINDS, string> = {
  series: "Series · new work",
  trailer: "Promo video",
  process: "Work in progress",
  feedback: "Feedback request",
};
const STAGE_EN: Record<keyof typeof PROMOTION_STAGES, string> = {
  amateur: "Amateur",
  debut: "Debut · new work",
  serializing: "Serializing creator",
};
const GENRE_EN: Record<string, string> = {
  "판타지": "Fantasy",
  "로맨스": "Romance",
  "드라마": "Drama",
  "액션": "Action",
  "일상": "Slice of life",
  "코미디": "Comedy",
  "스릴러": "Thriller",
  "SF": "Sci-fi",
  "무협": "Martial arts",
  "기타": "Other",
};

export function PromotionEditorPage() {
  const bt = useBilingual(SCOPE);
  const { id } = useParams(), userId = useApp((state) => state.userId), hydrated = useHydrated();
  useDocumentTitle(id ? bt("작품 소개 수정 · ToonStudio", "Edit work introduction · ToonStudio") : bt("내 작품 소개하기 · ToonStudio", "Introduce my work · ToonStudio"));
  if (!hydrated || !userId) return <div className="pc-shell pc-narrow"><Link to="/community/promote">{bt("← 홍보 커뮤니티", "← Promotion community")}</Link><div className="pc-empty"><h1>{hydrated ? bt("로그인 후 작품을 소개해 주세요", "Sign in to introduce your work") : bt("로그인 상태 확인 중", "Checking sign-in status")}</h1><p>{bt("상단 로그인 버튼을 이용해 주세요. 작품 감상은 로그인 없이 이용할 수 있어요.", "Use the sign-in button above. Browsing works is available without sign-in.")}</p></div></div>;
  return <PromotionEditor key={`${userId}:${id ?? "new"}`} id={id} userId={userId} />;
}
function PromotionEditor({ id, userId }: { id?: string; userId: string }) {
  const bt = useBilingual(SCOPE);
  const [recovery] = useState(() => id ? null : readPromotionDraft(userId));
  const [draft, setDraft] = useState<Draft>(() => recovery?.status === "restored" ? recovery.value.draft : initialPromotionDraft());
  const [tags, setTags] = useState(() => recovery?.status === "restored" ? recovery.value.tags : "");
  const [draftStatus, setDraftStatus] = useState(() => bt("이 탭에 초안을 자동 임시 저장합니다. 탭을 닫으면 없어질 수 있어요.", "Drafts auto-save in this tab. They may be lost if you close the tab."));
  const published = useRef(false);
  const [version, setVersion] = useState<number | null>(null), [loading, setLoading] = useState(!!id);
  const [error, setError] = useState(""), [sending, setSending] = useState(false), [coverBusy, setCoverBusy] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const busy = useRef(false), live = useRef(true), imageGeneration = useRef(0);
  const navigate = useNavigate();
  useEffect(() => {
    if (id) return;
    const save = () => {
      if (published.current || useApp.getState().userId !== userId) return;
      const result = savePromotionDraft(userId, { draft, tags });
      setDraftStatus(result === "unavailable" ? bt("이 브라우저에서는 임시 저장하지 못했어요. 화면을 닫기 전에 입력 내용을 복사해 주세요.", "Temporary saving isn't available in this browser. Copy your input before closing.") : result === "saved" ? bt("이 탭에 초안 저장됨 · 아직 공개되지 않았어요. 탭을 닫으면 없어질 수 있어요.", "Draft saved in this tab · not published yet. It may be lost if you close the tab.") : bt("이 탭에 초안을 자동 임시 저장합니다. 탭을 닫으면 없어질 수 있어요.", "Drafts auto-save in this tab. They may be lost if you close the tab."));
    };
    const timer = window.setTimeout(save, 300);
    window.addEventListener("pagehide", save);
    return () => { window.clearTimeout(timer); window.removeEventListener("pagehide", save); };
  }, [draft, tags, id, userId, bt]);
  useEffect(() => { live.current = true; return () => { live.current = false; imageGeneration.current += 1; }; }, []);
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    promotionClient.detail(id, controller.signal).then((data) => {
      if (controller.signal.aborted) return;
      if (!data.canManage) throw new Error(bt("작성자만 수정할 수 있어요.", "Only the author can edit."));
      const parsed = validatePromotion(data.post);
      if (!parsed.value) throw new Error(bt("기존 글을 확인하지 못했어요. 빈 양식으로 덮어쓰지 않습니다.", "Couldn't verify the existing post. It won't be overwritten with an empty form."));
      setDraft({ ...parsed.value, rightsConfirmed: false }); setTags(parsed.value.tags.join(", ")); setVersion(data.post.version);
    }).catch(async (cause: unknown) => {
      if (controller.signal.aborted) return;
      // 존재하지 않는 홍보글 id는 404 전용 화면으로 분리한다(일시 오류·권한 오류와 구분).
      if (isNotFoundError(cause)) {
        setNotFound(true);
        return;
      }
      setError(await getApiErrorMessage(cause, bt("게시물을 불러오지 못했어요.", "Couldn't load the post.")));
    })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, bt]);
  const field = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((previous) => ({ ...previous, [key]: value }));
  const upload = async (file: File | undefined) => {
    if (!file) return;
    const generation = ++imageGeneration.current; setCoverBusy(true); setError("");
    try { const cover = await preparePromotionCover(file); if (live.current && generation === imageGeneration.current) field("cover", cover); }
    catch (cause) { if (live.current && generation === imageGeneration.current) setError(cause instanceof Error ? cause.message : bt("표지를 변환하지 못했어요.", "Couldn't convert the cover.")); }
    finally { if (live.current && generation === imageGeneration.current) setCoverBusy(false); }
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy.current || coverBusy || useApp.getState().userId !== userId) return;
    const parsed = validatePromotion({ ...draft, tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean) });
    if (!parsed.value) { setError(parsed.error); return; }
    if (id && version === null) { setError(bt("기존 게시물을 먼저 불러와 주세요.", "Load the existing post first.")); return; }
    busy.current = true; setSending(true); setError("");
    try {
      let targetId = id;
      if (id && version !== null) await promotionClient.update(id, parsed.value, version);
      else targetId = (await promotionClient.create(parsed.value)).id;
      if (live.current && useApp.getState().userId === userId && targetId) {
        published.current = true;
        if (!id) clearPromotionDraft(userId);
        navigate(`/community/promote/${encodeURIComponent(targetId)}`);
      }
    } catch (cause) { const message = await getApiErrorMessage(cause, bt("등록하지 못했어요. 입력 내용은 유지됩니다.", "Couldn't publish. Your input is kept.")); if (live.current) setError(message); }
    finally { busy.current = false; if (live.current) setSending(false); }
  };
  if (notFound) return <NotFoundPage />;
  return <div className="pc-shell pc-narrow"><Link to={id ? `/community/promote/${encodeURIComponent(id)}` : "/community/promote"}>← {id ? bt("게시물로 돌아가기", "Back to post") : bt("홍보 커뮤니티", "Promotion community")}</Link><header className="pc-editor-heading"><p className="pc-eyebrow">YOUR STORY STARTS HERE</p><h1>{id ? bt("작품 소개 수정", "Edit work introduction") : bt("내 작품 소개하기", "Introduce my work")}</h1><p>{bt("첫 독자에게 작품의 매력과 만나러 갈 곳을 알려주세요.", "Tell your first readers what makes your work special and where to find it.")}</p></header>
    {!id && <aside className="pc-notice" aria-label={bt("홍보 초안 저장 안내", "Draft saving notice")}>{recovery?.status === "restored" && <p>{bt("이 탭에 임시 저장한 초안을 불러왔어요. 게시 권한은 공개 전에 다시 확인해 주세요.", "Restored your auto-saved draft from this tab. Re-check publishing rights before posting.")}</p>}<p role="status">{draftStatus}</p></aside>}
    {error && <p className="pc-error" role="alert">{error}</p>}{loading && <p role="status">{bt("기존 내용을 불러오고 있어요.", "Loading the existing content…")}</p>}
    {!loading && (!id || version !== null) && <form className="pc-form" onSubmit={(event) => void submit(event)}><fieldset disabled={sending}><legend className="sr-only">{bt("작품 소개 작성", "Write a work introduction")}</legend>
      <div className="pc-form-row"><label>{bt("소개 유형", "Introduction type")}<select value={draft.kind} onChange={(event) => field("kind", event.target.value as Draft["kind"])}>{Object.entries(PROMOTION_KINDS).map(([value, label]) => <option key={value} value={value}>{bt(label, KIND_EN[value as keyof typeof PROMOTION_KINDS] ?? label)}</option>)}</select></label><label>{bt("활동 단계", "Creator stage")}<select value={draft.stage} onChange={(event) => field("stage", event.target.value as Draft["stage"])}>{Object.entries(PROMOTION_STAGES).map(([value, label]) => <option key={value} value={value}>{bt(label, STAGE_EN[value as keyof typeof PROMOTION_STAGES] ?? label)}</option>)}</select></label><label>{bt("장르", "Genre")}<select value={draft.genre} onChange={(event) => field("genre", event.target.value as Draft["genre"])}>{PROMOTION_GENRES.map((genre) => <option key={genre}>{bt(genre, GENRE_EN[genre] ?? genre)}</option>)}</select></label></div>
      <label>{bt("작품명", "Work title")}<input required minLength={2} maxLength={100} value={draft.seriesTitle} onChange={(event) => field("seriesTitle", event.target.value)} placeholder={bt("내가 만들고 있는 웹툰의 이름", "The name of the webtoon you're making")} /></label>
      <label>{bt("소개 제목", "Introduction headline")}<input required minLength={3} maxLength={100} value={draft.title} onChange={(event) => field("title", event.target.value)} placeholder={bt("독자에게 전하고 싶은 한 문장", "One line for your readers")} /></label>
      <label>{bt("작품·작업 소개", "About the work & process")}<textarea required minLength={20} maxLength={4000} rows={9} value={draft.description} onChange={(event) => field("description", event.target.value)} placeholder={bt("줄거리, 작품의 매력, 연재 일정, 함께 이야기하고 싶은 부분을 적어 주세요. 피드백 요청은 궁금한 점을 구체적으로 적어 주세요.", "Story, highlights, schedule, and what you'd like to talk about. For feedback requests, be specific about your questions.")} /></label><p className="pc-caption">{formatNumber(draft.description.length)} / 4,000{bt("자 · 연락처·비공개 원고·스포일러 공개에 주의해 주세요.", " characters · avoid contact info, unpublished manuscripts, and spoilers.")}</p>
      <label>{bt("작품 보러 가기 주소", "Where to read")}<input type="url" maxLength={1000} value={draft.readingUrl} onChange={(event) => field("readingUrl", event.target.value)} placeholder={bt("https://… (네이버 도전만화, WEBTOON, Tapas, 공개 작품 등)", "https://… (Naver Challenge, WEBTOON, Tapas, published works, …)")} /></label>
      <label>{bt("홍보 영상 주소", "Promo video URL")}<input type="url" required={draft.kind === "trailer"} maxLength={1000} value={draft.videoUrl} onChange={(event) => field("videoUrl", event.target.value)} placeholder={bt("YouTube·Shorts 또는 공개 Vimeo 영상 링크", "YouTube · Shorts or public Vimeo link")} /></label><p className="pc-notice">{bt("영상 파일을 직접 저장하지 않고 링크로 연결합니다. YouTube·Vimeo에서 게시 및 임베드 권한을 확인해 주세요. 파일 업로드·영상 변환은 이 화면에서 제공하지 않습니다.", "Videos are linked, not stored. Check publishing and embedding permissions on YouTube · Vimeo. File upload and video conversion aren't offered here.")}</p><PromotionVideo url={draft.videoUrl} title={draft.seriesTitle || bt("미리보기", "Preview")} />
      <PromotionCoverDropzone cover={draft.cover} busy={coverBusy} disabled={sending}
        onSelect={(file) => { void upload(file); }}
        onRemove={() => { imageGeneration.current += 1; field("cover", ""); }} />
      <label>{bt("태그", "Tags")}<input maxLength={200} value={tags} onChange={(event) => setTags(event.target.value)} placeholder={bt("성장물, 학원물, 첫연재 (쉼표로 구분, 최대 8개)", "Growth, school life, debut (comma-separated, up to 8)")} /></label><label>{bt("콘텐츠 안내", "Content notes")}<input maxLength={150} value={draft.contentWarning} onChange={(event) => field("contentWarning", event.target.value)} placeholder={bt("예: 일부 전투 장면, 초반 줄거리 스포일러", "E.g. some fight scenes, early-story spoilers")} /></label>
      <div className="pc-notice"><strong>{bt("공개 전에 확인해 주세요", "Before you publish")}</strong><p>{bt("본인이 창작했거나 게시 허락을 받은 작품만 소개해 주세요. 무단 복제·성인물·개인정보 노출·도배는 허용하지 않습니다. 최근 24시간 5개, 계정당 총 100개까지 등록할 수 있습니다.", "Only introduce works you created or have permission to share. Plagiarism, adult content, personal data exposure, and flooding are not allowed. Up to 5 posts per 24 hours and 100 per account.")}</p></div>
      <label className="pc-check"><input type="checkbox" checked={draft.rightsConfirmed} onChange={(event) => field("rightsConfirmed", event.target.checked)} required /><span>{bt("작품·표지·영상·사용 음원의 게시 권한이 있으며, 공개 가능한 콘텐츠임을 확인했습니다.", "I confirm I hold publishing rights for the work, cover, video, and audio, and that the content is safe to publish.")}</span></label>
      <PromotionReadiness draft={draft} tags={tags} />
      <button className="pc-button pc-primary" type="submit" disabled={sending || coverBusy}><Save size={17} aria-hidden="true" />{sending ? bt("저장 중…", "Saving…") : id ? bt("변경 사항 저장", "Save changes") : bt("작품 소개 공개하기", "Publish introduction")}</button>
    </fieldset></form>}
  </div>;
}
