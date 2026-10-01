/**
 * Shaper식 웹툰 포즈 프리셋 탐색 그리드.
 *
 * - 카테고리(액션/일상/드라마틱/감정) × 성별 × 인원수 필터 + 검색어.
 * - 각 포즈 카드는 실제 관절 각도에서 그린 SVG 실루엣 미니어처를 보여주고,
 *   카드 클릭 한 번으로 `onApplyPreset`이 호출된다(원클릭 적용).
 * - 즐겨찾기(핀)·최근 사용 목록은 localStorage에 방어적으로 저장된다.
 * - 팀 공유: 즐겨찾기 컬렉션을 JSON 파일로 내보내기/가져오기.
 *
 * 데생 인형 포저 패널과 VRM 포저에서 함께 재사용한다. 적용 방식(마네킹/VRM)은
 * 호출자가 `onApplyPreset`으로 주입하므로 이 컴포넌트는 렌더링에만 집중한다.
 */

import { Download, MousePointerClick, Pin, Search, Sparkles, Upload, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import {
  StudioSectionHeader,
  StudioToggleChip,
} from "../studio-panel-ui";
import {
  ADVANCED_WEBTOON_POSES,
  WEBTOON_POSE_CATEGORY_META,
  WEBTOON_POSE_FIGURE_META,
  WEBTOON_POSE_GENDER_META,
  filterWebtoonPosePresets,
  getWebtoonPosePresetById,
  type CharacterFullBodyPosePreset,
  type CharacterPoseCategory,
  type HumanoidJointRotation,
  type WebtoonPoseFigureCount,
  type WebtoonPoseGender,
  type WebtoonPosePresetFilter,
} from "./studio-3d-advanced-poses-library";
import {
  buildWebtoonPoseShareFileName,
  parseWebtoonPoseSharePayload,
  serializeWebtoonPoseSharePayload,
} from "./studio-webtoon-pose-share";
import {
  readWebtoonPosePresetFavorites,
  readWebtoonPosePresetRecent,
  recordWebtoonPosePresetRecent,
  toggleWebtoonPosePresetFavorite,
  writeWebtoonPosePresetFavorites,
} from "./studio-webtoon-pose-preset-storage";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

import type { ReactElement } from "react";

export interface StudioWebtoonPosePresetGridProps {
  /** 포즈 카드 클릭(원클릭 적용) 시 호출. preset id를 전달한다. */
  readonly onApplyPreset: (presetId: string) => void;
  /** 적용 버튼 비활성화 여부 (예: 씬이 준비되지 않았을 때). */
  readonly applyDisabled?: boolean;
}

type CategoryFilter = CharacterPoseCategory | "all";
type GenderFilter = WebtoonPoseGender | "all";
type FiguresFilter = WebtoonPoseFigureCount | "all";

const CATEGORY_LABELS: Readonly<Record<CharacterPoseCategory, string>> = Object.freeze(
  Object.fromEntries(WEBTOON_POSE_CATEGORY_META.map((meta) => [meta.id, meta.label])),
) as Readonly<Record<CharacterPoseCategory, string>>;

function displayName(fullName: string): string {
  const parenIndex = fullName.indexOf(" (");
  return parenIndex > 0 ? fullName.slice(0, parenIndex) : fullName;
}

function figureLabel(figures: WebtoonPoseFigureCount): string {
  return figures === 2 ? "2인" : "1인";
}

// ---------------------------------------------------------------------------
// SVG 실루엣 미니어처: 포즈의 실제 관절 각도(X축 오일러)에서 그린 측면 스틱 피규어.
// ---------------------------------------------------------------------------

function jointXDeg(rotations: readonly HumanoidJointRotation[], joint: string): number {
  const entry = rotations.find((item) => item.joint === joint);
  return entry ? entry.rotationEulerDeg[0] : 0;
}

interface SilhouettePoint {
  readonly x: number;
  readonly y: number;
}

function movePoint(from: SilhouettePoint, forwardDeg: number, length: number): SilhouettePoint {
  // 측면 뷰(왼쪽이 정면). forwardDeg>0 이면 정면(왼쪽)으로 기울어진다.
  const rad = (forwardDeg * Math.PI) / 180;
  return { x: from.x - length * Math.sin(rad), y: from.y + length * Math.cos(rad) };
}

function PoseSilhouette({ preset }: { preset: CharacterFullBodyPosePreset }): ReactElement {
  const rotations = preset.jointRotations;
  const spineLean = jointXDeg(rotations, "spine"); // X+ = 앞으로 숙임
  const hips: SilhouettePoint = { x: 32, y: 50 };
  // 몸통은 위쪽을 향하므로 위쪽 기준 각도로 계산한다. lean>0 이면 정면(왼쪽)으로 숙인다.
  const leanRad = (spineLean * Math.PI) / 180;
  const neck: SilhouettePoint = {
    x: hips.x - 18 * Math.sin(leanRad),
    y: hips.y - 18 * Math.cos(leanRad),
  };
  const headCenter: SilhouettePoint = {
    x: neck.x - 9 * Math.sin(leanRad),
    y: neck.y - 9 * Math.cos(leanRad),
  };
  const shoulder: SilhouettePoint = {
    x: hips.x + (neck.x - hips.x) * 0.82,
    y: hips.y + (neck.y - hips.y) * 0.82,
  };

  function limb(
    side: "right" | "left",
    upperJoint: string,
    lowerJoint: string,
    upperLength: number,
    lowerLength: number,
    upperXSign: 1 | -1,
    lowerXSign: 1 | -1,
    origin: SilhouettePoint,
  ): readonly [SilhouettePoint, SilhouettePoint, SilhouettePoint] {
    // 팔다리 rest는 아래로 늘어짐. X- = 앞으로 스윙(팔·다리), 무릎 X+ = 뒤굽힘.
    const upperForward = upperXSign * -jointXDeg(rotations, `${side}${upperJoint}`);
    const mid = movePoint(origin, upperForward, upperLength);
    const lowerForward = upperForward + lowerXSign * -jointXDeg(rotations, `${side}${lowerJoint}`);
    const end = movePoint(mid, lowerForward, lowerLength);
    const depthOffset = side === "left" ? { x: 2.5, y: 0.8 } : { x: 0, y: 0 };
    return [
      { x: origin.x + depthOffset.x, y: origin.y + depthOffset.y },
      { x: mid.x + depthOffset.x, y: mid.y + depthOffset.y },
      { x: end.x + depthOffset.x, y: end.y + depthOffset.y },
    ] as const;
  }

  const rightArm = limb("right", "UpperArm", "LowerArm", 13, 11, 1, 1, shoulder);
  const leftArm = limb("left", "UpperArm", "LowerArm", 13, 11, 1, 1, shoulder);
  const rightLeg = limb("right", "UpperLeg", "LowerLeg", 16, 15, 1, -1, hips);
  const leftLeg = limb("left", "UpperLeg", "LowerLeg", 16, 15, 1, -1, hips);

  function polyline(points: readonly SilhouettePoint[]): string {
    return points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  }

  return (
    <svg
      viewBox="0 0 64 88"
      className="h-16 w-full text-fg-3"
      role="img"
      aria-label={`${displayName(preset.name)} 포즈 실루엣`}
    >
      {/* 뒤쪽(왼쪽) 팔다리 — 반투명 */}
      <g stroke="currentColor" strokeLinecap="round" fill="none" opacity={0.35}>
        <polyline points={polyline(leftArm)} strokeWidth={3} />
        <polyline points={polyline(leftLeg)} strokeWidth={3.4} />
      </g>
      {/* 몸통·머리 */}
      <g stroke="currentColor" strokeLinecap="round" fill="none">
        <line x1={hips.x} y1={hips.y} x2={neck.x} y2={neck.y} strokeWidth={4} />
        <circle cx={headCenter.x} cy={headCenter.y} r={6} strokeWidth={2.4} />
      </g>
      {/* 앞쪽(오른쪽) 팔다리 */}
      <g stroke="currentColor" strokeLinecap="round" fill="none">
        <polyline points={polyline(rightArm)} strokeWidth={3} />
        <polyline points={polyline(rightLeg)} strokeWidth={3.4} />
      </g>
    </svg>
  );
}

function PresetCard({
  preset,
  pinned,
  disabled,
  onApply,
  onTogglePin,
}: {
  preset: CharacterFullBodyPosePreset;
  pinned: boolean;
  disabled: boolean;
  onApply: (presetId: string) => void;
  onTogglePin: (presetId: string) => void;
}): ReactElement {
  const shortName = displayName(preset.name);
  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-xl border p-1.5 transition-colors",
        pinned
          ? "border-accent/50 bg-accent-soft/25"
          : "border-line bg-card/45 hover:border-accent/40 hover:bg-raised",
      )}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => onApply(preset.id)}
        title={`${preset.name} — 클릭하면 바로 적용`}
        aria-label={`${preset.name} 포즈 적용`}
        className="flex w-full flex-col rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
      >
        <PoseSilhouette preset={preset} />
        <span className="mt-1 block truncate text-[0.7rem] font-bold text-fg" title={preset.name}>
          {shortName}
        </span>
        <span className="block text-[0.62rem] text-fg-3">
          {CATEGORY_LABELS[preset.category]} · {figureLabel(preset.figures)}
        </span>
      </button>
      <button
        type="button"
        onClick={() => onTogglePin(preset.id)}
        aria-pressed={pinned}
        aria-label={pinned ? `${shortName} 즐겨찾기 해제` : `${shortName} 즐겨찾기 고정`}
        title={pinned ? "즐겨찾기 해제" : "즐겨찾기에 고정"}
        className={cn(
          "absolute right-1 top-1 grid size-6 place-items-center rounded-md transition-colors",
          pinned
            ? "text-accent hover:bg-accent-soft"
            : "text-fg-3 opacity-0 hover:bg-raised hover:text-fg focus-visible:opacity-100",
          // 터치 기기에는 hover가 없어 항상 보이게 한다.
          "group-hover:opacity-100 pointer-coarse:opacity-100",
        )}
      >
        <Pin size={13} aria-hidden className={pinned ? "fill-accent" : undefined} />
      </button>
    </div>
  );
}

export function StudioWebtoonPosePresetGrid({
  onApplyPreset,
  applyDisabled = false,
}: StudioWebtoonPosePresetGridProps): ReactElement {
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [gender, setGender] = useState<GenderFilter>("all");
  const [figures, setFigures] = useState<FiguresFilter>("all");
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState<string[]>(() => readWebtoonPosePresetFavorites());
  const [recent, setRecent] = useState<string[]>(() => readWebtoonPosePresetRecent());
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const isDefaultFilter = category === "all" && gender === "all" && figures === "all" && query.trim() === "";

  const filtered = useMemo(() => {
    const filter: WebtoonPosePresetFilter = {
      category,
      gender,
      figures,
      query: query.trim() ? query : undefined,
    };
    return filterWebtoonPosePresets(filter);
  }, [category, gender, figures, query]);

  const favoritePresets = useMemo(
    () =>
      favorites
        .map((id) => getWebtoonPosePresetById(id))
        .filter((preset): preset is CharacterFullBodyPosePreset => preset !== undefined),
    [favorites],
  );

  const recentPresets = useMemo(
    () =>
      recent
        .map((id) => getWebtoonPosePresetById(id))
        .filter((preset): preset is CharacterFullBodyPosePreset => preset !== undefined),
    [recent],
  );

  const pinnedSet = useMemo(() => new Set(favorites), [favorites]);

  const handleApply = (presetId: string) => {
    onApplyPreset(presetId);
    setRecent(recordWebtoonPosePresetRecent(presetId));
  };

  const handleTogglePin = (presetId: string) => {
    setFavorites(toggleWebtoonPosePresetFavorite(presetId));
  };

  const handleExportShare = () => {
    try {
      const json = serializeWebtoonPoseSharePayload({
        presetIds: favorites.length > 0 ? favorites : ADVANCED_WEBTOON_POSES.map((p) => p.id),
        favoriteIds: favorites,
      });
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = buildWebtoonPoseShareFileName();
      anchor.click();
      URL.revokeObjectURL(url);
      setShareMessage(
        favorites.length > 0
          ? `즐겨찾기 ${favorites.length}개를 JSON으로 내보냈습니다.`
          : "전체 프리셋 목록을 JSON으로 내보냈습니다.",
      );
    } catch {
      setShareMessage("내보내기에 실패했습니다. 다시 시도해 주세요.");
    }
  };

  const handleImportShareFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const payload = parseWebtoonPoseSharePayload(loadEvent.target?.result);
      if (!payload) {
        setShareMessage("가져올 수 없는 파일입니다. 웹툰 포즈 공유 JSON인지 확인해 주세요.");
        return;
      }
      const merged = [...payload.favoriteIds];
      for (const id of favorites) {
        if (!merged.includes(id)) merged.push(id);
      }
      const ok = writeWebtoonPosePresetFavorites(merged);
      if (ok) setFavorites(merged);
      setShareMessage(
        `공유 프리셋 ${payload.presetIds.length}개 중 즐겨찾기 ${payload.favoriteIds.length}개를 가져왔습니다.`,
      );
    };
    reader.onerror = () => {
      setShareMessage("파일을 읽지 못했습니다. 다시 시도해 주세요.");
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-3">
      <StudioSectionHeader
        title="웹툰 포즈 프리셋"
        action={
          <div className="flex gap-1">
            <button
              type="button"
              onClick={handleExportShare}
              className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1 text-[0.7rem]" })}
              title="즐겨찾기 프리셋을 JSON 파일로 내보내기 (팀 공유)"
              aria-label="즐겨찾기 프리셋 내보내기"
            >
              <Download size={13} aria-hidden /> 내보내기
            </button>
            <button
              type="button"
              onClick={() => importInputRef.current?.click()}
              className={buttonClass({ size: "sm", variant: "quiet", className: "gap-1 text-[0.7rem]" })}
              title="팀원과 공유받은 포즈 프리셋 JSON 가져오기"
            >
              <Upload size={13} aria-hidden /> 가져오기
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              aria-label="포즈 프리셋 공유 JSON 파일 가져오기"
              onChange={handleImportShareFile}
            />
          </div>
        }
      />

      {shareMessage ? (
        <p role="status" aria-live="polite" className="rounded-lg border border-line bg-card/60 px-2 py-1.5 text-[0.68rem] text-fg-2">
          {shareMessage}
        </p>
      ) : null}

      {/* 한 줄 목적 설명: 처음 보는 사용자도 10초 안에 이해한다. 좁은 패널에서 머리글 버튼과
          설명이 한 줄을 다투지 않도록 설명은 머리글 아래 전체 폭에 둔다. 실루엣은 실제 관절 각도로 그린다. */}
      <p className="flex items-start gap-1.5 text-[0.68rem] leading-relaxed text-fg-3">
        <MousePointerClick size={13} aria-hidden className="mt-0.5 shrink-0 text-accent" />
        <span>
          포즈 카드를 클릭하면 3D 캐릭터에 바로 적용됩니다.{" "}
          <span lang="en">Click a pose card to apply it to the 3D character instantly.</span>
        </span>
      </p>

      {/* 필터: 카테고리 × 성별 × 인원수 */}
      <div className="space-y-1.5">
        <div className="flex flex-wrap gap-1" role="group" aria-label="포즈 카테고리">
          <StudioToggleChip active={category === "all"} onClick={() => setCategory("all")}>
            전체
          </StudioToggleChip>
          {WEBTOON_POSE_CATEGORY_META.map((meta) => (
            <StudioToggleChip
              key={meta.id}
              active={category === meta.id}
              onClick={() => setCategory(meta.id)}
            >
              {meta.label}
            </StudioToggleChip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="성별 필터">
          <span className="mr-1 text-[0.66rem] font-semibold text-fg-3">성별</span>
          {WEBTOON_POSE_GENDER_META.map((meta) => (
            <StudioToggleChip
              key={meta.id}
              active={gender === meta.id}
              onClick={() => setGender(meta.id)}
            >
              {meta.label}
            </StudioToggleChip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="인원수 필터">
          <span className="mr-1 text-[0.66rem] font-semibold text-fg-3">인원</span>
          {WEBTOON_POSE_FIGURE_META.map((meta) => (
            <StudioToggleChip
              key={String(meta.id)}
              active={figures === meta.id}
              onClick={() => setFigures(meta.id)}
            >
              {meta.label}
            </StudioToggleChip>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-fg-3" aria-hidden />
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value.slice(0, 200))}
            placeholder="포즈 검색 — 예: 검, 포옹, 카페"
            aria-label="포즈 프리셋 검색"
            className="w-full rounded-lg border border-line bg-card py-1 pl-7 pr-7 text-[0.7rem] placeholder:text-fg-3 outline-none transition-colors focus:border-accent"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="검색어 지우기"
              className="absolute right-1.5 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded-md text-fg-3 hover:bg-raised hover:text-fg"
            >
              <X size={12} aria-hidden />
            </button>
          ) : null}
        </div>
      </div>

      {/* 최근 사용 */}
      {isDefaultFilter && recentPresets.length > 0 ? (
        <section aria-label="최근 사용한 포즈">
          <h4 className="mb-1.5 text-[0.68rem] font-bold text-fg-2">최근 사용</h4>
          <div className="flex flex-wrap gap-1">
            {recentPresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                disabled={applyDisabled}
                onClick={() => handleApply(preset.id)}
                title={`${preset.name} — 클릭하면 바로 적용`}
                className="inline-flex max-w-full items-center gap-1 truncate rounded-full border border-accent/40 bg-accent-soft/30 px-2.5 py-1 text-[0.68rem] font-semibold text-fg-2 transition-colors hover:bg-accent-soft/60 disabled:opacity-50"
              >
                <span className="truncate">{displayName(preset.name)}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {/* 즐겨찾기 */}
      {isDefaultFilter && favoritePresets.length > 0 ? (
        <section aria-label="즐겨찾기 포즈">
          <h4 className="mb-1.5 flex items-center gap-1 text-[0.68rem] font-bold text-fg-2">
            <Pin size={11} aria-hidden className="text-accent" /> 즐겨찾기
          </h4>
          <div className="grid grid-cols-2 gap-1.5 min-[420px]:grid-cols-3">
            {favoritePresets.map((preset) => (
              <PresetCard
                key={preset.id}
                preset={preset}
                pinned
                disabled={applyDisabled}
                onApply={handleApply}
                onTogglePin={handleTogglePin}
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* 전체 그리드 */}
      <section aria-label="포즈 프리셋 목록">
        <h4 className="mb-1.5 flex items-center gap-1 text-[0.68rem] font-bold text-fg-2">
          <Sparkles size={11} aria-hidden className="text-accent" />
          전체 프리셋
          <span className="font-semibold text-fg-3">({filtered.length}개)</span>
        </h4>
        {filtered.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line/60 bg-card/30 px-3 py-5 text-center text-[0.7rem] text-fg-3">
            조건에 맞는 포즈가 없습니다. 필터나 검색어를 바꿔 보세요.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-1.5 min-[420px]:grid-cols-3" role="group" aria-label="포즈 프리셋">
            {filtered.map((preset) => (
              <PresetCard
                key={preset.id}
                preset={preset}
                pinned={pinnedSet.has(preset.id)}
                disabled={applyDisabled}
                onApply={handleApply}
                onTogglePin={handleTogglePin}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
