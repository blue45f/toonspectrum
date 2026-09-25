import { ImagePlus, Save } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { PROMOTION_GENRES, PROMOTION_KINDS, PROMOTION_STAGES, validatePromotion } from "../../../../../packages/core/src/promotion";
import { PromotionVideo } from "./PromotionVideo";
import { preparePromotionCover } from "./promotion-media";
import { clearPromotionDraft, initialPromotionDraft, readPromotionDraft, savePromotionDraft } from "./promotion-draft";
import type { PromotionDraft as Draft } from "./promotion-draft";
import "./promotion-community.css";


import { promotionClient } from "@/platform/promotion-client";
import { getApiErrorMessage } from "@/platform/api";
import { useApp, useHydrated } from "@/shared/lib/store";
import { useDocumentTitle } from "@/shared/seo/use-document-title";

export function PromotionEditorPage() {
  const { id } = useParams(), userId = useApp((state) => state.userId), hydrated = useHydrated();
  useDocumentTitle(id ? "작품 소개 수정 · ToonStudio" : "내 작품 소개하기 · ToonStudio");
  if (!hydrated || !userId) return <div className="pc-shell pc-narrow"><Link to="/community/promote">← 홍보 커뮤니티</Link><div className="pc-empty"><h1>{hydrated ? "로그인 후 작품을 소개해 주세요" : "로그인 상태 확인 중"}</h1><p>상단 로그인 버튼을 이용해 주세요. 작품 감상은 로그인 없이 이용할 수 있어요.</p></div></div>;
  return <PromotionEditor key={`${userId}:${id ?? "new"}`} id={id} userId={userId} />;
}
function PromotionEditor({ id, userId }: { id?: string; userId: string }) {
  const [recovery] = useState(() => id ? null : readPromotionDraft(userId));
  const [draft, setDraft] = useState<Draft>(() => recovery?.status === "restored" ? recovery.value.draft : initialPromotionDraft());
  const [tags, setTags] = useState(() => recovery?.status === "restored" ? recovery.value.tags : "");
  const [draftStatus, setDraftStatus] = useState("이 탭에 초안을 자동 임시 저장합니다. 탭을 닫으면 없어질 수 있어요.");
  const published = useRef(false);
  const [version, setVersion] = useState<number | null>(null), [loading, setLoading] = useState(!!id);
  const [error, setError] = useState(""), [sending, setSending] = useState(false), [coverBusy, setCoverBusy] = useState(false);
  const busy = useRef(false), live = useRef(true), imageGeneration = useRef(0);
  const navigate = useNavigate();
  useEffect(() => {
    if (id) return;
    const save = () => {
      if (published.current || useApp.getState().userId !== userId) return;
      const result = savePromotionDraft(userId, { draft, tags });
      setDraftStatus(result === "unavailable" ? "이 브라우저에서는 임시 저장하지 못했어요. 화면을 닫기 전에 입력 내용을 복사해 주세요." : result === "saved" ? "이 탭에 초안 저장됨 · 아직 공개되지 않았어요. 탭을 닫으면 없어질 수 있어요." : "이 탭에 초안을 자동 임시 저장합니다. 탭을 닫으면 없어질 수 있어요.");
    };
    const timer = window.setTimeout(save, 300);
    window.addEventListener("pagehide", save);
    return () => { window.clearTimeout(timer); window.removeEventListener("pagehide", save); };
  }, [draft, tags, id, userId]);
  useEffect(() => { live.current = true; return () => { live.current = false; imageGeneration.current += 1; }; }, []);
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    promotionClient.detail(id, controller.signal).then((data) => {
      if (controller.signal.aborted) return;
      if (!data.canManage) throw new Error("작성자만 수정할 수 있어요.");
      const parsed = validatePromotion(data.post);
      if (!parsed.value) throw new Error("기존 글을 확인하지 못했어요. 빈 양식으로 덮어쓰지 않습니다.");
      setDraft({ ...parsed.value, rightsConfirmed: false }); setTags(parsed.value.tags.join(", ")); setVersion(data.post.version);
    }).catch(async (cause: unknown) => { const message = await getApiErrorMessage(cause, "게시물을 불러오지 못했어요."); if (!controller.signal.aborted) setError(message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id]);
  const field = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((previous) => ({ ...previous, [key]: value }));
  const upload = async (file: File | undefined) => {
    if (!file) return;
    const generation = ++imageGeneration.current; setCoverBusy(true); setError("");
    try { const cover = await preparePromotionCover(file); if (live.current && generation === imageGeneration.current) field("cover", cover); }
    catch (cause) { if (live.current && generation === imageGeneration.current) setError(cause instanceof Error ? cause.message : "표지를 변환하지 못했어요."); }
    finally { if (live.current && generation === imageGeneration.current) setCoverBusy(false); }
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy.current || coverBusy || useApp.getState().userId !== userId) return;
    const parsed = validatePromotion({ ...draft, tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean) });
    if (!parsed.value) { setError(parsed.error); return; }
    if (id && version === null) { setError("기존 게시물을 먼저 불러와 주세요."); return; }
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
    } catch (cause) { const message = await getApiErrorMessage(cause, "등록하지 못했어요. 입력 내용은 유지됩니다."); if (live.current) setError(message); }
    finally { busy.current = false; if (live.current) setSending(false); }
  };
  return <div className="pc-shell pc-narrow"><Link to={id ? `/community/promote/${encodeURIComponent(id)}` : "/community/promote"}>← {id ? "게시물로 돌아가기" : "홍보 커뮤니티"}</Link><header className="pc-editor-heading"><p className="pc-eyebrow">YOUR STORY STARTS HERE</p><h1>{id ? "작품 소개 수정" : "내 작품 소개하기"}</h1><p>첫 독자에게 작품의 매력과 만나러 갈 곳을 알려주세요.</p></header>
    {!id && <aside className="pc-notice" aria-label="홍보 초안 저장 안내">{recovery?.status === "restored" && <p>이 탭에 임시 저장한 초안을 불러왔어요. 게시 권한은 공개 전에 다시 확인해 주세요.</p>}<p role="status">{draftStatus}</p></aside>}
    {error && <p className="pc-error" role="alert">{error}</p>}{loading && <p role="status">기존 내용을 불러오고 있어요.</p>}
    {!loading && (!id || version !== null) && <form className="pc-form" onSubmit={(event) => void submit(event)}><fieldset disabled={sending}><legend className="sr-only">작품 소개 작성</legend>
      <div className="pc-form-row"><label>소개 유형<select value={draft.kind} onChange={(event) => field("kind", event.target.value as Draft["kind"])}>{Object.entries(PROMOTION_KINDS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>활동 단계<select value={draft.stage} onChange={(event) => field("stage", event.target.value as Draft["stage"])}>{Object.entries(PROMOTION_STAGES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>장르<select value={draft.genre} onChange={(event) => field("genre", event.target.value as Draft["genre"])}>{PROMOTION_GENRES.map((genre) => <option key={genre}>{genre}</option>)}</select></label></div>
      <label>작품명<input required minLength={2} maxLength={100} value={draft.seriesTitle} onChange={(event) => field("seriesTitle", event.target.value)} placeholder="내가 만들고 있는 웹툰의 이름" /></label>
      <label>소개 제목<input required minLength={3} maxLength={100} value={draft.title} onChange={(event) => field("title", event.target.value)} placeholder="독자에게 전하고 싶은 한 문장" /></label>
      <label>작품·작업 소개<textarea required minLength={20} maxLength={4000} rows={9} value={draft.description} onChange={(event) => field("description", event.target.value)} placeholder="줄거리, 작품의 매력, 연재 일정, 함께 이야기하고 싶은 부분을 적어 주세요. 피드백 요청은 궁금한 점을 구체적으로 적어 주세요." /></label><p className="pc-caption">{draft.description.length.toLocaleString()} / 4,000자 · 연락처·비공개 원고·스포일러 공개에 주의해 주세요.</p>
      <label>작품 보러 가기 주소<input type="url" maxLength={1000} value={draft.readingUrl} onChange={(event) => field("readingUrl", event.target.value)} placeholder="https://… (네이버 도전만화, WEBTOON, Tapas, 공개 작품 등)" /></label>
      <label>홍보 영상 주소<input type="url" required={draft.kind === "trailer"} maxLength={1000} value={draft.videoUrl} onChange={(event) => field("videoUrl", event.target.value)} placeholder="YouTube·Shorts 또는 공개 Vimeo 영상 링크" /></label><p className="pc-notice">영상 파일을 직접 저장하지 않고 링크로 연결합니다. YouTube·Vimeo에서 게시 및 임베드 권한을 확인해 주세요. 파일 업로드·영상 변환은 이 화면에서 제공하지 않습니다.</p><PromotionVideo url={draft.videoUrl} title={draft.seriesTitle || "미리보기"} />
      <label className="pc-upload"><ImagePlus size={20} aria-hidden="true" />표지 이미지 선택<input type="file" accept="image/jpeg,image/png,image/webp" disabled={coverBusy} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void upload(file); }} /></label><p className="pc-caption">JPEG·PNG·WebP 8MB 이하. 기기 안에서 최대 640×800px, 128KB 이하 JPEG로 변환합니다.</p>{coverBusy && <p role="status">표지를 변환하고 있어요.</p>}{draft.cover && <div className="pc-cover-preview"><img src={draft.cover} alt="선택한 작품 표지 미리보기" /><button className="pc-button" type="button" onClick={() => field("cover", "")}>표지 제거</button></div>}
      <label>태그<input maxLength={200} value={tags} onChange={(event) => setTags(event.target.value)} placeholder="성장물, 학원물, 첫연재 (쉼표로 구분, 최대 8개)" /></label><label>콘텐츠 안내<input maxLength={150} value={draft.contentWarning} onChange={(event) => field("contentWarning", event.target.value)} placeholder="예: 일부 전투 장면, 초반 줄거리 스포일러" /></label>
      <div className="pc-notice"><strong>공개 전에 확인해 주세요</strong><p>본인이 창작했거나 게시 허락을 받은 작품만 소개해 주세요. 무단 복제·성인물·개인정보 노출·도배는 허용하지 않습니다. 최근 24시간 5개, 계정당 총 100개까지 등록할 수 있습니다.</p></div>
      <label className="pc-check"><input type="checkbox" checked={draft.rightsConfirmed} onChange={(event) => field("rightsConfirmed", event.target.checked)} required /><span>작품·표지·영상·사용 음원의 게시 권한이 있으며, 공개 가능한 콘텐츠임을 확인했습니다.</span></label>
      <button className="pc-button pc-primary" type="submit" disabled={sending || coverBusy}><Save size={17} aria-hidden="true" />{sending ? "저장 중…" : id ? "변경 사항 저장" : "작품 소개 공개하기"}</button>
    </fieldset></form>}
  </div>;
}
