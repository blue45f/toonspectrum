import { GitBranch, Plus, Spline, Trash2 } from "lucide-react";

import type { BubbleTailDirection, BubbleTailSide, BubbleTailSpec } from "./studio-bubble-path";

export interface StudioBubblePrimaryTailPatch {
  tail?: "left" | "right" | "none";
  tailDirection?: BubbleTailDirection;
  tailXRatio?: number;
  tailHeight?: number;
  tailBase?: number;
  tailBend?: number;
  tailAnchorId?: undefined;
  tailAnchorPoint?: undefined;
}

export interface StudioBubbleTailControlsProps {
  tail: "left" | "right" | "none";
  direction: BubbleTailDirection;
  ratio: number;
  length: number;
  base: number;
  bend: number;
  extraTails: readonly BubbleTailSpec[];
  anchored: boolean;
  allowMultiple?: boolean;
  onPatchPrimary: (patch: StudioBubblePrimaryTailPatch) => void;
  onChangeExtraTails: (tails: readonly BubbleTailSpec[]) => void;
}

const SEGMENT_CLASS =
  "inline-flex min-h-11 flex-1 items-center justify-center rounded-lg px-2 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function segmentClass(active: boolean): string {
  return `${SEGMENT_CLASS} ${
    active ? "bg-accent text-on-accent shadow-sm" : "text-fg-2 hover:bg-raised hover:text-fg"
  }`;
}

function bendLabel(value: number): string {
  const percent = Math.round(Math.abs(value) * 100);
  if (percent < 5) return "직선";
  return `${value < 0 ? "왼쪽" : "오른쪽"} ${percent}%`;
}

function RangeRow({
  label,
  value,
  min,
  max,
  step,
  valueLabel,
  disabled = false,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  valueLabel: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className={`block ${disabled ? "opacity-45" : ""}`}>
      <span className="flex items-center justify-between gap-3 text-xs text-fg-2">
        <span>{label}</span>
        <output className="min-w-16 text-right font-display text-[0.68rem] tabular-nums text-fg-3">
          {valueLabel}
        </output>
      </span>
      <span className="flex min-h-11 items-center">
        <input
          type="range"
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(Number(event.currentTarget.value))}
          className="h-2 w-full cursor-pointer accent-accent disabled:cursor-not-allowed"
        />
      </span>
    </label>
  );
}

function updateTail(
  tails: readonly BubbleTailSpec[],
  index: number,
  patch: Partial<BubbleTailSpec>
): BubbleTailSpec[] {
  return tails.map((tail, tailIndex) => (tailIndex === index ? { ...tail, ...patch } : { ...tail }));
}

export function StudioBubbleTailControls({
  tail,
  direction,
  ratio,
  length,
  base,
  bend,
  extraTails,
  anchored,
  allowMultiple = true,
  onPatchPrimary,
  onChangeExtraTails,
}: StudioBubbleTailControlsProps) {
  const visible = tail !== "none";

  return (
    <section aria-labelledby="bubble-tail-heading" className="mt-3 space-y-3 border-t border-line/50 pt-3">
      <div className="flex items-start gap-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
          <Spline size={15} aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 id="bubble-tail-heading" className="text-sm font-bold text-fg">꼬리 디자인</h3>
          <p className="mt-0.5 text-[0.68rem] leading-relaxed text-fg-3">
            화자를 가리키는 방향과 밑동 너비·곡률을 따로 조절합니다.
          </p>
        </div>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-xs font-semibold text-fg-2">화자 방향</legend>
        <div className="grid grid-cols-3 gap-1 rounded-xl border border-line bg-card p-1">
          {([
            { value: "left", label: "왼쪽 화자" },
            { value: "right", label: "오른쪽 화자" },
            { value: "none", label: "꼬리 없음" },
          ] as const).map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={tail === option.value}
              onClick={() =>
                onPatchPrimary({
                  tail: option.value,
                  ...(option.value === "none"
                    ? { tailAnchorId: undefined, tailAnchorPoint: undefined }
                    : {}),
                })
              }
              className={segmentClass(tail === option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>

      {visible ? (
        <>
          <fieldset>
            <legend className="mb-1.5 text-xs font-semibold text-fg-2">말풍선 부착면</legend>
            <div className="grid grid-cols-4 gap-1 rounded-xl border border-line bg-card p-1">
              {([
                { value: "top", label: "위" },
                { value: "bottom", label: "아래" },
                { value: "left", label: "왼쪽" },
                { value: "right", label: "오른쪽" },
              ] as const).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={direction === option.value}
                  disabled={anchored}
                  onClick={() => onPatchPrimary({ tailDirection: option.value })}
                  className={`${segmentClass(direction === option.value)} disabled:cursor-not-allowed disabled:opacity-45`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          {anchored ? (
            <p className="rounded-lg border border-cool/30 bg-cool/10 px-3 py-2 text-[0.68rem] leading-relaxed text-cool">
              자동 부착 중에는 면·위치·길이가 화자를 따라갑니다. 밑동 너비와 휘어짐은 계속 조절할 수 있어요.
            </p>
          ) : null}

          <div className="space-y-1 rounded-xl border border-line bg-card/35 p-3">
            <RangeRow
              label={direction === "left" || direction === "right" ? "부착 위치 · 세로" : "부착 위치 · 가로"}
              value={ratio}
              min={0.08}
              max={0.92}
              step={0.01}
              valueLabel={`${Math.round(ratio * 100)}%`}
              disabled={anchored}
              onChange={(value) => onPatchPrimary({ tailXRatio: value })}
            />
            <RangeRow
              label="꼬리 길이"
              value={length}
              min={8}
              max={120}
              step={1}
              valueLabel={`${Math.round(length)}px`}
              disabled={anchored}
              onChange={(value) => onPatchPrimary({ tailHeight: value })}
            />
            <RangeRow
              label="밑동 너비"
              value={base}
              min={6}
              max={120}
              step={1}
              valueLabel={`${Math.round(base)}px`}
              onChange={(value) => onPatchPrimary({ tailBase: value })}
            />
            <RangeRow
              label="꼬리 휘어짐"
              value={bend}
              min={-1}
              max={1}
              step={0.05}
              valueLabel={bendLabel(bend)}
              onChange={(value) => onPatchPrimary({ tailBend: value })}
            />
          </div>

          {allowMultiple ? (
            <div className="rounded-xl border border-line bg-card/25 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="flex items-center gap-1.5 text-xs font-bold text-fg">
                    <GitBranch size={13} aria-hidden /> 동시 대사 꼬리
                  </p>
                  <p className="mt-0.5 text-[0.65rem] text-fg-3">한 말풍선을 최대 세 화자에게 연결합니다.</p>
                </div>
                <button
                  type="button"
                  disabled={extraTails.length >= 2}
                  onClick={() =>
                    onChangeExtraTails([
                      ...extraTails,
                      {
                        direction: "bottom",
                        ratio: extraTails.length === 0 ? 0.7 : 0.5,
                        length: 26,
                        base: 18,
                        side: "center",
                        bend: 0,
                      },
                    ])
                  }
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg-2 hover:bg-raised hover:text-fg disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Plus size={14} aria-hidden /> 추가
                </button>
              </div>

            {extraTails.length === 0 ? (
              <p className="mt-2 rounded-lg border border-dashed border-line px-3 py-3 text-center text-[0.68rem] text-fg-3">
                합창·동시 대사라면 꼬리를 더해 보세요.
              </p>
            ) : (
              <div className="mt-2 space-y-2">
                {extraTails.map((extraTail, index) => (
                  <details key={index} className="group rounded-xl border border-line bg-panel/70">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-xs font-semibold text-fg marker:hidden">
                      <span className="grid size-6 place-items-center rounded-full bg-accent-soft font-display text-[0.65rem] text-accent">
                        {index + 2}
                      </span>
                      <span className="min-w-0 flex-1">추가 꼬리 {index + 1}</span>
                      <span className="text-[0.65rem] font-normal text-fg-3 group-open:hidden">펼치기</span>
                    </summary>
                    <div className="space-y-2 border-t border-line px-3 py-3">
                      <div className="flex min-h-11 items-center justify-between gap-3">
                        <p className="text-[0.68rem] leading-relaxed text-fg-3">
                          말풍선 외곽에서 별도 화자를 향하는 꼬리입니다.
                        </p>
                        <button
                          type="button"
                          aria-label={`추가 꼬리 ${index + 1} 제거`}
                          onClick={() =>
                            onChangeExtraTails(extraTails.filter((_, tailIndex) => tailIndex !== index))
                          }
                          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-fg-3 hover:bg-bad/10 hover:text-bad"
                        >
                          <Trash2 size={14} aria-hidden /> 제거
                        </button>
                      </div>
                      <fieldset>
                        <legend className="mb-1 text-[0.68rem] font-semibold text-fg-2">부착면</legend>
                        <div className="grid grid-cols-4 gap-1 rounded-lg bg-card p-1">
                          {(["top", "bottom", "left", "right"] as const).map((value) => (
                            <button
                              key={value}
                              type="button"
                              aria-pressed={extraTail.direction === value}
                              onClick={() => onChangeExtraTails(updateTail(extraTails, index, { direction: value }))}
                              className={segmentClass(extraTail.direction === value)}
                            >
                              {{ top: "위", bottom: "아래", left: "왼쪽", right: "오른쪽" }[value]}
                            </button>
                          ))}
                        </div>
                      </fieldset>
                      <fieldset>
                        <legend className="mb-1 text-[0.68rem] font-semibold text-fg-2">끝 기울기</legend>
                        <div className="grid grid-cols-3 gap-1 rounded-lg bg-card p-1">
                          {(["left", "center", "right"] as const).map((value: BubbleTailSide) => (
                            <button
                              key={value}
                              type="button"
                              aria-pressed={extraTail.side === value}
                              onClick={() => onChangeExtraTails(updateTail(extraTails, index, { side: value }))}
                              className={segmentClass(extraTail.side === value)}
                            >
                              {{ left: "왼쪽", center: "중앙", right: "오른쪽" }[value]}
                            </button>
                          ))}
                        </div>
                      </fieldset>
                      <RangeRow
                        label="부착 위치"
                        value={extraTail.ratio}
                        min={0.08}
                        max={0.92}
                        step={0.01}
                        valueLabel={`${Math.round(extraTail.ratio * 100)}%`}
                        onChange={(value) => onChangeExtraTails(updateTail(extraTails, index, { ratio: value }))}
                      />
                      <RangeRow
                        label="길이"
                        value={extraTail.length}
                        min={4}
                        max={160}
                        step={1}
                        valueLabel={`${Math.round(extraTail.length)}px`}
                        onChange={(value) => onChangeExtraTails(updateTail(extraTails, index, { length: value }))}
                      />
                      <RangeRow
                        label="밑동 너비"
                        value={extraTail.base}
                        min={4}
                        max={120}
                        step={1}
                        valueLabel={`${Math.round(extraTail.base)}px`}
                        onChange={(value) => onChangeExtraTails(updateTail(extraTails, index, { base: value }))}
                      />
                      <RangeRow
                        label="휘어짐"
                        value={extraTail.bend ?? 0}
                        min={-1}
                        max={1}
                        step={0.05}
                        valueLabel={bendLabel(extraTail.bend ?? 0)}
                        onChange={(value) => onChangeExtraTails(updateTail(extraTails, index, { bend: value }))}
                      />
                    </div>
                  </details>
                ))}
              </div>
            )}
            </div>
          ) : (
            <p className="rounded-lg border border-line bg-card/35 px-3 py-2 text-[0.68rem] leading-relaxed text-fg-3">
              이어 말하기는 한 화자의 긴 대사를 위한 형태라 주 꼬리 하나만 사용합니다.
            </p>
          )}
        </>
      ) : null}
    </section>
  );
}
