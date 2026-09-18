import {
  BookMarked,
  Check,
  LoaderCircle,
  Save,
  Trash2,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";

import { STUDIO_EASE, STUDIO_FOCUS_RING } from "../studio-panel-ui";
import {
  normalizeStudioDrawingInputSnapshot,
  type StudioDrawingInputSnapshot,
} from "./studio-drawing-input-deck-model";
import {
  acquireProductStudioDrawingInputProfileLibrary,
  normalizeStudioDrawingInputProfileName,
  STUDIO_DRAWING_INPUT_CUSTOM_PROFILE_LIMIT,
  type StudioDrawingInputCustomProfile,
} from "./studio-drawing-input-profile-library";

import type { StudioDrawingInputDeckProps } from "./StudioDrawingInputDeck";

import { cn } from "@/shared/lib/utils";

export interface StudioDrawingInputProfileLibraryPanelProps
  extends StudioDrawingInputDeckProps {
  readonly onClose: () => void;
}

function snapshotMatches(
  left: StudioDrawingInputSnapshot,
  right: StudioDrawingInputSnapshot,
): boolean {
  return left.stabilizer === right.stabilizer
    && left.stabilizerMode === right.stabilizerMode
    && left.postCorrection === right.postCorrection
    && left.pressureCurveId === right.pressureCurveId
    && left.stampMinSize === right.stampMinSize;
}

function modeLabel(mode: StudioDrawingInputSnapshot["stabilizerMode"]): string {
  if (mode === "precision") return "정밀";
  if (mode === "adaptive") return "적응";
  return "표준";
}

export function StudioDrawingInputProfileLibraryPanel({
  mobile,
  dockInsets,
  stabilizer,
  stabilizerMode,
  postCorrection,
  pressureCurveId,
  stampTuning,
  onStabilizerChange,
  onStabilizerModeChange,
  onPostCorrectionChange,
  onPressureCurveChange,
  onStampTuningChange,
  onClose,
}: StudioDrawingInputProfileLibraryPanelProps): ReactElement {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [profiles, setProfiles] = useState<readonly StudioDrawingInputCustomProfile[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(true);
  const [notice, setNotice] = useState("이 기기의 SQLite/OPFS에서 내 입력 프로필을 불러오는 중…");
  const right = mobile ? 12 : Math.max(12, dockInsets.right + 12);

  const currentSnapshot = useMemo(
    () => normalizeStudioDrawingInputSnapshot({
      stabilizer,
      stabilizerMode,
      postCorrection,
      pressureCurveId,
      stampMinSize: stampTuning?.minSize ?? null,
    }),
    [postCorrection, pressureCurveId, stabilizer, stabilizerMode, stampTuning?.minSize],
  );

  const applySnapshot = useCallback((next: StudioDrawingInputSnapshot): void => {
    if (next.stabilizer !== currentSnapshot.stabilizer) onStabilizerChange(next.stabilizer);
    if (next.stabilizerMode !== currentSnapshot.stabilizerMode) {
      onStabilizerModeChange(next.stabilizerMode);
    }
    if (next.postCorrection !== currentSnapshot.postCorrection) {
      onPostCorrectionChange(next.postCorrection);
    }
    if (next.pressureCurveId !== currentSnapshot.pressureCurveId) {
      onPressureCurveChange(next.pressureCurveId);
    }
    if (
      stampTuning
      && next.stampMinSize !== null
      && next.stampMinSize !== currentSnapshot.stampMinSize
    ) {
      onStampTuningChange({ ...stampTuning, minSize: next.stampMinSize });
    }
  }, [
    currentSnapshot,
    onPostCorrectionChange,
    onPressureCurveChange,
    onStabilizerChange,
    onStabilizerModeChange,
    onStampTuningChange,
    stampTuning,
  ]);

  const reload = useCallback(async (): Promise<void> => {
    setBusy(true);
    try {
      const repository = await acquireProductStudioDrawingInputProfileLibrary();
      const snapshot = await repository.load();
      setProfiles(snapshot.profiles);
      setNotice(
        snapshot.malformed
          ? "손상된 프로필 저장값은 사용하지 않고 안전한 빈 라이브러리로 열었습니다."
          : snapshot.profiles.length > 0
            ? `내 입력 프로필 ${snapshot.profiles.length}개를 불러왔습니다.`
            : "현재 입력감을 이름 붙여 저장하면 다른 문서에서도 바로 다시 쓸 수 있습니다.",
      );
    } catch (cause) {
      setNotice(
        `입력 프로필 저장소를 열지 못했습니다. 현재 작업 설정은 그대로 유지됩니다: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    closeButtonRef.current?.focus();
    void reload();
  }, [reload]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const saveCurrent = useCallback(async (): Promise<void> => {
    const normalizedName = normalizeStudioDrawingInputProfileName(name);
    if (!normalizedName) {
      setNotice("프로필 이름을 입력해 주세요.");
      return;
    }
    setBusy(true);
    try {
      const repository = await acquireProductStudioDrawingInputProfileLibrary();
      const existing = profiles.find(
        (profile) => profile.name.localeCompare(normalizedName, undefined, { sensitivity: "accent" }) === 0,
      );
      const result = await repository.saveProfile({
        id: existing?.id,
        name: normalizedName,
        snapshot: currentSnapshot,
      });
      setProfiles(result.profiles);
      setName("");
      setNotice(
        existing
          ? `${normalizedName} 프로필을 현재 입력감으로 갱신했습니다.`
          : `${normalizedName} 프로필을 이 기기에 저장했습니다.`,
      );
    } catch (cause) {
      setNotice(
        `입력 프로필을 저장하지 못했습니다. 현재 입력감은 바뀌지 않았습니다: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    } finally {
      setBusy(false);
    }
  }, [currentSnapshot, name, profiles]);

  const removeProfile = useCallback(async (profile: StudioDrawingInputCustomProfile): Promise<void> => {
    setBusy(true);
    try {
      const repository = await acquireProductStudioDrawingInputProfileLibrary();
      const result = await repository.deleteProfile(profile.id);
      setProfiles(result.profiles);
      setNotice(`${profile.name} 프로필을 삭제했습니다.`);
    } catch (cause) {
      setNotice(
        `프로필을 삭제하지 못했습니다: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <aside
      id="studio-drawing-input-profile-library"
      aria-labelledby="studio-drawing-input-profile-library-title"
      className="fixed bottom-[calc(8rem+env(safe-area-inset-bottom))] z-[73] flex max-h-[min(34rem,calc(100vh-9rem))] w-[min(23rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-line-strong bg-card/[0.98] shadow-[0_24px_70px_oklch(0.06_0.01_70/0.48)] backdrop-blur-2xl"
      style={{ right }}
    >
      <header className="flex shrink-0 items-start gap-2.5 border-b border-line/70 px-3 py-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent ring-1 ring-accent/15">
          <BookMarked size={17} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="studio-drawing-input-profile-library-title" className="text-sm font-extrabold text-fg">
            내 입력 프로필
          </h2>
          <p className="mt-0.5 text-[0.6rem] leading-relaxed text-fg-3">
            브러시 자체가 아니라 안정화·후처리·필압 응답만 기기에 저장합니다.
          </p>
        </div>
        <button
          ref={closeButtonRef}
          type="button"
          aria-label="내 입력 프로필 닫기"
          onClick={onClose}
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-lg border border-line text-fg-3 hover:bg-raised hover:text-fg",
            STUDIO_EASE,
            STUDIO_FOCUS_RING,
          )}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 overscroll-contain">
        <section className="rounded-xl border border-line/70 bg-bg-2/45 p-2.5">
          <div className="flex flex-wrap gap-1 text-[0.54rem] font-semibold text-fg-3">
            <span className="rounded bg-card px-1.5 py-1">{modeLabel(currentSnapshot.stabilizerMode)} {currentSnapshot.stabilizer}</span>
            <span className="rounded bg-card px-1.5 py-1">후처리 {currentSnapshot.postCorrection}</span>
            <span className="rounded bg-card px-1.5 py-1">필압 {currentSnapshot.pressureCurveId}</span>
            <span className="rounded bg-card px-1.5 py-1">최소 {currentSnapshot.stampMinSize == null ? "—" : `${Math.round(currentSnapshot.stampMinSize * 100)}%`}</span>
          </div>
          <div className="mt-2 flex gap-1.5">
            <input
              value={name}
              maxLength={40}
              onChange={(event) => setName(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void saveCurrent();
                }
              }}
              placeholder="예: 액정 태블릿 선화"
              aria-label="새 입력 프로필 이름"
              className={cn(
                "min-h-10 min-w-0 flex-1 rounded-lg border border-line bg-card px-2.5 text-xs text-fg placeholder:text-fg-3",
                STUDIO_FOCUS_RING,
              )}
            />
            <button
              type="button"
              disabled={busy || normalizeStudioDrawingInputProfileName(name).length === 0}
              onClick={() => void saveCurrent()}
              className={cn(
                "inline-flex min-h-10 shrink-0 items-center gap-1 rounded-lg border border-accent/40 bg-accent-soft px-2.5 text-[0.6rem] font-extrabold text-accent hover:border-accent/60 disabled:cursor-not-allowed disabled:opacity-45",
                STUDIO_EASE,
                STUDIO_FOCUS_RING,
              )}
            >
              {busy ? <LoaderCircle size={13} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Save size={13} aria-hidden="true" />}
              저장
            </button>
          </div>
          <p className="mt-1.5 text-[0.52rem] leading-relaxed text-fg-3">
            같은 이름으로 다시 저장하면 갱신합니다 · 최대 {STUDIO_DRAWING_INPUT_CUSTOM_PROFILE_LIMIT}개
          </p>
        </section>

        <section aria-label="저장된 입력 프로필" className="space-y-1.5">
          {profiles.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line px-3 py-5 text-center text-[0.58rem] leading-relaxed text-fg-3">
              저장된 프로필이 없습니다. 현재 잘 맞는 입력감을 저장해 두면 캔버스나 문서가 바뀌어도 다시 적용할 수 있습니다.
            </p>
          ) : profiles.map((profile) => {
            const active = snapshotMatches(currentSnapshot, profile.snapshot);
            return (
              <div
                key={profile.id}
                className={cn(
                  "flex items-center gap-2 rounded-xl border p-2.5",
                  active ? "border-accent/50 bg-accent-soft/65" : "border-line bg-bg-2/45",
                )}
              >
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    applySnapshot(profile.snapshot);
                    setNotice(`${profile.name} 프로필을 적용했습니다.`);
                  }}
                  className={cn(
                    "min-h-10 min-w-0 flex-1 rounded-lg px-1 text-left",
                    STUDIO_FOCUS_RING,
                  )}
                >
                  <span className="flex items-center gap-1.5 text-[0.66rem] font-extrabold text-fg">
                    {active ? <Check size={13} className="shrink-0 text-good" aria-hidden="true" /> : null}
                    <span className="truncate">{profile.name}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-[0.52rem] font-semibold text-fg-3">
                    {modeLabel(profile.snapshot.stabilizerMode)} {profile.snapshot.stabilizer} · 후처리 {profile.snapshot.postCorrection} · {profile.snapshot.pressureCurveId}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void removeProfile(profile)}
                  aria-label={`${profile.name} 프로필 삭제`}
                  className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-lg border border-line text-fg-3 hover:border-bad/40 hover:bg-bad/10 hover:text-bad disabled:cursor-not-allowed disabled:opacity-40",
                    STUDIO_EASE,
                    STUDIO_FOCUS_RING,
                  )}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </section>
      </div>

      <footer className="shrink-0 border-t border-line/70 bg-bg-2/60 px-3 py-2.5">
        <p className="text-[0.53rem] leading-relaxed text-fg-3" role="status" aria-live="polite">
          {notice}
        </p>
      </footer>
    </aside>
  );
}
