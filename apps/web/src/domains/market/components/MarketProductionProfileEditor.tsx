import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { useId } from "react";

import {
  MARKET_PRODUCTION_PROFILE_MAX_STUDIO_VERSION_CHARACTERS,
  MARKET_PRODUCTION_PROFILE_PRESETS,
  isMarketProductionStudioVersionValid,
  marketProductionEngineLabel,
} from "../models/market-production-fit";

import type {
  MarketProductionProfile,
  MarketProductionProfileAiPolicy,
  MarketProductionProfileDeliveryPolicy,
  MarketProductionProfileEngine,
  MarketProductionProfileProvenancePolicy,
  MarketProductionProfileUsage,
} from "../models/market-production-fit";

import { cn } from "@/shared/lib/utils";

interface MarketProductionProfileEditorProps {
  readonly profile: MarketProductionProfile;
  readonly onChange: (
    patch: Partial<Omit<MarketProductionProfile, "version">>,
  ) => void;
  readonly onReset: () => void;
  readonly persistenceAvailable?: boolean;
  readonly className?: string;
}

const CONTROL_CLASS =
  "mt-1.5 h-10 w-full rounded-lg border border-line bg-card px-3 text-sm text-fg outline-none transition-colors duration-150 focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/70 pointer-coarse:h-11";

export function MarketProductionProfileEditor({
  profile,
  onChange,
  onReset,
  persistenceAvailable = true,
  className,
}: MarketProductionProfileEditorProps) {
  const titleId = useId();
  const versionHelpId = useId();
  const versionInvalid = !isMarketProductionStudioVersionValid(profile.studioVersion);

  return (
    <section
      aria-labelledby={titleId}
      className={cn("rounded-2xl border border-line bg-panel p-4 shadow-sm sm:p-5", className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow text-accent">Production profile</p>
          <h2
            id={titleId}
            className="mt-1 flex items-center gap-2 text-lg font-bold text-fg"
          >
            <SlidersHorizontal className="size-5 text-accent" aria-hidden="true" />
            내 제작 조건
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-fg-3">
            실제 서버 manifest의 Studio 버전, 렌더러, 사용권, AI 공개, 출처와 전달
            방식만 대조합니다. 평점이나 판매량을 호환성 근거로 사용하지 않습니다.
          </p>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg-2 transition-colors duration-150 hover:border-line-strong hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 pointer-coarse:min-h-11"
        >
          <RotateCcw className="size-3.5" aria-hidden="true" />
          기본값
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="제작 조건 프리셋">
        {MARKET_PRODUCTION_PROFILE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            title={preset.description}
            onClick={() => onChange(preset.patch)}
            className="inline-flex min-h-9 items-center rounded-full border border-line bg-card px-3 text-xs font-semibold text-fg-2 transition-colors duration-150 hover:border-accent/60 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 pointer-coarse:min-h-11"
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <label className="text-xs font-semibold text-fg-2">
          현재 Studio 버전
          <input
            type="text"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            value={profile.studioVersion}
            onChange={(event) => onChange({ studioVersion: event.target.value })}
            maxLength={MARKET_PRODUCTION_PROFILE_MAX_STUDIO_VERSION_CHARACTERS}
            placeholder="예: 1.4.0"
            aria-invalid={versionInvalid || undefined}
            aria-label="현재 Studio 버전"
            aria-describedby={versionHelpId}
            className={cn(
              CONTROL_CLASS,
              versionInvalid && "border-danger focus:border-danger focus-visible:ring-danger/40",
            )}
          />
          <span
            id={versionHelpId}
            className={cn(
              "mt-1.5 block text-[0.68rem] font-normal leading-relaxed",
              versionInvalid ? "text-danger" : "text-fg-3",
            )}
          >
            {versionInvalid
              ? "SemVer 1.2.3 또는 1.2.3-rc.1 형태로 입력해 주세요."
              : profile.studioVersion
                ? "입력한 버전과 리소스의 최소 버전을 SemVer로 비교합니다."
                : "비워 두면 호환으로 추정하지 않고 ‘확인 필요’로 표시합니다."}
          </span>
        </label>

        <label className="text-xs font-semibold text-fg-2">
          필요한 렌더러
          <select
            value={profile.engine}
            onChange={(event) => onChange({
              engine: event.target.value as MarketProductionProfileEngine,
            })}
            className={CONTROL_CLASS}
          >
            {(["any", "canvas2d", "webgl2", "webgpu", "three"] as const).map((engine) => (
              <option key={engine} value={engine}>
                {marketProductionEngineLabel(engine)}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs font-semibold text-fg-2">
          작품 이용 범위
          <select
            value={profile.usage}
            onChange={(event) => onChange({
              usage: event.target.value as MarketProductionProfileUsage,
            })}
            className={CONTROL_CLASS}
          >
            <option value="commercial">상업 연재·출판</option>
            <option value="noncommercial">비상업 검토·연습</option>
          </select>
        </label>

        <label className="text-xs font-semibold text-fg-2">
          AI 포함 리소스
          <select
            value={profile.aiPolicy}
            onChange={(event) => onChange({
              aiPolicy: event.target.value as MarketProductionProfileAiPolicy,
            })}
            className={CONTROL_CLASS}
          >
            <option value="review">적용 전 확인</option>
            <option value="exclude">제외</option>
            <option value="allow">허용</option>
          </select>
        </label>

        <label className="text-xs font-semibold text-fg-2">
          출처 정책
          <select
            value={profile.provenancePolicy}
            onChange={(event) => onChange({
              provenancePolicy: event.target.value as MarketProductionProfileProvenancePolicy,
            })}
            className={CONTROL_CLASS}
          >
            <option value="any">원본·퍼미시브 출처 허용</option>
            <option value="original-only">배급자 원본만</option>
          </select>
        </label>

        <label className="text-xs font-semibold text-fg-2">
          전달 정책
          <select
            value={profile.deliveryPolicy}
            onChange={(event) => onChange({
              deliveryPolicy: event.target.value as MarketProductionProfileDeliveryPolicy,
            })}
            className={CONTROL_CLASS}
          >
            <option value="any">manifest 전달 방식 허용</option>
            <option value="self-contained">독립 portable 패키지만</option>
          </select>
        </label>
      </div>

      <label className="mt-4 flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-line bg-card px-3 py-2.5 text-xs text-fg-2">
        <input
          type="checkbox"
          checked={profile.attributionSupported}
          onChange={(event) => onChange({ attributionSupported: event.target.checked })}
          className="mt-0.5 size-4 accent-accent"
        />
        <span>
          <span className="block font-semibold text-fg">작품 크레딧에 저작자 표시를 보존할 수 있음</span>
          <span className="mt-0.5 block leading-relaxed text-fg-3">
            CC BY 계열처럼 표시가 필수인 리소스는 이 항목이 꺼져 있으면 차단합니다.
          </span>
        </span>
      </label>

      <p
        role="status"
        className={cn(
          "mt-3 text-[0.68rem] leading-relaxed",
          persistenceAvailable ? "text-fg-3" : "text-warn",
        )}
      >
        {persistenceAvailable
          ? "이 조건은 현재 브라우저에만 저장되며 결제, 획득, 설치 또는 원고를 변경하지 않습니다."
          : "브라우저 저장소를 사용할 수 없어 이 탭을 닫으면 조건이 초기화될 수 있습니다."}
      </p>
    </section>
  );
}
