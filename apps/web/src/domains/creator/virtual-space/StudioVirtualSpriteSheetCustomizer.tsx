import { useEffect, useMemo, useRef, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { StudioVirtualAvatarProfile } from "./studio-virtual-space-model";
import type { StudioSpriteDirection } from "./studio-virtual-space-sprite";
import {
  createMotionStateMachine,
  motionOneShotFinished,
  requestMotionState,
  sampleCustomSheetMotionCell,
  STUDIO_EMOTION_KINDS,
  STUDIO_EMOTION_LABELS,
  STUDIO_MOTION_KINDS,
  STUDIO_MOTION_PROFILES,
  type StudioMotionKind,
  type StudioMotionState,
} from "./studio-virtual-space-character-motion";
import {
  proceduralPaletteFromAvatarProfile,
  proceduralPartsFromAvatarProfile,
  renderProceduralCharacterPreview,
} from "./studio-virtual-space-character-procedural";
import {
  guessSpriteSheetGrid,
  readSpriteSheetDataUrl,
  readSpriteSheetDimensions,
  resolveCustomSpriteSheetImage,
  spriteSheetConfigSchema,
  STUDIO_SPRITE_SHEET_MAX_FILE_BYTES,
  STUDIO_SPRITE_SHEET_PRESETS,
  studioSpriteSheetPresetConfig,
  validateSpriteSheetFile,
  type StudioSpriteSheetConfig,
} from "./studio-virtual-space-sprite-sheet";

/**
 * 커스텀 스프라이트 시트 커스터마이저
 *
 * PNG 업로드(검증·격자 자동 감지·드래그 앤 드롭) + 설정 폼(프레임 수·방향 수·셀 크기·
 * 앵커·프레임레이트) + 실시간 미리보기(8방향 × 14종 모션 애니메이션, 6종 감정 표정) +
 * 내장 프리셋 3종 + 적용/되돌리기. 저장은 부모가 넘긴 onSave로 위임한다.
 */

const DIRECTIONS: readonly { readonly key: StudioSpriteDirection; readonly ko: string; readonly en: string }[] = [
  { key: "down", ko: "아래", en: "Down" },
  { key: "down-left", ko: "왼쪽 아래", en: "Bottom left" },
  { key: "left", ko: "왼쪽", en: "Left" },
  { key: "up-left", ko: "왼쪽 위", en: "Top left" },
  { key: "up", ko: "위", en: "Up" },
  { key: "up-right", ko: "오른쪽 위", en: "Top right" },
  { key: "right", ko: "오른쪽", en: "Right" },
  { key: "down-right", ko: "오른쪽 아래", en: "Bottom right" },
];

const chipStyle = (selected: boolean): React.CSSProperties => ({
  padding: "6px 10px",
  borderRadius: 999,
  border: selected ? "2px solid #1a1a22" : "1px solid rgba(0,0,0,0.25)",
  background: selected ? "#1a1a22" : "#fff",
  color: selected ? "#fff" : "#1a1a22",
  cursor: "pointer",
  fontSize: 12,
});

const groupStyle: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 6, margin: "8px 0" };

const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, margin: "14px 0 4px", display: "block" };

function NumberField({ label, value, min, max, step, onChange }: {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly onChange: (value: number) => void;
}): React.ReactElement {
  return (
    <label style={{ display: "inline-flex", flexDirection: "column", gap: 2, fontSize: 12, minWidth: 92 }}>
      <span style={{ opacity: 0.8 }}>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)));
        }}
        style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.25)", fontSize: 13 }}
      />
    </label>
  );
}

const PREVIEW_SIZE = 264;

export function StudioVirtualSpriteSheetCustomizer(props: {
  readonly profile: StudioVirtualAvatarProfile;
  readonly onSave: (profile: StudioVirtualAvatarProfile) => boolean;
}): React.ReactElement {
  const { profile, onSave } = props;
  const bt = useBilingual("StudioVirtualSpriteSheetCustomizer");

  const [draft, setDraft] = useState<StudioSpriteSheetConfig>(() =>
    profile.spriteSheet ?? studioSpriteSheetPresetConfig(STUDIO_SPRITE_SHEET_PRESETS[0]!),
  );
  const [motionKind, setMotionKind] = useState<StudioMotionKind>("idle");
  const [direction, setDirection] = useState<StudioSpriteDirection>("down");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [gridInfo, setGridInfo] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sheetCanvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const motionRef = useRef<StudioMotionState>(createMotionStateMachine("idle", 0));
  const directionRef = useRef(direction);
  directionRef.current = direction;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const applied = Boolean(profile.spriteSheet);

  // 프리셋/업로드 이미지 URL 풀기 (프리셋은 동기 프로시저럴 생성).
  useEffect(() => {
    try {
      setImageUrl(resolveCustomSpriteSheetImage({ image: draft.image }));
    } catch {
      setImageUrl(null);
    }
  }, [draft.image]);

  // 애니메이션 미리보기 루프.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduced = typeof window !== "undefined"
      && typeof window.matchMedia === "function"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    const render = (now: number) => {
      const config = draftRef.current;
      // 단발 모션(점프·인사)이 끝나면 자동으로 대기로 복귀.
      const current = motionRef.current;
      if (motionOneShotFinished(current, now)) {
        motionRef.current = requestMotionState(current, "idle", now);
      }
      const sample = sampleCustomSheetMotionCell(config, motionRef.current, directionRef.current, now, reduced);
      const img = imageRef.current;
      ctx.clearRect(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
      if (img && img.complete && img.naturalWidth > 0) {
        const scale = Math.min(200 / config.frameWidth, 200 / config.frameHeight);
        const dw = config.frameWidth * scale;
        const dh = config.frameHeight * scale;
        ctx.save();
        ctx.translate(PREVIEW_SIZE / 2, PREVIEW_SIZE * 0.74 + sample.bobYPx * scale);
        ctx.rotate(sample.tiltRad + (sample.rotationDeg * Math.PI) / 180);
        ctx.scale(1, sample.scaleY);
        ctx.drawImage(
          img,
          sample.column * config.frameWidth,
          sample.row * config.frameHeight,
          config.frameWidth,
          config.frameHeight,
          -dw * config.anchorX,
          -dh * config.anchorY,
          dw,
          dh,
        );
        ctx.restore();
      }
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, []);

  // 시트 전체 + 격자 오버레이.
  useEffect(() => {
    const canvas = sheetCanvasRef.current;
    const url = imageUrl;
    if (!canvas || !url || typeof Image === "undefined") return;
    const img = new Image();
    imageRef.current = img;
    img.onload = () => {
      const target = sheetCanvasRef.current;
      if (!target) return;
      const config = draftRef.current;
      const maxW = 300;
      const scale = Math.min(1, maxW / img.naturalWidth);
      target.width = Math.max(1, Math.round(img.naturalWidth * scale));
      target.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = target.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, target.width, target.height);
      ctx.drawImage(img, 0, 0, target.width, target.height);
      // 감지된 셀 격자를 점선으로 표시.
      ctx.strokeStyle = "rgba(26,26,34,0.55)";
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1;
      const cellW = (config.frameWidth * target.width) / img.naturalWidth;
      const cellH = (config.frameHeight * target.height) / img.naturalHeight;
      for (let row = 0; row <= config.directionCount; row++) {
        ctx.beginPath();
        ctx.moveTo(0, row * cellH);
        ctx.lineTo(target.width, row * cellH);
        ctx.stroke();
      }
      for (let column = 0; column <= config.framesPerDirection; column++) {
        ctx.beginPath();
        ctx.moveTo(column * cellW, 0);
        ctx.lineTo(column * cellW, target.height);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    };
    img.onerror = () => {
      imageRef.current = null;
    };
    img.src = url;
    return () => {
      img.onload = null;
      img.onerror = null;
    };
    // 격자는 프레임 기하를 읽으므로 기하가 바뀌면 다시 그린다.
  }, [imageUrl, draft.frameWidth, draft.frameHeight, draft.directionCount, draft.framesPerDirection]);

  // 감정 표정 미니 미리보기 (프로시저럴 얼굴 기준).
  const emotionPreviews = useMemo(() => {
    try {
      const palette = proceduralPaletteFromAvatarProfile(profile);
      const parts = proceduralPartsFromAvatarProfile(profile);
      return STUDIO_EMOTION_KINDS.map((emotion) => ({
        emotion,
        url: renderProceduralCharacterPreview(palette, parts, undefined, emotion).dataUrl,
      }));
    } catch {
      return [];
    }
  }, [profile]);

  const updateDraft = (patch: Partial<StudioSpriteSheetConfig>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
    setStatus(null);
  };

  const handleFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setUploadError(null);
    setStatus(null);
    const validation = validateSpriteSheetFile(file);
    if (!validation.ok) {
      setUploadError(
        validation.reason === "type"
          ? bt("PNG 파일만 올릴 수 있습니다.", "Only PNG files can be uploaded.")
          : bt(
              `파일이 너무 큽니다. ${(STUDIO_SPRITE_SHEET_MAX_FILE_BYTES / 1024).toFixed(0)}KB 이하의 PNG를 올려주세요.`,
              `The file is too large. Please upload a PNG under ${(STUDIO_SPRITE_SHEET_MAX_FILE_BYTES / 1024).toFixed(0)}KB.`,
            ),
      );
      return;
    }
    try {
      const dataUrl = await readSpriteSheetDataUrl(file);
      const { width, height } = await readSpriteSheetDimensions(dataUrl);
      const guess = guessSpriteSheetGrid(width, height, draft.directionCount);
      if (guess) {
        updateDraft({
          image: dataUrl,
          frameWidth: guess.frameWidth,
          frameHeight: guess.frameHeight,
          framesPerDirection: guess.framesPerDirection,
          walkFrames: Math.min(guess.framesPerDirection, 6),
        });
        setGridInfo(
          bt(
            `격자 자동 감지: ${draft.directionCount}방향 × ${guess.framesPerDirection}프레임 (${guess.frameWidth}×${guess.frameHeight}px)`,
            `Auto-detected grid: ${draft.directionCount} directions × ${guess.framesPerDirection} frames (${guess.frameWidth}×${guess.frameHeight}px)`,
          ),
        );
      } else {
        updateDraft({ image: dataUrl });
        setGridInfo(
          bt(
            `이미지 크기 ${width}×${height}px — 격자를 자동으로 찾지 못했습니다. 아래에서 직접 맞춰주세요.`,
            `Image is ${width}×${height}px — couldn't auto-detect the grid. Adjust it below.`,
          ),
        );
      }
    } catch {
      setUploadError(bt("이미지를 읽지 못했습니다. 다른 PNG로 다시 시도해주세요.", "Couldn't read the image. Please try another PNG."));
    }
  };

  const applyPreset = (presetKey: string) => {
    const preset = STUDIO_SPRITE_SHEET_PRESETS.find((item) => item.key === presetKey);
    if (!preset) return;
    setDraft(studioSpriteSheetPresetConfig(preset));
    setGridInfo(null);
    setUploadError(null);
    setStatus(null);
  };

  const applySheet = () => {
    const parsed = spriteSheetConfigSchema.safeParse(draft);
    if (!parsed.success) {
      setStatus(bt("설정이 올바르지 않습니다. 숫자 범위를 확인해주세요.", "The settings are invalid. Please check the numeric ranges."));
      return;
    }
    const ok = onSave({ ...profile, spriteSheet: parsed.data });
    setStatus(
      ok
        ? bt("스프라이트 시트를 적용했습니다. 가상 오피스에서 바로 반영됩니다.", "Sprite sheet applied. It takes effect in the virtual office right away.")
        : bt("저장에 실패했습니다. 다시 시도해주세요.", "Save failed. Please try again."),
    );
  };

  const clearSheet = () => {
    const next = { ...profile };
    delete next.spriteSheet;
    const ok = onSave(next);
    setStatus(
      ok
        ? bt("커스텀 시트를 지우고 기본 캐릭터로 되돌렸습니다.", "Custom sheet removed. Back to the default character.")
        : bt("저장에 실패했습니다. 다시 시도해주세요.", "Save failed. Please try again."),
    );
  };

  const requestMotion = (kind: StudioMotionKind, now: number) => {
    setMotionKind(kind);
    motionRef.current = requestMotionState(motionRef.current, kind, now);
  };

  return (
    <section aria-label={bt("스프라이트 시트", "Sprite sheet")} style={{ marginTop: 20, borderTop: "1px solid rgba(0,0,0,0.12)", paddingTop: 16 }}>
      <h3 style={{ fontSize: 15, margin: "0 0 4px" }}>{bt("커스텀 스프라이트 시트", "Custom sprite sheet")}</h3>
      <p style={{ fontSize: 12.5, opacity: 0.75, margin: "0 0 8px" }}>
        {bt(
          "PNG 시트를 올리면 내 아바타가 그 캐릭터로 바뀝니다. 방향별 행(4/8방향)과 프레임 열을 맞춰주세요.",
          "Upload a PNG sheet to turn your avatar into that character. Match the direction rows (4/8) and frame columns.",
        )}
      </p>
      {applied ? (
        <p style={{ fontSize: 12.5, color: "#1a7a3a", margin: "0 0 8px" }}>
          {bt("적용 중: 커스텀 스프라이트 시트", "Active: custom sprite sheet")}
        </p>
      ) : (
        <p style={{ fontSize: 12.5, opacity: 0.7, margin: "0 0 8px" }}>
          {bt("현재는 기본 캐릭터를 사용 중입니다.", "Currently using the default character.")}
        </p>
      )}

      {/* 업로드 */}
      <span id="sprite-sheet-upload-label" style={labelStyle}>{bt("PNG 업로드", "Upload PNG")}</span>
      <div
        role="button"
        tabIndex={0}
        aria-labelledby="sprite-sheet-upload-label"
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") fileInputRef.current?.click();
        }}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => { event.preventDefault(); setDragging(false); void handleFiles(event.dataTransfer.files); }}
        style={{
          border: `2px dashed ${dragging ? "#1a1a22" : "rgba(0,0,0,0.3)"}`,
          borderRadius: 12,
          padding: "18px 12px",
          textAlign: "center",
          cursor: "pointer",
          background: dragging ? "rgba(0,0,0,0.04)" : undefined,
          fontSize: 13,
        }}
      >
        {bt("클릭하거나 PNG 파일을 끌어다 놓으세요 (768KB 이하)", "Click or drag a PNG here (under 768KB)")}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png"
          style={{ display: "none" }}
          onChange={(event) => { void handleFiles(event.target.files); event.target.value = ""; }}
          aria-label={bt("스프라이트 시트 PNG 선택", "Choose sprite sheet PNG")}
        />
      </div>
      {uploadError && (
        <p role="alert" style={{ fontSize: 12.5, color: "#b3261e", margin: "6px 0 0" }}>{uploadError}</p>
      )}
      {gridInfo && <p style={{ fontSize: 12.5, color: "#1a5fb4", margin: "6px 0 0" }}>{gridInfo}</p>}

      {/* 프리셋 */}
      <span style={labelStyle}>{bt("내장 프리셋", "Built-in presets")}</span>
      <div style={groupStyle} role="group" aria-label={bt("프리셋", "Presets")}>
        {STUDIO_SPRITE_SHEET_PRESETS.map((preset) => (
          <button
            key={preset.key}
            type="button"
            aria-pressed={draft.image === `preset:${preset.key}`}
            onClick={() => applyPreset(preset.key)}
            style={chipStyle(draft.image === `preset:${preset.key}`)}
          >
            {bt(preset.labelKo, preset.labelEn)}
          </button>
        ))}
      </div>

      {/* 설정 폼 */}
      <span style={labelStyle}>{bt("시트 설정", "Sheet settings")}</span>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
        <label style={{ display: "inline-flex", flexDirection: "column", gap: 2, fontSize: 12 }}>
          <span style={{ opacity: 0.8 }}>{bt("방향 수", "Directions")}</span>
          <select
            value={draft.directionCount}
            onChange={(event) => updateDraft({ directionCount: Number(event.target.value) === 8 ? 8 : 4 })}
            style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid rgba(0,0,0,0.25)", fontSize: 13 }}
          >
            <option value={4}>{bt("4방향", "4 directions")}</option>
            <option value={8}>{bt("8방향", "8 directions")}</option>
          </select>
        </label>
        <NumberField label={bt("방향당 프레임", "Frames / direction")} value={draft.framesPerDirection} min={1} max={16} step={1}
          onChange={(value) => updateDraft({ framesPerDirection: Math.round(value) })} />
        <NumberField label={bt("셀 너비(px)", "Cell width (px)")} value={draft.frameWidth} min={8} max={1024} step={1}
          onChange={(value) => updateDraft({ frameWidth: Math.round(value) })} />
        <NumberField label={bt("셀 높이(px)", "Cell height (px)")} value={draft.frameHeight} min={8} max={1024} step={1}
          onChange={(value) => updateDraft({ frameHeight: Math.round(value) })} />
        <NumberField label={bt("걷기 프레임", "Walk frames")} value={draft.walkFrames ?? draft.framesPerDirection} min={1} max={draft.framesPerDirection} step={1}
          onChange={(value) => updateDraft({ walkFrames: Math.round(value) })} />
        <NumberField label={bt("프레임레이트", "Frame rate")} value={draft.frameRate} min={1} max={30} step={1}
          onChange={(value) => updateDraft({ frameRate: Math.round(value) })} />
        <NumberField label={bt("표시 높이(px)", "Display height (px)")} value={draft.displayHeight} min={48} max={256} step={1}
          onChange={(value) => updateDraft({ displayHeight: Math.round(value) })} />
        <NumberField label={bt("앵커 X", "Anchor X")} value={draft.anchorX} min={0} max={1} step={0.05}
          onChange={(value) => updateDraft({ anchorX: value })} />
        <NumberField label={bt("앵커 Y", "Anchor Y")} value={draft.anchorY} min={0} max={1} step={0.05}
          onChange={(value) => updateDraft({ anchorY: value })} />
        <NumberField label={bt("오프셋 X", "Offset X")} value={draft.offsetX} min={-64} max={64} step={1}
          onChange={(value) => updateDraft({ offsetX: Math.round(value) })} />
        <NumberField label={bt("오프셋 Y", "Offset Y")} value={draft.offsetY} min={-64} max={64} step={1}
          onChange={(value) => updateDraft({ offsetY: Math.round(value) })} />
      </div>

      {/* 미리보기 */}
      <span style={labelStyle}>{bt("실시간 미리보기", "Live preview")}</span>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div style={{ textAlign: "center" }}>
          <canvas
            ref={canvasRef}
            width={PREVIEW_SIZE}
            height={PREVIEW_SIZE}
            role="img"
            aria-label={bt("스프라이트 애니메이션 미리보기", "Sprite animation preview")}
            style={{ border: "1px solid rgba(0,0,0,0.15)", borderRadius: 12, background: "rgba(0,0,0,0.03)" }}
          />
          <p style={{ fontSize: 12, opacity: 0.7, margin: "4px 0 0" }}>
            {bt(STUDIO_MOTION_PROFILES[motionKind].labelKo, STUDIO_MOTION_PROFILES[motionKind].labelEn)}
            {" · "}
            {bt(DIRECTIONS.find((item) => item.key === direction)?.ko ?? "", DIRECTIONS.find((item) => item.key === direction)?.en ?? "")}
          </p>
        </div>
        <div>
          <span style={{ fontSize: 12, fontWeight: 600 }}>{bt("방향", "Direction")}</span>
          <div style={groupStyle} role="group" aria-label={bt("방향", "Direction")}>
            {DIRECTIONS.map((item) => (
              <button key={item.key} type="button" aria-pressed={direction === item.key}
                onClick={() => setDirection(item.key)} style={chipStyle(direction === item.key)}>
                {bt(item.ko, item.en)}
              </button>
            ))}
          </div>
          <span style={{ fontSize: 12, fontWeight: 600 }}>{bt("모션", "Motion")}</span>
          <div style={{ ...groupStyle, maxWidth: 320 }} role="group" aria-label={bt("모션", "Motion")}>
            {STUDIO_MOTION_KINDS.map((kind) => (
              <button key={kind} type="button" aria-pressed={motionKind === kind}
                onClick={() => requestMotion(kind, typeof performance !== "undefined" ? performance.now() : Date.now())} style={chipStyle(motionKind === kind)}>
                {bt(STUDIO_MOTION_PROFILES[kind].labelKo, STUDIO_MOTION_PROFILES[kind].labelEn)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 시트 전체 + 격자 */}
      {imageUrl && (
        <div style={{ marginTop: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>{bt("시트 전체 (격자 확인)", "Full sheet (grid check)")}</span>
          <div>
            <canvas ref={sheetCanvasRef} role="img" aria-label={bt("스프라이트 시트 격자", "Sprite sheet grid")}
              style={{ border: "1px solid rgba(0,0,0,0.15)", borderRadius: 8, marginTop: 4, maxWidth: "100%" }} />
          </div>
        </div>
      )}

      {/* 감정 표정 */}
      <span style={labelStyle}>{bt("감정 표정 미리보기", "Emotion preview")}</span>
      <p style={{ fontSize: 12, opacity: 0.7, margin: "0 0 6px" }}>
        {bt("이모트·상태에 따라 바뀌는 얼굴 표정입니다 (프로시저럴 캐릭터 기준).", "Face expressions that change with emotes and status (procedural character).")}
      </p>
      <div style={groupStyle} role="group" aria-label={bt("감정", "Emotion")}>
        {emotionPreviews.map((item) => (
          <figure
            key={item.emotion}
            style={{
              ...chipStyle(false),
              margin: 0,
              padding: 4,
              display: "inline-flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
            }}
          >
            <img src={item.url} alt={bt(STUDIO_EMOTION_LABELS[item.emotion].ko, STUDIO_EMOTION_LABELS[item.emotion].en)}
              width={48} height={56} style={{ imageRendering: "pixelated" }} />
            <figcaption>{bt(STUDIO_EMOTION_LABELS[item.emotion].ko, STUDIO_EMOTION_LABELS[item.emotion].en)}</figcaption>
          </figure>
        ))}
      </div>

      {/* 적용/되돌리기 */}
      <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={applySheet}
          style={{
            padding: "10px 18px", borderRadius: 10, border: "none", background: "#1a1a22", color: "#fff",
            fontSize: 14, fontWeight: 600, cursor: "pointer",
          }}
        >
          {bt("시트 적용하기", "Apply sheet")}
        </button>
        {applied && (
          <button
            type="button"
            onClick={clearSheet}
            style={{
              padding: "10px 18px", borderRadius: 10, border: "1px solid rgba(0,0,0,0.3)", background: "#fff",
              fontSize: 14, cursor: "pointer",
            }}
          >
            {bt("되돌리기 (기본 캐릭터)", "Revert to default")}
          </button>
        )}
      </div>
      {status && (
        <p role="status" style={{ fontSize: 13, margin: "8px 0 0", color: "#1a5fb4" }}>{status}</p>
      )}
    </section>
  );
}
