import { AlertTriangle, ArrowLeft, Loader2, Sparkles, UserRound, WandSparkles, X } from "lucide-react";
import { useEffect, useState } from "react";

import { StudioVrmPoser } from "./StudioVrmPoser";
import { listVrmLibraryEntries, type VrmLibraryEntry } from "./vrm-library";

/**
 * "VRM 캐릭터 만들기" — 얇은 오케스트레이션 컴포넌트.
 *
 * 자체 3D 씬을 갖지 않는다: 1단계(베이스 캐릭터 고르기)만 이 파일이 그리고, 2단계(커스터마이즈:
 * 실장착 의상·부위별 채색·재질효과·체형 스케일)는 기존 StudioVrmPoser를 그대로 위임 호출한다.
 * StudioVrmPoser는 이 세션의 계약상 수정 대상이 아니므로(하드 제약), 새 props(mode/initialModelId)를
 * 추가하지 않고 **기존에 이미 살아 있는 initialDataUrl 해시 복원 경로**만으로 베이스 캐릭터를
 * 선반영한다 — StudioVrmPoser는 `initialDataUrl`의 `#` 뒤 JSON을 파싱해 `modelId`가 있으면
 * 그 즉시 `setActiveModelId(...)`를 호출하므로(파일 내부 로직, 수정 없이 그대로 활용), 실제 PNG
 * 캡처 데이터 없이 `#{"modelId":"..."}` 형태의 최소 해시만 넘겨도 동일하게 동작한다.
 *
 * 재사용률: 3D 렌더링/캡처/워드로브/채색/재질효과/체형 스케일 로직 100% 기존 StudioVrmPoser 위임.
 * 이 파일의 신규 로직은 "1단계 선택 그리드"와 그 위에 얹는 얇은 상태 오케스트레이션뿐이다.
 */

export type StudioVrmCreatorProps = {
  open: boolean;
  /**
   * 이미 저장된 "내 캐릭터"(PNG 해시에 modelId/customColors/materialFx/wardrobe/bodyScale 등이
   * 실려 있음)를 다시 다듬고 싶을 때 그 데이터URL을 그대로 전달하면 1단계(고르기)를 건너뛰고
   * 바로 2단계(커스터마이즈)로 진입한다. 생략하면 항상 1단계부터 새로 시작한다.
   */
  initialDataUrl?: string;
  onClose: () => void;
  onInsert: (pngDataUrl: string, width: number, height: number) => void;
};

type CreatorStep = "pick" | "customize";
type LibraryStatus = "loading" | "ready" | "error";

const CONTROL_BUTTON =
  "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45";
const ICON_BUTTON =
  "inline-grid size-9 place-items-center rounded-lg border border-line bg-card text-fg-3 transition-colors hover:bg-accent-soft hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/** StudioVrmPoser의 initialDataUrl 해시 복원 경로가 읽는 최소 payload — modelId만 실어 베이스 캐릭터를 선반영한다. */
function encodeBaseModelHash(modelId: string): string {
  return `#${encodeURIComponent(JSON.stringify({ modelId }))}`;
}

export function StudioVrmCreator({ open, initialDataUrl, onClose, onInsert }: StudioVrmCreatorProps) {
  const [step, setStep] = useState<CreatorStep>(initialDataUrl ? "customize" : "pick");
  const [pickedModelId, setPickedModelId] = useState<string | undefined>(undefined);
  const [libraryEntries, setLibraryEntries] = useState<VrmLibraryEntry[]>([]);
  const [libraryStatus, setLibraryStatus] = useState<LibraryStatus>("loading");
  const [libraryError, setLibraryError] = useState<string | null>(null);

  // 모달이 (다시) 열릴 때마다 진입 상태를 리셋한다 — 재편집용 initialDataUrl이 있으면 바로 커스터마이즈로,
  // 없으면 항상 고르기부터. (호출부가 매번 새로 마운트하는 패턴이라도, open 토글만으로 재사용될 경우도 방어.)
  useEffect(() => {
    if (!open) return;
    setStep(initialDataUrl ? "customize" : "pick");
    setPickedModelId(undefined);
  }, [open, initialDataUrl]);

  useEffect(() => {
    if (!open || step !== "pick") return;
    let cancelled = false;
    setLibraryStatus("loading");
    setLibraryError(null);
    listVrmLibraryEntries()
      .then((entries) => {
        if (cancelled) return;
        setLibraryEntries(entries);
        setLibraryStatus("ready");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        console.error("Failed to list VRM library entries", e);
        setLibraryError("캐릭터 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
        setLibraryStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [open, step]);

  // 고르기 단계 전용 단축키: Esc로 도구 전체 닫기. 커스터마이즈 단계(=StudioVrmPoser)는 자체 키보드
  // 핸들러를 이미 갖고 있으므로 여기서 추가로 가로채지 않는다.
  useEffect(() => {
    if (!open || step !== "pick") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, step, onClose]);

  function pickAndCustomize(entry: VrmLibraryEntry) {
    setPickedModelId(entry.id);
    setStep("customize");
  }

  if (!open) return null;

  if (step === "customize") {
    const resolvedInitialDataUrl = initialDataUrl ?? (pickedModelId ? encodeBaseModelHash(pickedModelId) : undefined);
    const canGoBack = !initialDataUrl; // 저장된 캐릭터 재편집 진입 시엔 되돌아갈 "고르기" 단계가 없다.
    return (
      <>
        <StudioVrmPoser open={open} initialDataUrl={resolvedInitialDataUrl} onClose={onClose} onInsert={onInsert} />
        {canGoBack ? (
          <div
            className="fixed left-2 top-2 z-[85] sm:left-4 sm:top-4"
            style={{
              marginTop: "env(safe-area-inset-top)",
              marginLeft: "env(safe-area-inset-left)",
            }}
          >
            <button
              type="button"
              aria-label="다른 캐릭터로 새로 시작하기"
              title="다른 캐릭터로 새로 시작하기"
              className={cx(ICON_BUTTON, "bg-panel/95 shadow-[0_6px_20px_oklch(0.05_0.01_70/0.35)] backdrop-blur")}
              onClick={() => {
                setPickedModelId(undefined);
                setStep("pick");
              }}
            >
              <ArrowLeft size={16} aria-hidden />
            </button>
          </div>
        ) : null}
      </>
    );
  }

  // step === "pick"
  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-[80] bg-[oklch(0.08_0.01_70/0.82)] p-2 text-fg backdrop-blur-sm sm:p-4"
      role="dialog"
      style={{
        paddingTop: "max(0.5rem, env(safe-area-inset-top))",
        paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))",
      }}
    >
      <div className="mx-auto flex h-full max-h-full max-w-[1040px] flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_24px_80px_oklch(0.05_0.01_70/0.55)]">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <p className="eyebrow flex items-center gap-1.5 text-accent">
              <UserRound size={14} aria-hidden />
              캐릭터 만들기
            </p>
            <h2 className="mt-1 truncate text-lg font-bold tracking-tight text-fg sm:text-xl">내 캐릭터 만들기</h2>
            <p className="mt-1 text-xs leading-relaxed text-fg-3">
              무료 3D 캐릭터 중 하나를 베이스로 골라주세요. 색상·의상·체형은 다음 단계에서 자유롭게 바꿀 수 있어요.
            </p>
          </div>
          <button type="button" aria-label="닫기" title="닫기 (Esc)" className={ICON_BUTTON} onClick={onClose}>
            <X size={17} aria-hidden />
          </button>
        </header>

        <p className="shrink-0 border-b border-line bg-card/60 px-4 py-2 text-[0.7rem] leading-relaxed text-fg-3 sm:px-5">
          ※ 얼굴·헤어 형태 자체는 바꿀 수 없어요 — 베이스 캐릭터의 이목구비·헤어스타일은 그대로 유지돼요.
        </p>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {libraryStatus === "error" && libraryError ? (
            <p className="mb-3 flex items-start gap-2 rounded-xl border border-line bg-card/70 px-3 py-2 text-xs leading-relaxed text-fg-3">
              <AlertTriangle className="mt-0.5 shrink-0 text-accent" size={14} aria-hidden />
              {libraryError}
            </p>
          ) : null}

          {libraryStatus === "loading" ? (
            <div className="grid place-items-center py-16 text-center">
              <Loader2 className="mx-auto animate-spin text-accent" size={28} aria-hidden />
              <p className="mt-3 text-sm font-semibold text-fg">베이스 캐릭터를 불러오는 중입니다.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {libraryEntries.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className={cx(
                    "grid min-h-[7.5rem] grid-rows-[5rem_auto] gap-2 rounded-xl border border-line bg-card px-2.5 py-2.5 text-left transition-colors hover:border-accent/50 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  )}
                  onClick={() => pickAndCustomize(entry)}
                >
                  <span className="grid place-items-center overflow-hidden rounded-lg border border-line/80 bg-panel">
                    {entry.thumbnail ? (
                      <img alt="" className="h-full w-full object-contain" src={entry.thumbnail} />
                    ) : (
                      <span className="grid size-9 place-items-center rounded-lg border border-line bg-card text-fg-3">
                        {entry.source === "sample" ? <WandSparkles size={17} aria-hidden /> : <UserRound size={17} aria-hidden />}
                      </span>
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-bold text-fg">{entry.name}</span>
                    <span className="mt-0.5 inline-flex rounded-full bg-raised px-1.5 py-0.5 text-[0.68rem] font-bold text-fg-3">
                      {entry.source === "sample" ? "번들" : "업로드"}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-line px-4 py-3 sm:px-5">
          <span className="inline-flex items-center gap-1.5 text-[0.7rem] text-fg-3">
            <Sparkles size={13} className="text-accent" aria-hidden />
            캐릭터를 고르면 바로 다음 단계로 이동해요.
          </span>
          <button type="button" className={cx(CONTROL_BUTTON, "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg")} onClick={onClose}>
            닫기
          </button>
        </footer>
      </div>
    </div>
  );
}
