/**
 * Studio Tone Panel
 * 만화 스크린톤 피커 — TONE_PRESETS를 카테고리(망점/선/그라데이션/교차선)별로 묶어
 * 흰 바탕에 검은 패턴이 보이는 56px 스와치 그리드로 깐다. 클릭하면 onPick으로 톤 SVG를 캔버스에 넘긴다.
 * StudioPage에서 분리한 순수 프레젠테이션 컴포넌트(상태 없음, props만 읽는다).
 * 검색어 필터는 상위에서 제어 — query로 라벨을 거르고, 결과 없는 카테고리는 헤더째 생략한다.
 */
import { cn } from "@/lib/utils";

import {
  TONE_PRESETS,
  toneCategoryLabel,
  toneDataUrl,
  type ToneCategory,
  type TonePreset,
} from "./studio-tones";

// 카테고리 표시 순서 고정 — 옅은 망점부터 선·그라데이션·교차선 순으로 읽힌다.
const CATEGORY_ORDER: ToneCategory[] = ["dot", "line", "gradient", "crosshatch"];

// 그룹 헤더 — 인스펙터 다른 패널과 같은 소제목 토큰.
const GROUP_HEADING = "text-[0.66rem] font-semibold text-fg-3 uppercase tracking-wider";

// 스와치 버튼 — 56px 정사각. 톤 패턴 자체가 미리보기라 테두리/호버만 토큰으로 입힌다.
const SWATCH_CLASS =
  "size-14 shrink-0 rounded-md border border-line bg-card transition-colors hover:bg-raised";

export function StudioTonePanel({
  onPick,
  query,
}: {
  onPick: (svg: string, label: string) => void;
  query?: string;
}): React.ReactElement {
  // 검색어 정규화 — 공백 제거 + 소문자. 비어 있으면 전체 통과.
  const needle = (query ?? "").trim().toLowerCase();

  return (
    <div className="space-y-3">
      {CATEGORY_ORDER.map((category) => {
        // 카테고리별 프리셋을 query(라벨 부분일치, 대소문자 무시)로 거른다.
        const presets = TONE_PRESETS.filter(
          (preset) => preset.category === category && (needle === "" || preset.label.toLowerCase().includes(needle))
        );
        // 매치가 하나도 없으면 헤더까지 통째로 생략한다.
        if (presets.length === 0) return null;

        return (
          <section key={category} className="space-y-1.5">
            <p className={GROUP_HEADING}>{toneCategoryLabel(category)}</p>
            <div className="flex flex-wrap gap-2">
              {presets.map((preset: TonePreset) => (
                // 한 스와치 = 버튼 + 그 아래 라벨 캡션. 묶어서 같이 줄바꿈돼 라벨이 항상 제 톤 밑에 붙는다.
                <div key={preset.id} className="flex w-14 shrink-0 flex-col items-center gap-1">
                  <button
                    type="button"
                    title={preset.tip}
                    aria-label={preset.label}
                    onClick={() => onPick(preset.svg, preset.label)}
                    // 흰 배경 + 톤 패턴 이미지 — 검은 망점이 흰 면 위에 보이게 깐다(cover로 타일 채움).
                    style={{
                      backgroundColor: "#fff",
                      backgroundImage: `url("${toneDataUrl(preset.svg)}")`,
                      backgroundSize: "cover",
                    }}
                    className={cn(SWATCH_CLASS)}
                  />
                  <span className="text-center text-[10px] leading-tight text-fg-2">{preset.label}</span>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
