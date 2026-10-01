import { Box, FileJson, FolderOpen, Glasses, ImagePlus, ShieldCheck, Sparkles, type LucideIcon } from "lucide-react";
import { useState, type DragEvent } from "react";
import { Link } from "react-router-dom";

import { ShowcaseStepStrip, type ShowcaseStep } from "../publishing/ShowcaseStates";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

/**
 * 파일 고르기 카드 — 눌러서 고르거나 끌어다 놓는다. 입력은 시각적으로 숨기되 키보드로 초점이 가고,
 * 카드 전체에 초점 링을 보여 준다.
 */
function FilePickCard({
  icon: Icon,
  title,
  description,
  actionLabel,
  accept,
  multiple = false,
  disabled,
  acceptsFile,
  onFiles,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel: string;
  accept: string;
  multiple?: boolean;
  disabled: boolean;
  acceptsFile: (file: File) => boolean;
  onFiles: (files: File[]) => void;
}) {
  const bt = useBilingual("StudioSpatialReader");
  const [dragging, setDragging] = useState(false);

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (disabled) return;
    event.preventDefault();
    setDragging(true);
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    const files = Array.from(event.dataTransfer.files).filter(acceptsFile);
    if (files.length) onFiles(multiple ? files : files.slice(0, 1));
  };

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        "rounded-2xl border border-dashed p-5 transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent",
        dragging ? "border-accent bg-accent-soft" : "border-line-strong bg-panel/50",
        disabled && "opacity-60",
      )}
    >
      <label className={cn("flex h-full flex-col items-start gap-3", disabled ? "cursor-not-allowed" : "cursor-pointer")}>
        <span aria-hidden className="grid size-11 place-items-center rounded-xl bg-accent-soft text-accent">
          <Icon size={20} />
        </span>
        <span>
          <span className="block text-sm font-semibold text-fg">{title}</span>
          <span className="mt-1 block text-xs leading-relaxed text-fg-2">{description}</span>
        </span>
        <span className="mt-auto flex flex-wrap items-center gap-2">
          <span className={buttonClass({ size: "sm", variant: "outline", className: "pointer-events-none gap-1.5" })}>
            <FolderOpen size={14} aria-hidden />
            {actionLabel}
          </span>
          <span className="text-[0.72rem] text-fg-3">{bt("또는 여기로 끌어다 놓기", "or drop here")}</span>
        </span>
        <input
          type="file"
          className="sr-only"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            event.target.value = "";
            if (files.length) onFiles(files);
          }}
        />
      </label>
    </div>
  );
}

export function SpatialReaderIntro({
  busy,
  onOpenImages,
  onOpenBook,
  onOpenSample,
}: {
  busy: boolean;
  onOpenImages: (files: File[]) => void;
  onOpenBook: (file: File) => void;
  onOpenSample: () => void;
}) {
  const bt = useBilingual("StudioSpatialReader");
  const steps: readonly ShowcaseStep[] = [
    {
      icon: ImagePlus,
      title: bt("작품 열기", "Open a work"),
      description: bt("컷 이미지나 저장한 공간 웹툰 파일을 고르거나, 샘플로 바로 시작합니다.", "Pick panel images or a saved spatial webtoon file, or start with the sample."),
    },
    {
      icon: Box,
      title: bt("일반·공간 보기로 감상", "Read in flat or spatial view"),
      description: bt("일반 보기로 읽다가 ‘공간 보기’를 켜면 컷이 3D 공간에 나란히 놓입니다.", "Read flat, then turn on spatial view to line panels up in 3D."),
    },
    {
      icon: Glasses,
      title: bt("VR·AR로 넓히기(지원 기기)", "Go VR/AR (supported devices)"),
      description: bt("지원 기기에서는 VR로 들어가거나 AR로 방 안에 작품을 놓습니다. 미지원 기기도 모든 컷을 읽을 수 있어요.", "On supported devices, enter VR or place the work in your room with AR. Every panel stays readable elsewhere."),
    },
  ];

  return (
    <section aria-labelledby="spatial-reader-title" className="flex flex-col gap-6">
      <header className="relative overflow-hidden rounded-3xl border border-line bg-panel/70 p-6 sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-24 size-80 rounded-full opacity-60 blur-3xl"
          style={{ background: "radial-gradient(closest-side, color-mix(in oklch, var(--color-accent) 28%, transparent), transparent 72%)" }}
        />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-3xl">
            <p className="eyebrow text-accent">TOONSTUDIO / SPATIAL READER</p>
            <h1 id="spatial-reader-title" className="mt-2 text-3xl font-bold tracking-tight text-fg sm:text-4xl">
              {bt("웹툰의 공간 안으로", "Step inside the webtoon")}
            </h1>
            <p className="mt-3 text-pretty text-sm leading-relaxed text-fg-2 sm:text-base">
              {bt(
                "컷·대사·깊이 레이어를 그대로 보존하는 감상 모드입니다. 일반 화면, VR, AR에서 같은 작품을 읽어요.",
                "A reading mode that preserves panels, dialogue and depth layers. Read the same work on a flat screen, in VR or in AR.",
              )}
            </p>
          </div>
          <nav aria-label={bt("관련 화면", "Related pages")} className="flex flex-wrap gap-2">
            <Link to="/studio/generate" className={buttonClass({ size: "sm", variant: "outline" })}>
              {bt("생성형 스튜디오", "Generative studio")}
            </Link>
            <Link to="/studio" className={buttonClass({ size: "sm", variant: "outline" })}>
              {bt("스튜디오 홈", "Studio home")}
            </Link>
          </nav>
        </div>
      </header>

      <ShowcaseStepStrip label={bt("공간 리더 사용 순서", "How the spatial reader works")} steps={steps} />

      <div className="grid gap-3 lg:grid-cols-[1fr_1fr_0.9fr]">
        <FilePickCard
          icon={ImagePlus}
          title={bt("컷 이미지 여러 장", "Several panel images")}
          description={bt("PNG·JPEG·WebP, 컷당 8MB 이하, 1~32컷. 파일 이름 순서대로 엽니다.", "PNG, JPEG or WebP up to 8MB each, 1–32 panels, opened in file-name order.")}
          actionLabel={bt("이미지 고르기", "Choose images")}
          accept="image/png,image/jpeg,image/webp"
          multiple
          disabled={busy}
          acceptsFile={(file) => /^image\/(?:png|jpeg|webp)$/u.test(file.type)}
          onFiles={onOpenImages}
        />
        <FilePickCard
          icon={FileJson}
          title={bt("공간 웹툰 파일(JSON)", "Spatial webtoon file (JSON)")}
          description={bt("이 화면에서 내보낸 작품 파일을 열면 자막·깊이 레이어와 감상 위치까지 이어집니다.", "Open a file exported here to restore captions, depth layers and your reading position.")}
          actionLabel={bt("작품 파일 고르기", "Choose a work file")}
          accept=".json,application/json"
          disabled={busy}
          acceptsFile={(file) => file.name.toLowerCase().endsWith(".json") || file.type === "application/json"}
          onFiles={(files) => {
            const [first] = files;
            if (first) onOpenBook(first);
          }}
        />
        <div className="flex flex-col justify-between gap-3 rounded-2xl border border-line bg-card/70 p-5">
          <div>
            <span aria-hidden className="grid size-11 place-items-center rounded-xl bg-accent-soft text-accent">
              <Sparkles size={20} />
            </span>
            <p className="mt-3 text-sm font-semibold text-fg">{bt("파일이 없어도 괜찮아요", "No files? No problem")}</p>
            <p className="mt-1 text-xs leading-relaxed text-fg-2">
              {bt("내장된 예시 컷 3장으로 일반·공간 보기를 바로 체험합니다. 예시 작품은 실제 게시물이 아닙니다.", "Try flat and spatial views with three built-in sample panels. The sample is not a real publication.")}
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenSample}
            disabled={busy}
            className={buttonClass({ size: "md", variant: "solid", className: "gap-1.5" })}
          >
            <Sparkles size={15} aria-hidden />
            {bt("샘플 작품으로 체험하기", "Try the sample work")}
          </button>
        </div>
      </div>

      <p className="flex items-start gap-2 rounded-2xl border border-line bg-card/60 px-4 py-3 text-xs leading-relaxed text-fg-2">
        <ShieldCheck size={15} aria-hidden className="mt-0.5 shrink-0 text-good" />
        <span>
          <strong className="font-semibold text-fg">{bt("권한 요청은 AR/VR 실행 버튼을 누를 때만 합니다.", "Permissions are requested only when you press an AR/VR button.")}</strong>{" "}
          {bt(
            "이미지·작품 파일은 이 브라우저에서만 읽고 서버에 올리지 않습니다. 감상 위치만 이 기기에 저장됩니다.",
            "Images and work files are read in this browser only and never uploaded. Only your reading position is saved on this device.",
          )}
        </span>
      </p>
    </section>
  );
}
