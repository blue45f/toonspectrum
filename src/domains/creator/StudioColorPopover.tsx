// 재사용 색상 선택기 — 스와치 트리거 + 팝오버(네이티브 컬러/헥스 입력, 스포이드,
// 최근 색, 큐레이션 팔레트 탭). 로컬 UI 상태(열림/선택 팔레트)만 가지는 표시 컴포넌트.
// 브라우저 앱 안에서만 도는 컴포넌트라 document/window 직접 접근 OK(테스트 대상 아님).
import { Pipette, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  isValidHexColor,
  normalizeHexColor,
  STUDIO_PALETTES,
  type StudioPalette,
} from "./studio-color-palettes";

import { cn } from "@/lib/utils";


// EyeDropper는 일부 브라우저에만 있는 실험적 API — 타입 정의가 없어 좁은 형태만 선언한다.
type EyeDropperResult = { sRGBHex: string };
type EyeDropperLike = { open: () => Promise<EyeDropperResult> };
type EyeDropperCtor = new () => EyeDropperLike;

function getEyeDropperCtor(): EyeDropperCtor | null {
  if (typeof window === "undefined") return null;
  const ctor = (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper;
  return typeof ctor === "function" ? ctor : null;
}

export function StudioColorPopover({
  value,
  onChange,
  recentColors,
  onUseColor,
  title,
  className,
}: {
  value: string;
  onChange: (color: string) => void;
  recentColors: string[];
  onUseColor?: (color: string) => void;
  title?: string;
  className?: string;
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  // 트리거가 화면 우측/하단에 가까우면 팝오버를 안쪽으로 펼쳐 뷰포트 밖 잘림을 막는다.
  const [alignRight, setAlignRight] = useState(false);
  const [dropUp, setDropUp] = useState(false);
  // 팔레트 탭 — 기본은 첫 팔레트, 선택 id로 어떤 팔레트의 색을 보여줄지 제어.
  const [paletteId, setPaletteId] = useState<string>(STUDIO_PALETTES[0]?.id ?? "");
  // 헥스 텍스트 입력 로컬값 — 타이핑 중간 무효 상태를 허용하고 확정 시에만 반영.
  const [hexDraft, setHexDraft] = useState(value);
  const rootRef = useRef<HTMLDivElement>(null);

  // 외부 value가 바뀌면 헥스 입력 표시도 동기화(부모가 다른 경로로 색을 바꾼 경우).
  useEffect(() => {
    setHexDraft(value);
  }, [value]);

  // 팝오버 열릴 때 트리거 위치를 재서 좌/우·상/하 펼침 방향을 정한다(화면 가장자리 잘림 방지).
  useEffect(() => {
    if (!open) return;
    const node = rootRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    setAlignRight(rect.left > window.innerWidth / 2);
    // 팝오버 예상 높이(~340px)가 아래로 넘치고 위에 공간이 있으면 위로 펼친다.
    setDropUp(rect.bottom + 340 > window.innerHeight && rect.top > 340);
  }, [open]);

  // 팝오버 열림 동안 바깥 mousedown이면 닫는다. 닫힐 때 리스너 정리.
  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  // 색 확정 공통 경로 — 정규화 후 부모로 알리고 최근 색 기록 갱신. 비교용으로 팝오버는 닫지 않는다.
  const handleSelect = (raw: string): void => {
    const c = normalizeHexColor(raw) ?? raw;
    onChange(c);
    onUseColor?.(c);
  };

  const activePalette: StudioPalette =
    STUDIO_PALETTES.find((p) => p.id === paletteId) ?? STUDIO_PALETTES[0]!;

  const eyeDropperCtor = getEyeDropperCtor();

  return (
    <div ref={rootRef} className={cn("relative inline-block", className)}>
      {/* 트리거 — 현재 색 스와치 */}
      <button
        type="button"
        aria-label={title ?? "색상 선택"}
        aria-expanded={open}
        title={title ?? "색상 선택"}
        onClick={() => setOpen((v) => !v)}
        className="h-7 w-7 rounded border border-line cursor-pointer"
        style={{ background: value }}
      />

      {open && (
        <div
          className={cn(
            "absolute z-50 w-60 max-h-[min(70vh,24rem)] overflow-auto rounded-lg border border-line bg-card p-3 shadow-lg",
            alignRight ? "right-0" : "left-0",
            dropUp ? "bottom-full mb-1.5" : "top-full mt-1.5"
          )}
        >
          {/* 헤더 + 닫기 */}
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[0.66rem] font-semibold uppercase tracking-wider text-fg-3">색상 선택</span>
            <button
              type="button"
              aria-label="닫기"
              title="닫기"
              onClick={() => setOpen(false)}
              className="rounded p-0.5 text-fg-3 hover:bg-raised hover:text-fg"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>

          {/* 네이티브 컬러 + 헥스 텍스트 + 스포이드 */}
          <div className="flex items-center gap-1.5">
            <input
              type="color"
              value={isValidHexColor(value) ? value : "#000000"}
              onChange={(e) => handleSelect(e.target.value)}
              aria-label="색상 휠"
              className="h-7 w-9 shrink-0 cursor-pointer rounded border border-line bg-transparent p-0"
            />
            <input
              type="text"
              value={hexDraft}
              spellCheck={false}
              aria-label="헥스 색상 코드"
              placeholder="#rrggbb"
              onChange={(e) => {
                const next = e.target.value;
                setHexDraft(next);
                const norm = normalizeHexColor(next);
                if (norm) handleSelect(norm);
              }}
              onBlur={(e) => {
                const norm = normalizeHexColor(e.target.value);
                if (norm) handleSelect(norm);
                else setHexDraft(value);
              }}
              className="h-7 min-w-0 flex-1 rounded border border-line bg-card px-2 text-xs tabular-nums text-fg-2 focus:outline-none focus:ring-1 focus:ring-accent"
            />
            {eyeDropperCtor && (
              <button
                type="button"
                aria-label="스포이드"
                title="스포이드"
                onClick={() => {
                  const ed = new eyeDropperCtor();
                  ed.open()
                    .then((r) => handleSelect(r.sRGBHex))
                    .catch(() => {});
                }}
                className="grid h-7 w-7 shrink-0 place-items-center rounded border border-line text-fg-2 hover:bg-raised hover:text-fg"
              >
                <Pipette className="size-3.5" aria-hidden />
              </button>
            )}
          </div>

          {/* 최근 사용 색 */}
          {recentColors.length > 0 && (
            <div className="mt-2.5">
              <p className="mb-1 text-[0.6rem] font-medium uppercase tracking-wider text-fg-3">최근</p>
              <div className="flex flex-wrap gap-1">
                {recentColors.map((c, i) => (
                  <button
                    key={`${c}-${i}`}
                    type="button"
                    title={c}
                    onClick={() => handleSelect(c)}
                    className="h-5 w-5 rounded border border-line cursor-pointer"
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* 팔레트 탭 + 선택 팔레트 색 그리드 */}
          <div className="mt-2.5">
            <div className="mb-1.5 flex flex-wrap gap-1">
              {STUDIO_PALETTES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  title={p.tip}
                  onClick={() => setPaletteId(p.id)}
                  aria-pressed={p.id === activePalette.id}
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[0.66rem] border transition-colors",
                    p.id === activePalette.id
                      ? "bg-accent-soft border-accent/60 text-accent"
                      : "bg-card border-line text-fg-3 hover:bg-raised hover:text-fg-2"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1">
              {activePalette.colors.map((c) => (
                <button
                  key={c}
                  type="button"
                  title={c}
                  onClick={() => handleSelect(c)}
                  className="h-5 w-5 rounded border border-line cursor-pointer"
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
