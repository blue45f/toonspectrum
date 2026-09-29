/**
 * Character Shaper — reference drawer: 참고 이미지 AI 추천 · 사진 포즈 · 웹캠.
 *
 * Everything here runs on the device. The AI recommendation panel is the existing MediaPipe
 * image-embedder surface (it only ranks presets — it never edits the avatar by itself), the photo
 * tab is the existing landmark scanner, and the webcam tab drives the host's own tracking session
 * behind an explicit consent step. The palette block decodes the dropped image locally (≤ 96 px)
 * and proposes hair / iris / top colors that the creator applies one at a time.
 *
 * While this drawer shows the recommendation tab it puts the host on its Avatar Forge surface —
 * the runtime gates the catalogue load and the preview/apply calls on that surface being active —
 * and restores the previous tab when the drawer closes.
 */
import { ImagePlus, Info, LoaderCircle, PersonStanding, Pipette, Snowflake, TriangleAlert, Video, VideoOff, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { STUDIO_FOCUS_RING } from "../studio-panel-ui";
import {
  hasStudioVrmWebcamSessionConsent,
  rememberStudioVrmWebcamSessionConsent,
} from "../vrm/studio-vrm-poser-preferences-sqlite";
import { StudioVrmAvatarReferenceRecommendationsPanel } from "../vrm/StudioVrmAvatarReferenceRecommendationsPanel";
import { StudioVrmPhotoPoseScanner } from "../vrm/StudioVrmPhotoPoseScanner";
import { studioVrmAvatarReferenceCatalogueDiagnosticMessage } from "../vrm/useStudioVrmAvatarReferenceCatalogue";

import { extractCharacterReferencePalette } from "./character-shaper-palette-extract";
import {
  REFERENCE_RECOMMEND_CONFIDENCE_LABELS,
  REFERENCE_RECOMMEND_DIMENSION_LABELS,
  recommendReferencePresetCombination,
} from "./character-shaper-reference-recommend";
import { shouldSyncGradePoseAfterPhotoApply } from "./character-shaper-grade-photo-sync";

import type { CharacterReferencePalette } from "./character-shaper-palette-extract";
import type {
  ReferenceDimensionRecommendation,
  ReferencePresetCombination,
} from "./character-shaper-reference-recommend";
import type { CharacterSlotEntry } from "./character-shaper-contract";
import type { CharacterShaperReferenceDrawerProps } from "./character-shaper-ui-contract";
import type { TrackingOptions } from "../vrm/studio-vrm-webcam-tracking";
import type { StudioVrmPhotoPoseApplyPayload, StudioVrmPhotoPoseHandoff } from "../vrm/StudioVrmPhotoPoseScanner";
import type { DragEvent as ReactDragEvent, KeyboardEvent as ReactKeyboardEvent } from "react";

import { SwitchIndicator } from "@/shared/components/ui/switch";
import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

type DrawerMode = CharacterShaperReferenceDrawerProps["mode"];

const TABS: readonly { readonly id: DrawerMode; readonly label: string; readonly hint: string }[] = [
  { id: "reference", label: "참고 이미지 AI 추천", hint: "이미지와 닮은 프리셋을 찾고 색을 뽑습니다" },
  { id: "photo", label: "사진 포즈", hint: "사진 속 자세를 읽어 모델에 적용합니다" },
  { id: "webcam", label: "웹캠", hint: "카메라로 표정과 머리 각도를 따라 합니다" },
];

const ON_DEVICE_NOTE = "MediaPipe 이미지 임베더 · 기기 내 처리 · 업로드 없음";

const PALETTE_MAX_EDGE = 96;
const MAX_IMAGE_BYTES = 24 * 1024 * 1024;
const APPLIED_NOTICE_MS = 5000;

const BUTTON = cn(
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-line bg-card px-3 text-[0.72rem] font-semibold text-fg-2",
  "transition-colors hover:bg-raised hover:text-fg disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none",
  STUDIO_FOCUS_RING,
);

const PRIMARY_BUTTON = cn(
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-accent/60 bg-accent px-3 text-[0.72rem] font-semibold text-on-accent",
  "transition-colors hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none",
  STUDIO_FOCUS_RING,
);

interface PaletteState {
  readonly status: "idle" | "reading" | "ready" | "error";
  readonly palette: CharacterReferencePalette | null;
  readonly fileName: string | null;
  readonly message: string | null;
}

const IDLE_PALETTE: PaletteState = { status: "idle", palette: null, fileName: null, message: null };

/** 2D 설정화 → 프리셋 조합 추천 상태. 분석은 기기 안에서만 돈다. */
interface RecommendState {
  readonly status: "idle" | "analyzing" | "ready";
  readonly result: ReferencePresetCombination | null;
}

const IDLE_RECOMMEND: RecommendState = { status: "idle", result: null };

/** Decodes to a bounded ImageData on the main thread; the bitmap is released either way. */
async function decodeReferenceImageData(file: File): Promise<ImageData | null> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return null;
  const bitmap = await createImageBitmap(file);
  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = longest > PALETTE_MAX_EDGE ? PALETTE_MAX_EDGE / longest : 1;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, width, height);
    return context.getImageData(0, 0, width, height);
  } finally {
    bitmap.close?.();
  }
}

function ToggleRow({
  label,
  checked,
  disabled,
  onToggle,
}: {
  readonly label: string;
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly onToggle: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onToggle(!checked)}
      className={cn(
        "flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border px-3 text-left text-[0.72rem] font-semibold",
        "transition-colors disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none",
        STUDIO_FOCUS_RING,
        checked ? "border-accent/55 bg-accent-soft text-accent" : "border-line bg-card text-fg-2 hover:bg-raised",
      )}
    >
      <span className="min-w-0 truncate">{label}</span>
      <SwitchIndicator checked={checked} />
    </button>
  );
}

export function CharacterShaperReferenceDrawer({
  h,
  binding,
  mode,
  onModeChange,
  onClose,
}: CharacterShaperReferenceDrawerProps) {
  const t = useT();
  const tabsId = useId();
  const hostRef = useRef(h);
  const tabRefs = useRef(new Map<DrawerMode, HTMLButtonElement | null>());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef(0);
  const handoffTokenRef = useRef(0);
  const [palette, setPalette] = useState<PaletteState>(IDLE_PALETTE);
  // 참고 탭에서 이미 받은 이미지. 같은 사진으로 포즈까지 읽고 싶은 사람이 파일을 두 번 고르지
  // 않도록 들고 있다가 사진 탭으로 넘긴다. 토큰이 스캐너의 재실행 트리거다.
  const [pickedImage, setPickedImage] = useState<File | null>(null);
  const [photoHandoff, setPhotoHandoff] = useState<StudioVrmPhotoPoseHandoff | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [applied, setApplied] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [recommend, setRecommend] = useState<RecommendState>(IDLE_RECOMMEND);
  const [gradeImage, setGradeImage] = useState<{ width: number; height: number; rgba: Uint8ClampedArray } | null>(null);

  useEffect(() => {
    hostRef.current = h;
  });

  useEffect(() => () => {
    requestRef.current += 1;
  }, []);

  useEffect(() => {
    if (applied === null) return;
    const timer = window.setTimeout(() => setApplied(null), APPLIED_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [applied]);

  // Initial focus lands on the active tab; the shell focuses the drawer shell first, so this is
  // deferred by a task to run after the shell's own effect.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      tabRefs.current.get(mode)?.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [mode]);

  // The runtime only loads the recommendation catalogue (and accepts preview/apply) while the
  // Avatar Forge surface is active, so claim it for as long as this tab is open.
  useEffect(() => {
    if (mode !== "reference") return;
    const host = hostRef.current;
    const previousTab: string = typeof host.activePanelTab === "string" ? host.activePanelTab : "character";
    const previousSection: string =
      typeof host.activeCharacterSection === "string" ? host.activeCharacterSection : "library";
    host.handlePanelTabChange?.("character");
    host.handleCharacterSectionChange?.("forge");
    return () => {
      const restore = hostRef.current;
      restore.handlePanelTabChange?.(previousTab);
      restore.handleCharacterSectionChange?.(previousSection);
    };
  }, [mode]);

  const readFile = (file: File) => {
    // 거절되는 파일도 이전 비동기 읽기를 무효화해야 이전 이미지가 다시 적용되지 않는다.
    const request = requestRef.current + 1;
    requestRef.current = request;
    setGradeImage(null);
    setPhotoHandoff(null);
    setSelectedColor(null);
    setApplied(null);
    if (!file.type.startsWith("image/")) {
      setPickedImage(null);
      setPalette({ status: "error", palette: null, fileName: file.name, message: "이미지 파일만 읽을 수 있습니다." });
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setPickedImage(null);
      setPalette({ status: "error", palette: null, fileName: file.name, message: "24MB 이하 이미지를 올려 주세요." });
      return;
    }
    setPickedImage(file);
    setPalette({ status: "reading", palette: null, fileName: file.name, message: null });
    setRecommend(IDLE_RECOMMEND);
    void (async () => {
      try {
        const image = await decodeReferenceImageData(file);
        if (requestRef.current !== request) return;
        if (!image) {
          setGradeImage(null);
          setPalette({
            status: "error",
            palette: null,
            fileName: file.name,
            message: "이 브라우저에서는 이미지를 읽을 수 없습니다.",
          });
          return;
        }
        setGradeImage({ width: image.width, height: image.height, rgba: image.data });
        const extracted = extractCharacterReferencePalette(image);
        setPalette({ status: "ready", palette: extracted, fileName: file.name, message: null });
        setSelectedColor(extracted.hair ?? extracted.swatches[0] ?? null);
        // 2D 설정화 → 체형/헤어/의상 프리셋 조합 추천. 팔레트와 같은 96px 디코딩 결과를
        // 그대로 쓰며, 기기 안에서만 계산한다 (서버 전송·유료 AI 없음).
        setRecommend({ status: "analyzing", result: null });
        await Promise.resolve();
        if (requestRef.current !== request) return;
        const combination = recommendReferencePresetCombination(
          { width: image.width, height: image.height, data: image.data },
          { hairColor: extracted.hair },
        );
        setRecommend({ status: "ready", result: combination });
      } catch {
        if (requestRef.current !== request) return;
        setPalette({
          status: "error",
          palette: null,
          fileName: file.name,
          message: "이미지를 읽지 못했습니다. 다른 파일로 다시 시도해 주세요.",
        });
      }
    })();
  };

  const changeMode = (next: DrawerMode) => {
    if (mode === "webcam" && next !== "webcam") {
      h.setWebcamActive?.(false);
      h.setShowConsent?.(false);
    }
    onModeChange(next);
  };

  const onDrop = (event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) readFile(file);
  };

  const onTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const index = TABS.findIndex((tab) => tab.id === mode);
    if (index < 0) return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const delta = event.key === "ArrowRight" ? 1 : -1;
      const next = TABS[(index + delta + TABS.length) % TABS.length];
      if (next) changeMode(next.id);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      const first = TABS[0];
      if (first) changeMode(first.id);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      const last = TABS[TABS.length - 1];
      if (last) changeMode(last.id);
    }
  };

  /* ---------------------------------------------------------------------- */
  /* Reference tab                                                           */
  /* ---------------------------------------------------------------------- */

  const catalogue = h.avatarForgeReferenceCatalogue ?? null;
  const referenceBlocked =
    typeof h.avatarForgeReferenceInteractionBlocked === "function"
      ? Boolean(h.avatarForgeReferenceInteractionBlocked())
      : !h.vrm;
  const activeSwatch = selectedColor ?? palette.palette?.swatches[0] ?? null;
  /** CharacterShaperQuickPresets와 같은 잠금 조건 — 바쁠 때는 추천 적용도 막는다. */
  const comboLocked = binding.busyReason !== null || binding.compareActive;

  /**
   * 추천 카드의 원클릭 적용. StudioCharacterShaperDialog의 commitEntry와 같은 경로
   * (CharacterShaperQuickPresets가 쓰는 그 경로)를 그대로 쓴다.
   */
  const applyComboEntry = (entry: CharacterSlotEntry) => {
    const result = binding.previewEntryId === entry.id && binding.commitPreview
      ? binding.commitPreview(entry)
      : binding.commit(entry);
    setApplied(result.ok ? `${entry.label} 프리셋을 적용했습니다.` : (result.reason ?? "지금은 적용할 수 없습니다."));
  };

  const applyComboAll = (dimensions: readonly ReferenceDimensionRecommendation[]) => {
    let appliedCount = 0;
    for (const dimension of dimensions) {
      if (comboLocked || binding.evaluate(dimension.entry).status === "unavailable") continue;
      const entry = dimension.entry;
      const result = binding.previewEntryId === entry.id && binding.commitPreview
        ? binding.commitPreview(entry)
        : binding.commit(entry);
      if (result.ok) appliedCount += 1;
    }
    setApplied(`추천 조합 ${dimensions.length}개 중 ${appliedCount}개를 적용했습니다.`);
  };

  const retryRecommendation = () => {
    if (!gradeImage) return;
    setRecommend({ status: "analyzing", result: null });
    void Promise.resolve().then(() => {
      const combination = recommendReferencePresetCombination(
        { width: gradeImage.width, height: gradeImage.height, data: gradeImage.rgba },
        { hairColor: palette.palette?.hair ?? null },
      );
      setRecommend({ status: "ready", result: combination });
    });
  };

  const comboResult = recommend.status === "ready" ? recommend.result : null;

  const topEquipped = Boolean((h.wardrobeState as Record<string, unknown> | undefined)?.top);
  const applyTargets: readonly {
    readonly id: string;
    readonly label: string;
    readonly blockedReason: string | null;
    readonly apply: (color: string) => void;
  }[] = [
    {
      id: "hair",
      label: "헤어 색으로",
      blockedReason: null,
      apply: (color) => binding.commitColor("hairBase", color),
    },
    {
      id: "iris",
      label: "눈동자 색으로",
      blockedReason: binding.profile.irisTintable === false ? "이 모델에서는 홍채 메시를 찾지 못했습니다." : null,
      apply: (color) => binding.commitColor("iris", color),
    },
    {
      id: "top",
      label: "상의 색으로",
      blockedReason: topEquipped ? null : "상의를 먼저 입혀야 색을 바꿀 수 있습니다.",
      apply: (color) => h.updateWardrobeEquip?.("top", { color }),
    },
  ];

  const namedSwatches: readonly { readonly key: string; readonly label: string; readonly color: string | null }[] = [
    { key: "hair", label: "머리색 추정", color: palette.palette?.hair ?? null },
    { key: "skin", label: "피부색 추정", color: palette.palette?.skin ?? null },
    { key: "accent", label: "포인트 색", color: palette.palette?.accent ?? null },
  ];

  const referencePanel = (
    <div className="space-y-3">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        className={cn(
          "rounded-2xl border border-dashed p-3 text-center transition-colors motion-reduce:transition-none",
          dragActive ? "border-accent bg-accent-soft/40" : "border-line bg-card/50",
        )}
      >
        <p className="text-[0.74rem] font-bold text-fg">참고 이미지에서 색 뽑기</p>
        <p className="mt-1 text-[0.66rem] leading-relaxed text-fg-3">
          이미지를 끌어다 놓거나 파일을 골라 주세요. 96px로 줄여 기기 안에서만 색을 계산합니다.
        </p>
        <button
          type="button"
          className={cn(BUTTON, "mt-2")}
          aria-describedby={palette.status === "error" ? `${tabsId}-image-error` : undefined}
          onClick={() => fileInputRef.current?.click()}
        >
          <ImagePlus size={14} aria-hidden />
          {palette.status === "error" ? t("studio.character.reference.chooseAnotherImage", "다른 이미지 고르기") : "이미지 고르기"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          aria-label="참고 이미지 선택"
          className="sr-only"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) readFile(file);
            event.currentTarget.value = "";
          }}
        />
        {palette.fileName ? (
          <p className="mt-1.5 truncate text-[0.64rem] text-fg-3" title={palette.fileName}>
            {palette.fileName}
          </p>
        ) : null}
        {palette.status === "reading" ? (
          <p role="status" className="mt-1 inline-flex items-center gap-1 text-[0.66rem] font-semibold text-accent">
            <LoaderCircle size={12} aria-hidden className="animate-spin motion-reduce:animate-none" />
            색을 뽑는 중
          </p>
        ) : null}
        {palette.status === "error" && palette.message ? (
          <p id={`${tabsId}-image-error`} role="alert" className="mt-1 text-xs leading-relaxed font-semibold text-bad">
            {palette.message}
          </p>
        ) : null}
        {palette.status === "error" && pickedImage ? (
          <button type="button" className={cn(BUTTON, "mt-2 w-full")} onClick={() => readFile(pickedImage)}>
            {t("studio.character.reference.retryImage", "이 이미지 다시 읽기")}
          </button>
        ) : null}
        {pickedImage ? (
          <button
            type="button"
            className={cn(BUTTON, "mt-2 w-full")}
            onClick={() => {
              handoffTokenRef.current += 1;
              setPhotoHandoff({ file: pickedImage, token: handoffTokenRef.current });
              changeMode("photo");
            }}
          >
            <PersonStanding size={14} aria-hidden />
            이 사진에서 포즈도 읽기
          </button>
        ) : null}
      </div>

      {palette.status === "ready" && palette.palette ? (
        <section aria-label="뽑아낸 팔레트" className="rounded-2xl border border-line bg-card/60 p-3">
          <h3 className="text-[0.74rem] font-bold text-fg">뽑아낸 팔레트</h3>
          <div role="group" aria-label="팔레트 색 고르기" className="mt-2 flex flex-wrap gap-1">
            {palette.palette.swatches.map((color) => {
              const active = activeSwatch === color;
              return (
                <button
                  key={color}
                  type="button"
                  aria-pressed={active}
                  aria-label={`색 ${color.toUpperCase()} 고르기`}
                  title={color.toUpperCase()}
                  onClick={() => setSelectedColor(color)}
                  className={cn(
                    "grid size-11 place-items-center rounded-lg border",
                    STUDIO_FOCUS_RING,
                    active ? "border-accent shadow-[0_0_0_1px_var(--color-accent)]" : "border-line hover:border-line-strong",
                  )}
                >
                  <span aria-hidden className="size-7 rounded-md border border-line/60" style={{ backgroundColor: color }} />
                </button>
              );
            })}
          </div>
          <dl className="mt-2 space-y-1">
            {namedSwatches.map((row) => (
              <div key={row.key} className="flex items-center justify-between gap-2 text-[0.66rem]">
                <dt className="font-semibold text-fg-2">{row.label}</dt>
                <dd className="flex items-center gap-1.5 text-fg-3">
                  {row.color ? (
                    <>
                      <span
                        aria-hidden
                        className="size-3.5 rounded-full border border-line-strong/70"
                        style={{ backgroundColor: row.color }}
                      />
                      <span className="tabular-nums">{row.color.toUpperCase()}</span>
                    </>
                  ) : (
                    "찾지 못했습니다"
                  )}
                </dd>
              </div>
            ))}
          </dl>
          <div className="mt-2 grid grid-cols-3 gap-1">
            {applyTargets.map((target) => (
              <button
                key={target.id}
                type="button"
                disabled={activeSwatch === null || target.blockedReason !== null}
                title={
                  target.blockedReason
                  ?? (activeSwatch ? `${activeSwatch.toUpperCase()}을(를) ${target.label.replace("으로", "")} 적용` : undefined)
                }
                onClick={() => {
                  if (activeSwatch === null || target.blockedReason !== null) return;
                  target.apply(activeSwatch);
                  setApplied(`${target.label.replace(" 색으로", "")} 색을 ${activeSwatch.toUpperCase()}로 바꿨습니다.`);
                }}
                className={BUTTON}
              >
                <Pipette size={13} aria-hidden />
                {target.label}
              </button>
            ))}
          </div>
          <p role="status" aria-label="팔레트 적용 결과" className="mt-1 min-h-4 text-[0.64rem] leading-relaxed text-fg-3">
            {applied ?? ""}
          </p>
        </section>
      ) : null}

      {gradeImage ? (
        <button
          type="button"
          className={cn(PRIMARY_BUTTON, "w-full")}
          disabled={binding.busyReason !== null}
          onClick={() => {
            const result = binding.applyGradeRecommend?.(gradeImage);
            if (result?.ok) setApplied("참고 이미지 프리셋 추천을 적용했습니다.");
            else if (result?.reason) setApplied(result.reason);
          }}
        >
          참고 실루엣으로 프리셋 추천 적용
        </button>
      ) : null}

      {recommend.status !== "idle" ? (
        <section
          aria-label={t("studio.character.reference.comboSection", "2D 설정화 프리셋 조합 추천")}
          data-character-reference-combo={recommend.status}
          className="rounded-2xl border border-line bg-card/60 p-3"
        >
          <h3 className="text-[0.74rem] font-bold text-fg">
            {t("studio.character.reference.comboTitle", "2D 설정화 AI 프리셋 추천")}
          </h3>
          <p className="mt-1 text-[0.64rem] leading-relaxed text-fg-3">
            {t(
              "studio.character.reference.comboNote",
              "기기 안에서 실루엣과 색을 분석해 체형·헤어·의상 프리셋을 고릅니다. 서버로 보내지 않습니다.",
            )}
          </p>

          {recommend.status === "analyzing" ? (
            <p role="status" className="mt-2 inline-flex items-center gap-1.5 text-[0.66rem] font-semibold text-accent">
              <LoaderCircle size={12} aria-hidden className="animate-spin motion-reduce:animate-none" />
              {t("studio.character.reference.comboAnalyzing", "설정화를 분석하는 중")}
            </p>
          ) : null}

          {comboResult?.ok ? (
            <>
              <ul className="mt-2 space-y-1.5">
                {comboResult.dimensions.map((dimension) => {
                  const available = binding.evaluate(dimension.entry);
                  const unavailable = comboLocked || available.status === "unavailable";
                  return (
                    <li
                      key={dimension.dimension}
                      data-character-combo-dimension={dimension.dimension}
                      className="rounded-xl border border-line bg-card px-2.5 py-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[0.7rem] font-bold text-fg">
                          {REFERENCE_RECOMMEND_DIMENSION_LABELS[dimension.dimension]}
                          <span className="ml-1.5 rounded-full border border-line px-1.5 py-0.5 text-[0.6rem] font-semibold text-fg-3">
                            {REFERENCE_RECOMMEND_CONFIDENCE_LABELS[dimension.confidence]}
                          </span>
                        </p>
                        {dimension.evidenceColor ? (
                          <span className="flex items-center gap-1 text-[0.62rem] tabular-nums text-fg-3">
                            <span
                              aria-hidden
                              className="size-3 rounded-full border border-line-strong/70"
                              style={{ backgroundColor: dimension.evidenceColor }}
                            />
                            {dimension.evidenceColor.toUpperCase()}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-[0.68rem] font-semibold text-fg-2">{dimension.entry.label}</p>
                      <p className="mt-0.5 text-[0.62rem] leading-relaxed text-fg-3">{dimension.reason}</p>
                      <button
                        type="button"
                        className={cn(BUTTON, "mt-1.5 w-full")}
                        disabled={unavailable}
                        title={available.reason ?? dimension.entry.hint}
                        onClick={() => applyComboEntry(dimension.entry)}
                      >
                        {t("studio.character.reference.comboApplyOne", "이 프리셋 적용")}
                      </button>
                      {available.status === "unavailable" && available.reason ? (
                        <p className="mt-1 text-[0.62rem] leading-relaxed text-fg-3">{available.reason}</p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              <button
                type="button"
                className={cn(PRIMARY_BUTTON, "mt-2 w-full")}
                disabled={comboLocked}
                onClick={() => applyComboAll(comboResult.dimensions)}
              >
                {t("studio.character.reference.comboApplyAll", "조합 전체 적용")}
              </button>
              <p className="mt-1 text-[0.62rem] leading-relaxed text-fg-3">
                인물 영역 {Math.round(comboResult.coverage * 100)}% · 전신 설정화일수록 정확합니다.
                마음에 드는 조합이 없으면{" "}
                <button type="button" className="font-semibold text-accent underline" onClick={onClose}>
                  {t("studio.character.reference.browseManually", "프리셋 직접 고르기")}
                </button>
              </p>
            </>
          ) : null}

          {comboResult && !comboResult.ok ? (
            <>
              <p role="alert" className="mt-2 text-[0.66rem] leading-relaxed font-semibold text-bad">
                {comboResult.reason}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  className={BUTTON}
                  disabled={!gradeImage || comboLocked}
                  onClick={retryRecommendation}
                >
                  {t("studio.character.reference.comboRetry", "다시 분석")}
                </button>
                <button type="button" className={BUTTON} onClick={onClose}>
                  {t("studio.character.reference.browseManually", "프리셋 직접 고르기")}
                </button>
              </div>
            </>
          ) : null}
        </section>
      ) : null}

      <StudioVrmAvatarReferenceRecommendationsPanel
        catalogue={catalogue?.catalogue ?? null}
        catalogueStatus={catalogue?.status ?? "idle"}
        catalogueUnavailableReason={
          catalogue?.status === "unavailable"
            ? studioVrmAvatarReferenceCatalogueDiagnosticMessage(catalogue.diagnosticCode ?? null)
            : undefined
        }
        disabled={referenceBlocked}
        previewingPresetId={h.avatarForgeReferencePreviewActive?.presetId ?? null}
        onCatalogueRetry={catalogue?.retry}
        onPreview={(selection) => h.handleAvatarForgeReferencePreview?.(selection)}
        onPreviewClear={() => h.setAvatarForgeReferencePreview?.(null)}
        onApply={(selection) => h.handleAvatarForgeReferenceApply?.(selection)}
      />

      <button type="button" className={cn(BUTTON, "w-full")} onClick={onClose}>
        {t("studio.character.reference.editManually", "참고 도구 닫고 직접 편집")}
      </button>

      <p className="flex items-start gap-1.5 rounded-lg border border-line bg-card/50 px-2.5 py-2 text-[0.64rem] leading-relaxed text-fg-3">
        <Info size={13} aria-hidden className="mt-0.5 shrink-0" />
        {ON_DEVICE_NOTE}
      </p>
    </div>
  );

  /* ---------------------------------------------------------------------- */
  /* Photo tab                                                               */
  /* ---------------------------------------------------------------------- */

  const photoPanel = (
    <div className="space-y-3">
      <StudioVrmPhotoPoseScanner
        disabled={!h.vrm || binding.busyReason !== null}
        handoff={photoHandoff}
        onApply={(payload: StudioVrmPhotoPoseApplyPayload) => {
          const applied = Boolean(h.handlePhotoPoseApply?.(payload));
          // Grade twin must follow the host bone write — never advance on a rejected apply.
          if (shouldSyncGradePoseAfterPhotoApply(applied) && gradeImage) {
            binding.applyGradePoseFromImage?.(gradeImage, "photo");
          }
          return applied;
        }}
      />
      <p className="text-xs leading-relaxed text-fg-3">
        {t("studio.character.reference.photoRecovery", "사진을 읽지 못하면 ‘사진 선택’에서 JPG·PNG·WebP 파일을 다시 골라 주세요. 전신과 팔다리가 선명한 사진이 좋습니다.")}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={BUTTON} onClick={() => changeMode("webcam")}>
          <Video size={14} aria-hidden />
          {t("studio.character.reference.tryWebcam", "웹캠으로 전환")}
        </button>
        <button type="button" className={BUTTON} onClick={onClose}>
          {t("studio.character.reference.editManually", "참고 도구 닫고 직접 편집")}
        </button>
      </div>
    </div>
  );

  /* ---------------------------------------------------------------------- */
  /* Webcam tab                                                              */
  /* ---------------------------------------------------------------------- */

  const webcamActive = Boolean(h.webcamActive);
  const webcamLoading = Boolean(h.webcamLoading);
  const webcamError: string | null = typeof h.webcamError === "string" && h.webcamError ? h.webcamError : null;
  const webcamRecoveryHint = h.webcamErrorStage === "engine"
    ? t("studio.character.reference.webcamEngineRecovery", "추적 모델을 준비하지 못했습니다. 연결을 확인한 뒤 다시 시도하거나 사진 포즈를 사용해 주세요.")
    : t("studio.character.reference.webcamCameraRecovery", "브라우저의 사이트 설정에서 카메라 권한을 확인하고, 카메라를 사용하는 다른 앱을 닫은 뒤 다시 시도해 주세요. 카메라 없이 사진 포즈도 사용할 수 있습니다.");
  const faceDetected = Boolean(h.faceDetected);
  const showConsent = Boolean(h.showConsent);
  const tracking = (h.trackingOptions ?? {}) as Partial<TrackingOptions>;
  const setTracking = (patch: Partial<TrackingOptions>) => {
    h.setTrackingOptions?.((previous: TrackingOptions) => ({ ...previous, ...patch }));
  };

  const startWebcam = () => {
    h.setWebcamError?.(null);
    if (h.webcamConsentGranted || hasStudioVrmWebcamSessionConsent()) {
      h.setWebcamActive?.(true);
      return;
    }
    h.setShowConsent?.(true);
  };

  const webcamPanel = (
    <div className="space-y-3">
      {!h.vrm ? (
        <p className="rounded-xl border border-dashed border-line bg-card/50 px-3 py-3 text-[0.68rem] leading-relaxed text-fg-3">
          모델을 먼저 불러오면 웹캠으로 표정과 머리 각도를 옮길 수 있습니다.
        </p>
      ) : (
        <>
          <p className="text-[0.68rem] leading-relaxed text-fg-3">
            카메라 영상은 기기 안에서만 분석되고 어디에도 보내지 않습니다. 원하는 순간에 &ldquo;표정 굳히기&rdquo;를 누르면
            현재 표정과 머리 각도가 모델에 남습니다.
          </p>

          {webcamActive ? (
            <div className="relative overflow-hidden rounded-xl border border-line bg-canvas">
              <video
                ref={h.videoRef}
                autoPlay
                playsInline
                muted
                aria-label="웹캠 미리 보기"
                className={cn("aspect-video w-full object-cover", tracking.mirrorMode ? "scale-x-[-1]" : "")}
              />
              <p
                role="status"
                className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-full border border-line/60 bg-panel/85 px-2 py-0.5 text-[0.62rem] font-semibold text-fg-2 backdrop-blur"
              >
                <span
                  aria-hidden
                  className={cn("size-1.5 rounded-full", faceDetected ? "bg-good" : "bg-warn")}
                />
                {faceDetected ? "얼굴 감지됨" : "얼굴을 찾는 중"}
              </p>
            </div>
          ) : null}

          {webcamLoading ? (
            <p role="status" className="inline-flex items-center gap-1.5 text-[0.68rem] font-semibold text-accent">
              <LoaderCircle size={13} aria-hidden className="animate-spin motion-reduce:animate-none" />
              카메라와 트래킹 모델을 준비하는 중
            </p>
          ) : null}

          {webcamError ? (
            <div id={`${tabsId}-webcam-error`} role="alert" className="flex items-start gap-1.5 rounded-xl border border-bad/45 bg-bad/10 px-2.5 py-2 text-xs leading-relaxed text-bad">
              <TriangleAlert size={13} aria-hidden className="mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p>{webcamError}</p>
                <p className="mt-1 text-fg-2">{webcamRecoveryHint}</p>
              </div>
            </div>
          ) : null}

          {showConsent && !webcamActive ? (
            <div className="rounded-xl border border-accent/35 bg-accent-soft/40 p-3">
              <p className="text-[0.72rem] font-bold text-accent">카메라 권한이 필요합니다</p>
              <p className="mt-1 text-[0.66rem] leading-relaxed text-fg-2">
                영상은 브라우저 밖으로 나가지 않습니다. 이 탭을 닫으면 동의도 함께 사라집니다.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  className={PRIMARY_BUTTON}
                  onClick={() => {
                    rememberStudioVrmWebcamSessionConsent();
                    h.setWebcamConsentGranted?.(true);
                    h.setShowConsent?.(false);
                    h.setWebcamActive?.(true);
                  }}
                >
                  동의하고 카메라 켜기
                </button>
                <button type="button" className={BUTTON} onClick={() => h.setShowConsent?.(false)}>
                  취소
                </button>
              </div>
            </div>
          ) : null}

          {!showConsent ? (
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                className={cn(BUTTON, "flex-1", webcamActive && "border-bad/45 text-bad hover:bg-bad/10")}
                aria-pressed={webcamActive}
                aria-describedby={webcamError ? `${tabsId}-webcam-error` : undefined}
                onClick={() => (webcamActive || webcamLoading ? h.setWebcamActive?.(false) : startWebcam())}
              >
                {webcamActive ? <VideoOff size={14} aria-hidden /> : <Video size={14} aria-hidden />}
                {webcamLoading
                  ? t("studio.character.reference.cancelWebcam", "카메라 준비 취소")
                  : webcamActive ? "트래킹 중지"
                    : webcamError ? t("studio.character.reference.retryWebcam", "카메라 다시 시도") : "트래킹 시작"}
              </button>
              {webcamActive ? (
                <button
                  type="button"
                  className={cn(PRIMARY_BUTTON, "flex-1")}
                  disabled={!faceDetected}
                  title={faceDetected ? "지금 표정과 머리 각도를 모델에 남깁니다" : "얼굴이 보일 때 사용할 수 있습니다"}
                  onClick={() => h.handleCapturePose?.()}
                >
                  <Snowflake size={14} aria-hidden />
                  표정 굳히기
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button type="button" className={BUTTON} onClick={() => changeMode("photo")}>
              <PersonStanding size={14} aria-hidden />
              {t("studio.character.reference.usePhotoWithoutCamera", "카메라 없이 사진 포즈 사용")}
            </button>
            <button type="button" className={BUTTON} onClick={() => changeMode("reference")}>
              <ImagePlus size={14} aria-hidden />
              {t("studio.character.reference.useReferenceImage", "참고 이미지 사용")}
            </button>
          </div>

          {webcamActive ? (
            <div className="space-y-1.5">
              <ToggleRow
                label="거울 모드 (좌우 반전)"
                checked={Boolean(tracking.mirrorMode)}
                onToggle={(next) => setTracking({ mirrorMode: next })}
              />
              <ToggleRow
                label="손가락 추적 (다시 시작할 때 적용)"
                checked={Boolean(tracking.fingerTracking)}
                onToggle={(next) => setTracking({ fingerTracking: next })}
              />
              <ToggleRow
                label="표정 정리 (한 번에 한 감정만)"
                checked={tracking.resolveExpressionConflicts !== false}
                onToggle={(next) => setTracking({ resolveExpressionConflicts: next })}
              />
              <ToggleRow
                label="시선 고정 (정면 보기)"
                checked={Boolean(tracking.gazeLock)}
                onToggle={(next) => setTracking({ gazeLock: next })}
              />
            </div>
          ) : null}
        </>
      )}
      <p className="flex items-start gap-1.5 rounded-lg border border-line bg-card/50 px-2.5 py-2 text-[0.64rem] leading-relaxed text-fg-3">
        <Info size={13} aria-hidden className="mt-0.5 shrink-0" />
        MediaPipe 얼굴·손 랜드마커 · 기기 내 처리 · 업로드 없음
      </p>
    </div>
  );

  const activeTab = TABS.find((tab) => tab.id === mode) ?? TABS[0];

  return (
    <div className="flex h-full min-h-0 flex-col" data-character-shaper-drawer-body={mode}>
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-line px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-sm font-bold text-fg">참고 도구</p>
          <p className="mt-0.5 text-[0.64rem] leading-relaxed text-fg-3">{activeTab?.hint}</p>
        </div>
        <button
          type="button"
          aria-label="참고 도구 닫기"
          onClick={onClose}
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-card text-fg-2",
            "transition-colors hover:bg-raised hover:text-fg motion-reduce:transition-none",
            STUDIO_FOCUS_RING,
          )}
        >
          <X size={16} aria-hidden />
        </button>
      </div>

      <div role="tablist" aria-label="참고 도구" className="flex shrink-0 gap-1 border-b border-line px-2 py-1.5">
        {TABS.map((tab) => {
          const active = tab.id === mode;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                tabRefs.current.set(tab.id, node);
              }}
              id={`${tabsId}-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`${tabsId}-panel`}
              tabIndex={active ? 0 : -1}
              title={tab.hint}
              onClick={() => changeMode(tab.id)}
              onKeyDown={onTabKeyDown}
              className={cn(
                "min-h-11 flex-1 rounded-xl px-2 text-[0.72rem] font-semibold transition-colors motion-reduce:transition-none",
                STUDIO_FOCUS_RING,
                active ? "bg-accent-soft text-accent" : "text-fg-2 hover:bg-raised hover:text-fg",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div
        id={`${tabsId}-panel`}
        role="tabpanel"
        aria-labelledby={`${tabsId}-${mode}`}
        tabIndex={-1}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3"
      >
        {mode === "reference" ? referencePanel : mode === "photo" ? photoPanel : webcamPanel}
      </div>
    </div>
  );
}
