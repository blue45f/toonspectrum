import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  ImagePlus,
  Loader2,
  PenLine,
  Send,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { buildStudioHref } from "./creator-studio-links";
import { downscaleDataUrl, downscaleImageFile } from "./studio-image-utils";
import { StudioPublishContextBanner, type PublishContext } from "./StudioPublishContextBanner";

import { Container } from "@/components/section";
import { buttonClass } from "@/components/ui/button-utils";
import { cn } from "@/lib/utils";
import { useSession } from "@/src/compat/auth-session-store";
import Link from "@/src/compat/router-link";
import { useDocumentTitle } from "@/src/hooks/use-document-title";
import {
  createWork,
  getChallenge,
  getSeries,
} from "@/src/infrastructure/creator-client";

const MAX_PAGES = 40;

type UploadPage = {
  id: string;
  src: string;
  width: number;
  height: number;
  name: string;
};

function uid() {
  return `up-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function StudioUploadPublish() {
  useDocumentTitle("이미지 업로드 게시");
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { data: session } = useSession();
  const loggedIn = Boolean(session?.user?.id);

  const seriesId = params.get("seriesId");
  const challengeId = params.get("challengeId");
  const titleId = params.get("titleId");

  const [pages, setPages] = useState<UploadPage[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [publishContext, setPublishContext] = useState<PublishContext>({});

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    async function loadContext() {
      const next: PublishContext = {};
      if (seriesId) {
        try {
          const series = await getSeries(seriesId, controller.signal);
          if (!alive) return;
          const maxEpisode = series.episodeList.reduce(
            (max, episode) => Math.max(max, episode.episodeNo ?? 0),
            0
          );
          next.series = {
            id: series.id,
            title: series.title,
            nextEpisodeNo: maxEpisode + 1,
          };
        } catch {
          // 시리즈 로드 실패 시 맥락 배너만 생략.
        }
      }
      if (challengeId) {
        try {
          const challenge = await getChallenge(challengeId, controller.signal);
          if (!alive) return;
          next.challenge = {
            id: challenge.id,
            title: challenge.title,
            theme: challenge.theme,
          };
        } catch {
          // 챌린지 로드 실패 시 맥락 배너만 생략.
        }
      }
      if (alive) setPublishContext(next);
    }
    void loadContext();
    return () => {
      alive = false;
      controller.abort();
    };
  }, [seriesId, challengeId]);

  async function onPickImages(event: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    if (files.length === 0) return;
    if (pages.length + files.length > MAX_PAGES) {
      setError(`이미지는 최대 ${MAX_PAGES}장까지 올릴 수 있어요.`);
      return;
    }
    setLoadingFiles(true);
    setError(null);
    try {
      const next: UploadPage[] = [];
      for (const file of files) {
        const scaled = await downscaleImageFile(file, 1600, 0.88);
        next.push({
          id: uid(),
          src: scaled.src,
          width: scaled.width,
          height: scaled.height,
          name: file.name,
        });
      }
      setPages((current) => [...current, ...next]);
      if (!title.trim() && next[0]) {
        const base = next[0].name.replace(/\.[^.]+$/, "").trim();
        if (base) setTitle(base.slice(0, 80));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "이미지를 불러오지 못했습니다.");
    } finally {
      setLoadingFiles(false);
    }
  }

  function movePage(id: string, direction: -1 | 1) {
    setPages((current) => {
      const index = current.findIndex((page) => page.id === id);
      if (index < 0) return current;
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const copy = [...current];
      const [item] = copy.splice(index, 1);
      copy.splice(target, 0, item);
      return copy;
    });
  }

  function removePage(id: string) {
    setPages((current) => current.filter((page) => page.id !== id));
  }

  async function handlePublish(status: "published" | "draft") {
    if (!loggedIn) {
      setError("로그인 후 게시할 수 있어요.");
      return;
    }
    if (!title.trim()) {
      setError("제목을 입력해주세요.");
      return;
    }
    if (pages.length === 0) {
      setError("이미지를 1장 이상 추가해주세요.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const pageImages = pages.map((page) => page.src);
      const cover = await downscaleDataUrl(pageImages[0], 480);
      const tags = tagsText
        .split(/[,\s]+/)
        .map((tag) => tag.trim().replace(/^#/, ""))
        .filter(Boolean)
        .slice(0, 8);
      const work = await createWork({
        title: title.trim(),
        description: description.trim(),
        tags,
        format: "upload",
        titleId: titleId ?? undefined,
        cover,
        pages: pageImages,
        doc: {
          format: "upload",
          pageMeta: pages.map((page) => ({
            width: page.width,
            height: page.height,
            name: page.name,
          })),
        },
        status,
        seriesId: seriesId ?? undefined,
        challengeId: challengeId ?? undefined,
      });
      navigate(`/create/${work.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "게시에 실패했어요.");
      setSaving(false);
    }
  }

  return (
    <Container size="wide" className="py-6 sm:py-8">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Link
          href="/create"
          className="inline-flex items-center gap-1.5 text-sm text-fg-3 transition-colors hover:text-fg"
        >
          <ArrowLeft size={15} />
          창작 게시판
        </Link>
        <Link
          href={buildStudioHref({ seriesId, challengeId, titleId })}
          className={buttonClass({ size: "sm", variant: "outline", className: "ml-auto gap-1.5" })}
        >
          <PenLine size={14} />
          컷툰 스튜디오로 전환
        </Link>
      </div>

      <header className="mb-5 rounded-2xl border border-line bg-panel/45 p-5 surface-hl sm:p-6">
        <p className="eyebrow text-accent">UPLOAD PUBLISH</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">이미지 업로드 게시</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-fg-2">
          완성된 이미지를 그대로 올려 공유하세요. 여러 장을 순서대로 배치하면 세로 스크롤 웹툰처럼 읽을 수
          있습니다.
        </p>
      </header>

      <StudioPublishContextBanner context={publishContext} />

      {!loggedIn && (
        <div className="mb-4 rounded-xl border border-line bg-card/60 px-3 py-2 text-sm text-fg-2">
          게시하려면 로그인이 필요해요. (이미지 추가·미리보기는 로그인 없이도 가능)
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-2xl border border-line bg-panel/35 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-fg">이미지 ({pages.length})</h2>
            <label
              className={cn(
                buttonClass({ size: "sm", variant: "solid", className: "gap-1.5 cursor-pointer" }),
                loadingFiles && "pointer-events-none opacity-70"
              )}
            >
              {loadingFiles ? <Loader2 size={14} className="animate-spin" /> : <ImagePlus size={14} />}
              이미지 추가
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={onPickImages}
                disabled={loadingFiles}
              />
            </label>
          </div>

          {pages.length === 0 ? (
            <label className="mt-4 flex min-h-56 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-card/40 px-6 py-10 text-center transition-colors hover:border-accent/45 hover:bg-card/60">
              <Upload size={28} className="mb-3 text-fg-3" />
              <p className="text-sm font-medium text-fg">이미지를 끌어다 놓거나 탭해서 선택</p>
              <p className="mt-1 text-xs text-fg-3">PNG, JPG, WebP · 최대 {MAX_PAGES}장</p>
              <input type="file" accept="image/*" multiple className="hidden" onChange={onPickImages} />
            </label>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              {pages.map((page, index) => (
                <div
                  key={page.id}
                  className="group flex items-center gap-3 rounded-xl border border-line bg-card/50 p-2.5"
                >
                  <span className="numeral w-6 shrink-0 text-center text-xs font-bold text-fg-3">{index + 1}</span>
                  <div className="relative aspect-[3/4] w-16 shrink-0 overflow-hidden rounded-lg bg-raised/50 sm:w-20">
                    <img src={page.src} alt="" className="h-full w-full object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-fg">{page.name}</p>
                    <p className="text-[0.72rem] text-fg-3">
                      <span className="numeral">{page.width}</span>×<span className="numeral">{page.height}</span>
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => movePage(page.id, -1)}
                      disabled={index === 0}
                      className="grid size-8 place-items-center rounded-lg border border-line text-fg-3 transition-colors hover:bg-raised disabled:opacity-40"
                      aria-label="위로 이동"
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => movePage(page.id, 1)}
                      disabled={index === pages.length - 1}
                      className="grid size-8 place-items-center rounded-lg border border-line text-fg-3 transition-colors hover:bg-raised disabled:opacity-40"
                      aria-label="아래로 이동"
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => removePage(page.id)}
                      className="grid size-8 place-items-center rounded-lg border border-line text-bad transition-colors hover:bg-bad/10"
                      aria-label="삭제"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <aside className="flex flex-col gap-4">
          <div className="rounded-2xl border border-line bg-panel/35 p-4">
            <h2 className="text-sm font-bold text-fg">작품 정보</h2>
            <label className="mt-3 flex flex-col gap-1 text-xs text-fg-2">
              제목
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="작품 제목"
                className="h-10 rounded-lg border border-line bg-canvas px-3 text-sm text-fg outline-none focus:border-accent/50"
              />
            </label>
            <label className="mt-3 flex flex-col gap-1 text-xs text-fg-2">
              설명
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={4}
                placeholder="작품 소개 (선택)"
                className="rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-fg outline-none focus:border-accent/50"
              />
            </label>
            <label className="mt-3 flex flex-col gap-1 text-xs text-fg-2">
              태그
              <input
                value={tagsText}
                onChange={(event) => setTagsText(event.target.value)}
                placeholder="로맨스, 일상 (쉼표로 구분)"
                className="h-10 rounded-lg border border-line bg-canvas px-3 text-sm text-fg outline-none focus:border-accent/50"
              />
            </label>
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => handlePublish("draft")}
              disabled={saving}
              className={buttonClass({ size: "md", variant: "outline", className: "w-full" })}
            >
              임시저장
            </button>
            <button
              type="button"
              onClick={() => handlePublish("published")}
              disabled={saving}
              className={buttonClass({ size: "md", variant: "solid", className: "w-full gap-1.5" })}
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              게시하기
            </button>
          </div>
        </aside>
      </div>
    </Container>
  );
}