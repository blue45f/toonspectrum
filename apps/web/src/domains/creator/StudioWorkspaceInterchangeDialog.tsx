import {
  AlertTriangle,
  Check,
  Clipboard,
  Download,
  FileJson,
  LayoutPanelTop,
  PackageOpen,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import {
  STUDIO_WORKSPACE_INTERCHANGE_MAX_BYTES,
  STUDIO_WORKSPACE_INTERCHANGE_MAX_WORKSPACES,
  decodeStudioWorkspaceInterchange,
  type StudioWorkspaceInterchangeAction,
  type StudioWorkspaceInterchangeDocument,
  type StudioWorkspaceInterchangeFailureReason,
  type StudioWorkspaceInterchangeScope,
} from "./studio-workspace-interchange";
import {
  STUDIO_WORKSPACE_CURRENT_EXPORT_KEY,
  applyStudioWorkspaceInterchangePlanToState,
  encodeStudioWorkspaceInterchangeSelection,
  listStudioWorkspaceInterchangeExportCandidates,
  planStudioWorkspaceInterchangeForState,
} from "./studio-workspace-interchange-runtime";
import {
  isStudioWorkspaceDirty,
  updateStudioWorkspaceLiveLayout,
  type StudioWorkspaceId,
  type StudioWorkspaceLayout,
  type StudioWorkspaceSaveResult,
  type StudioWorkspaceState,
} from "./studio-workspaces";
import {
  STUDIO_ICON_SIZE,
  STUDIO_ICON_STROKE,
  studioChromeIconClass,
} from "./studio-chrome-ui";

import { cn } from "@/shared/lib/utils";

export interface StudioWorkspaceInterchangeDialogProps {
  initialOpen?: boolean;
  openRequest?: number;
  state: StudioWorkspaceState;
  liveLayout: StudioWorkspaceLayout;
  persistence: Pick<StudioWorkspaceSaveResult, "status" | "failure">;
  onStateChange: (
    state: StudioWorkspaceState,
  ) => Pick<StudioWorkspaceSaveResult, "status" | "failure">;
  onApplyLayout: (
    layout: StudioWorkspaceLayout,
    workspaceId?: StudioWorkspaceId,
  ) => void;
  onInitialOpenReady?: (ready: true) => void;
  onOpenChange?: (open: boolean) => void;
}

type TransferTab = "export" | "import";
type NoticeTone = "neutral" | "success" | "warning";

const TRANSFER_TABS = ["export", "import"] as const satisfies readonly TransferTab[];
const IMPORT_SCOPES = [
  "panels",
  "drawingPalettes",
  "quickAccess",
] as const satisfies readonly StudioWorkspaceInterchangeScope[];
const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "a[href]",
  '[tabindex]:not([tabindex="-1"])',
].join(",");
const FOCUS_CLASS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/80 focus-visible:ring-offset-2 focus-visible:ring-offset-panel";
const CARD_CLASS = "rounded-xl border border-line bg-card";
const SCOPE_LABELS: Readonly<
  Record<StudioWorkspaceInterchangeScope, Readonly<{ label: string; detail: string }>>
> = Object.freeze({
  panels: Object.freeze({
    label: "패널과 인스펙터",
    detail: "좌우 패널 표시·폭과 인스펙터 탭",
  }),
  drawingPalettes: Object.freeze({
    label: "그리기 팔레트",
    detail: "서브 도구·도구 속성 순서, 높이, 접힘",
  }),
  quickAccess: Object.freeze({
    label: "명령 표면",
    detail: "방사형 빠른 실행과 상단 커맨드 바",
  }),
});

function DialogPortal({ children }: { readonly children: ReactNode }) {
  return typeof document === "undefined" ? children : createPortal(children, document.body);
}

function focusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.closest("[hidden]") && element.getAttribute("aria-hidden") !== "true",
  );
}

function trapFocus(event: ReactKeyboardEvent<HTMLElement>, root: HTMLElement | null): void {
  if (event.key !== "Tab" || !root) return;
  const focusable = focusableElements(root);
  if (focusable.length === 0) {
    event.preventDefault();
    root.focus({ preventScroll: true });
    return;
  }
  const first = focusable[0];
  const last = focusable.at(-1);
  const active = globalThis.document?.activeElement;
  if (event.shiftKey && (active === first || !root.contains(active))) {
    event.preventDefault();
    last?.focus({ preventScroll: true });
  } else if (!event.shiftKey && (active === last || !root.contains(active))) {
    event.preventDefault();
    first?.focus({ preventScroll: true });
  }
}

function failureText(reason: StudioWorkspaceInterchangeFailureReason): string {
  switch (reason) {
    case "catalog-full":
      return "내 작업공간이 24개로 가득 찼습니다. 일부를 삭제하거나 같은 이름 교체를 선택해 주세요.";
    case "duplicate-workspace-id":
    case "duplicate-workspace-name":
      return "파일 안에 중복된 작업공간 ID 또는 이름이 있습니다.";
    case "id-factory-exhausted":
      return "충돌하지 않는 작업공간 ID를 만들지 못했습니다.";
    case "invalid-action":
    case "invalid-scope":
      return "가져오기 방식 또는 범위가 올바르지 않습니다.";
    case "invalid-current-state":
      return "현재 작업공간 상태를 안전하게 읽지 못했습니다.";
    case "invalid-id":
    case "invalid-name":
      return "파일에 허용되지 않는 작업공간 ID 또는 이름이 있습니다.";
    case "invalid-shape":
    case "non-json-value":
      return "툰스튜디오 작업공간 JSON 형식이 아닙니다.";
    case "payload-too-large":
      return "작업공간 파일은 64KB 이하여야 합니다.";
    case "sensitive-field":
      return "프로젝트·계정·토큰처럼 작업공간에 포함될 수 없는 민감 필드가 발견되었습니다.";
    case "too-many-workspaces":
      return "한 파일에는 작업공간을 최대 24개까지 담을 수 있습니다.";
    case "unknown-apply-workspace":
      return "바로 적용할 작업공간을 선택해 주세요.";
    case "unsupported-kind":
      return "다른 종류의 파일입니다. 툰스튜디오 작업공간 파일을 선택해 주세요.";
    case "unsupported-version":
      return "이 버전의 툰스튜디오에서 아직 지원하지 않는 작업공간 파일입니다.";
    default:
      return "작업공간 파일을 처리하지 못했습니다.";
  }
}

function toggleValue<T extends string>(
  values: readonly T[],
  value: T,
  selected: boolean,
): readonly T[] {
  if (selected) return values.includes(value) ? values : [...values, value];
  return values.filter((candidate) => candidate !== value);
}

function exportFileName(): string {
  const now = new Date();
  return `toonstudio-workspaces-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}.json`;
}

function downloadJson(text: string): boolean {
  if (
    typeof document === "undefined" ||
    typeof URL === "undefined" ||
    typeof URL.createObjectURL !== "function"
  ) {
    return false;
  }
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json;charset=utf-8" }),
  );
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = exportFileName();
    anchor.rel = "noopener";
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    return true;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function copyJson(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the bounded DOM fallback.
    }
  }
  if (typeof document === "undefined") return false;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.readOnly = true;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}

function ToggleCard({
  pressed,
  disabled = false,
  label,
  detail,
  onPressedChange,
}: {
  readonly pressed: boolean;
  readonly disabled?: boolean;
  readonly label: string;
  readonly detail: string;
  readonly onPressedChange: (pressed: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={() => onPressedChange(!pressed)}
      className={cn(
        "flex min-h-11 w-full items-start gap-2 rounded-lg border px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-45",
        pressed
          ? "border-accent/60 bg-accent-soft"
          : "border-line bg-panel hover:bg-raised",
        FOCUS_CLASS,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mt-0.5 grid size-4 shrink-0 place-items-center rounded border",
          pressed ? "border-accent bg-accent text-on-accent" : "border-line-strong bg-card",
        )}
      >
        {pressed ? <Check size={11} strokeWidth={3} /> : null}
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-bold text-fg">{label}</span>
        <span className="mt-0.5 block text-[0.6875rem] leading-relaxed text-fg-3">
          {detail}
        </span>
      </span>
    </button>
  );
}

function ActionCard({
  selected,
  label,
  detail,
  onSelect,
}: {
  readonly selected: boolean;
  readonly label: string;
  readonly detail: string;
  readonly onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "min-h-11 rounded-lg border px-3 py-2 text-left",
        selected
          ? "border-accent/60 bg-accent-soft"
          : "border-line bg-panel hover:bg-raised",
        FOCUS_CLASS,
      )}
    >
      <span className="block text-xs font-bold text-fg">{label}</span>
      <span className="mt-0.5 block text-[0.6875rem] leading-relaxed text-fg-3">
        {detail}
      </span>
    </button>
  );
}

export function StudioWorkspaceInterchangeDialog({
  initialOpen = false,
  openRequest = 0,
  state,
  liveLayout,
  persistence,
  onStateChange,
  onApplyLayout,
  onInitialOpenReady,
  onOpenChange,
}: StudioWorkspaceInterchangeDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const importEpochRef = useRef(0);
  const [open, setOpen] = useState(initialOpen);
  const [tab, setTab] = useState<TransferTab>("export");
  const [selectedExportKeys, setSelectedExportKeys] = useState<readonly string[]>([
    STUDIO_WORKSPACE_CURRENT_EXPORT_KEY,
  ]);
  const [includeDrawingPalettes, setIncludeDrawingPalettes] = useState(true);
  const [includeCommandSurfaces, setIncludeCommandSurfaces] = useState(true);
  const [importDocument, setImportDocument] =
    useState<StudioWorkspaceInterchangeDocument | null>(null);
  const [importFileName, setImportFileName] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [selectedImportIds, setSelectedImportIds] = useState<readonly string[]>([]);
  const [importAction, setImportAction] =
    useState<StudioWorkspaceInterchangeAction>("add");
  const [importScopes, setImportScopes] =
    useState<readonly StudioWorkspaceInterchangeScope[]>(IMPORT_SCOPES);
  const [applyWorkspaceId, setApplyWorkspaceId] = useState("");
  const [discardConfirmed, setDiscardConfirmed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeTone, setNoticeTone] = useState<NoticeTone>("neutral");
  const [error, setError] = useState<string | null>(null);

  const syncedState = updateStudioWorkspaceLiveLayout(state, liveLayout);
  const dirty = isStudioWorkspaceDirty(syncedState);
  const exportCandidates = listStudioWorkspaceInterchangeExportCandidates(
    syncedState,
    syncedState.liveLayout,
  );
  const selectedImportWorkspaces = importDocument?.workspaces.filter((workspace) =>
    selectedImportIds.includes(workspace.id),
  ) ?? [];
  const selectedImportDocument = importDocument && selectedImportWorkspaces.length > 0
    ? Object.freeze({
        ...importDocument,
        workspaces: Object.freeze(selectedImportWorkspaces),
      })
    : null;
  const effectiveApplyWorkspaceId = selectedImportIds.includes(applyWorkspaceId)
    ? applyWorkspaceId
    : selectedImportIds[0] ?? "";
  const importPlanResult = selectedImportDocument && importScopes.length > 0
    ? planStudioWorkspaceInterchangeForState(
        syncedState,
        syncedState.liveLayout,
        selectedImportDocument,
        {
          action: importAction,
          scopes: importScopes,
          ...(importAction === "add-and-apply" && effectiveApplyWorkspaceId
            ? { applyWorkspaceId: effectiveApplyWorkspaceId }
            : {}),
        },
      )
    : null;
  const plan = importPlanResult?.ok ? importPlanResult.plan : null;
  const requiresDiscardConfirmation = dirty && importAction === "add-and-apply";
  const hasStandaloneQuickAccess = selectedImportWorkspaces.some(
    ({ presentation }) => presentation.quickAccess !== undefined,
  );

  useEffect(() => {
    if (openRequest > 0) setOpen(true);
  }, [openRequest]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || typeof document === "undefined") return;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => {
      dialogRef.current?.focus({ preventScroll: true });
      onInitialOpenReady?.(true);
      onOpenChange?.(true);
    });
    return () => {
      cancelAnimationFrame(frame);
      previousFocus?.focus({ preventScroll: true });
    };
  }, [onInitialOpenReady, onOpenChange, open]);

  function resetMessages(): void {
    setNotice(null);
    setError(null);
  }

  function closeDialog(): void {
    importEpochRef.current += 1;
    setImportBusy(false);
    setOpen(false);
    setError(null);
    onOpenChange?.(false);
  }

  function selectTab(nextTab: TransferTab, focusTab = false): void {
    setTab(nextTab);
    resetMessages();
    if (!focusTab || typeof document === "undefined") return;
    requestAnimationFrame(() => {
      document.getElementById(`${titleId}-tab-${nextTab}`)?.focus({ preventScroll: true });
    });
  }

  function handleTabKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    currentTab: TransferTab,
  ): void {
    const currentIndex = TRANSFER_TABS.indexOf(currentTab);
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % TRANSFER_TABS.length;
    if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + TRANSFER_TABS.length) % TRANSFER_TABS.length;
    }
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = TRANSFER_TABS.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    selectTab(TRANSFER_TABS[nextIndex] ?? currentTab, true);
  }

  function handleDialogKeyDown(event: ReactKeyboardEvent<HTMLElement>): void {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      closeDialog();
      return;
    }
    trapFocus(event, dialogRef.current);
  }

  function encodeExport() {
    return encodeStudioWorkspaceInterchangeSelection(
      syncedState,
      syncedState.liveLayout,
      selectedExportKeys,
      {
        includeDrawingPalettes,
        includeQuickActions: includeCommandSurfaces,
        includeQuickAccess: false,
        includeCommandBar: includeCommandSurfaces,
      },
    );
  }

  function downloadExport(): void {
    resetMessages();
    const encoded = encodeExport();
    if (!encoded.ok) {
      setError(failureText(encoded.reason));
      return;
    }
    if (!downloadJson(encoded.text)) {
      setError("이 브라우저에서는 파일 다운로드를 시작하지 못했습니다.");
      return;
    }
    setNotice(`${encoded.document.workspaces.length}개 작업공간 파일을 만들었습니다.`);
    setNoticeTone("success");
  }

  async function copyExport(): Promise<void> {
    resetMessages();
    const encoded = encodeExport();
    if (!encoded.ok) {
      setError(failureText(encoded.reason));
      return;
    }
    if (!(await copyJson(encoded.text))) {
      setError("클립보드 권한을 확인한 뒤 다시 시도해 주세요.");
      return;
    }
    setNotice(`${encoded.document.workspaces.length}개 작업공간 JSON을 복사했습니다.`);
    setNoticeTone("success");
  }

  function clearImportPayload(fileName = ""): void {
    setImportDocument(null);
    setImportFileName(fileName);
    setSelectedImportIds([]);
    setApplyWorkspaceId("");
    setDiscardConfirmed(false);
  }

  function acceptImportDocument(
    documentValue: StudioWorkspaceInterchangeDocument,
    sourceLabel: string,
  ): void {
    setImportDocument(documentValue);
    setSelectedImportIds(documentValue.workspaces.map(({ id }) => id));
    setApplyWorkspaceId(documentValue.workspaces[0]?.id ?? "");
    setImportAction("add");
    setImportScopes(IMPORT_SCOPES);
    setNotice(
      `${documentValue.workspaces.length}개 작업공간을 ${sourceLabel}에서 검사했습니다. 적용 전 계획을 확인해 주세요.`,
    );
    setNoticeTone("neutral");
  }

  async function loadImportText(
    textPromise: Promise<string>,
    sourceLabel: string,
    fileName: string,
  ): Promise<void> {
    const epoch = importEpochRef.current + 1;
    importEpochRef.current = epoch;
    resetMessages();
    setImportBusy(true);
    clearImportPayload(fileName);
    try {
      const text = await textPromise;
      if (epoch !== importEpochRef.current) return;
      const decoded = decodeStudioWorkspaceInterchange(text);
      if (!decoded.ok) {
        setError(failureText(decoded.reason));
        return;
      }
      acceptImportDocument(decoded.document, sourceLabel);
    } catch {
      if (epoch === importEpochRef.current) {
        setError(`${sourceLabel}을(를) 읽지 못했습니다. 권한과 데이터 상태를 확인해 주세요.`);
      }
    } finally {
      if (epoch === importEpochRef.current) setImportBusy(false);
    }
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (file.size > STUDIO_WORKSPACE_INTERCHANGE_MAX_BYTES) {
      resetMessages();
      clearImportPayload(file.name);
      setError("작업공간 파일은 64KB 이하여야 합니다.");
      return;
    }
    await loadImportText(file.text(), "파일", file.name);
  }

  async function loadClipboardImport(): Promise<void> {
    if (typeof navigator === "undefined" || !navigator.clipboard?.readText) {
      resetMessages();
      clearImportPayload("클립보드 JSON");
      setError("이 브라우저에서는 클립보드 읽기를 지원하지 않습니다.");
      return;
    }
    await loadImportText(
      navigator.clipboard.readText(),
      "클립보드",
      "클립보드 JSON",
    );
  }

  function commitImport(): void {
    resetMessages();
    if (!importPlanResult) {
      setError("가져올 작업공간과 범위를 선택해 주세요.");
      return;
    }
    if (!importPlanResult.ok) {
      setError(failureText(importPlanResult.reason));
      return;
    }
    if (requiresDiscardConfirmation && !discardConfirmed) {
      setError("현재 저장 전 배치를 버리는 데 동의해야 바로 적용할 수 있습니다.");
      return;
    }

    let nextState: StudioWorkspaceState;
    try {
      nextState = applyStudioWorkspaceInterchangePlanToState(
        syncedState,
        syncedState.liveLayout,
        importPlanResult.plan,
      );
    } catch {
      setError("가져온 설정을 저장 가능한 작업공간 상태로 만들지 못했습니다. 현재 상태는 변경하지 않았습니다.");
      return;
    }

    let saveResult: Pick<StudioWorkspaceSaveResult, "status" | "failure">;
    try {
      saveResult = onStateChange(nextState);
    } catch {
      setError("작업공간 저장 경로가 응답하지 않아 현재 상태는 변경하지 않았습니다.");
      return;
    }
    if (saveResult.failure === "owner-mismatch") {
      setError("로그인 상태가 바뀌어 이전 계정의 작업공간에는 적용하지 않았습니다.");
      return;
    }

    let applyWarning = "";
    if (importPlanResult.plan.action === "add-and-apply") {
      try {
        onApplyLayout(nextState.liveLayout, nextState.activeWorkspaceId);
      } catch {
        applyWarning = " 가져오기는 저장했지만 화면 전환에 실패했습니다. 작업공간 메뉴에서 다시 적용해 주세요.";
      }
    }
    const stored = saveResult.status === "persisted";
    const pendingPersistence = saveResult.status === "session-only" && saveResult.failure === null;
    setNotice(
      `${importPlanResult.plan.operations.length}개 작업공간을 가져왔습니다. ${
        stored
          ? "이 기기 저장까지 확인했습니다."
          : pendingPersistence
            ? "이 기기 저장을 확인하는 중입니다."
            : "저장소 문제로 이 세션에서만 유지됩니다."
      }${applyWarning}`,
    );
    setNoticeTone(applyWarning || (!stored && !pendingPersistence) ? "warning" : stored ? "success" : "neutral");
    clearImportPayload();
  }

  return (
    <DialogPortal>
      <button
        type="button"
        hidden={!open}
        tabIndex={-1}
        aria-label="작업공간 가져오기·내보내기 닫기"
        onClick={closeDialog}
        className="fixed inset-0 z-[109] cursor-default bg-canvas/80 backdrop-blur-[1px]"
      />
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        hidden={!open}
        onKeyDownCapture={handleDialogKeyDown}
        onKeyUpCapture={(event) => event.stopPropagation()}
        data-testid="studio-workspace-interchange-dialog"
        data-studio-shortcut-boundary="true"
        className={cn(
          "fixed z-[110] flex min-h-0 flex-col overflow-hidden rounded-xl border border-line-strong bg-panel shadow-2xl",
          "inset-x-2 top-[max(0.5rem,env(safe-area-inset-top))] bottom-[max(0.5rem,env(safe-area-inset-bottom))]",
          "md:inset-x-auto md:left-1/2 md:top-1/2 md:h-[min(46rem,calc(100dvh-2rem))] md:w-[min(58rem,calc(100vw-2rem))] md:-translate-x-1/2 md:-translate-y-1/2",
        )}
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-line px-4 py-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <PackageOpen
              size={STUDIO_ICON_SIZE.rail}
              strokeWidth={STUDIO_ICON_STROKE}
              aria-hidden
              className={studioChromeIconClass({ tone: "accent" })}
            />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 flex-wrap items-center gap-2">
              <h2 id={titleId} className="text-sm font-bold text-fg">
                작업공간 가져오기·내보내기
              </h2>
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[0.6875rem] font-bold",
                  persistence.status === "persisted"
                    ? "bg-good/15 text-good"
                    : "bg-warn/15 text-warn",
                )}
              >
                {persistence.status === "persisted" ? "기기 저장" : "세션 전용"}
              </span>
            </span>
            <p id={descriptionId} className="mt-1 text-[0.6875rem] leading-relaxed text-fg-3">
              패널·팔레트·명령 배치만 이동합니다. 작품, 프로젝트, 계정, AI 설정은 포함하지 않습니다.
            </p>
          </span>
          <button
            type="button"
            onClick={closeDialog}
            aria-label="작업공간 가져오기·내보내기 닫기"
            className={cn(
              "grid size-11 shrink-0 place-items-center rounded-lg text-fg-3 hover:bg-raised hover:text-fg",
              FOCUS_CLASS,
            )}
          >
            <X
              size={STUDIO_ICON_SIZE.nav}
              strokeWidth={STUDIO_ICON_STROKE}
              aria-hidden
              className={studioChromeIconClass({ tone: "default" })}
            />
          </button>
        </header>

        <div
          role="tablist"
          aria-label="작업공간 이동 방식"
          className="grid shrink-0 grid-cols-2 gap-1.5 border-b border-line bg-card/50 px-4 py-2"
        >
          {([
            ["export", "내보내기", Download],
            ["import", "가져오기", Upload],
          ] as const).map(([value, label, Icon]) => (
            <button
              key={value}
              id={`${titleId}-tab-${value}`}
              type="button"
              role="tab"
              aria-selected={tab === value}
              aria-controls={`${titleId}-panel-${value}`}
              tabIndex={tab === value ? 0 : -1}
              onKeyDown={(event) => handleTabKeyDown(event, value)}
              onClick={() => selectTab(value)}
              className={cn(
                "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-bold",
                tab === value
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-panel text-fg-2 hover:bg-raised hover:text-fg",
                FOCUS_CLASS,
              )}
            >
              <Icon size={STUDIO_ICON_SIZE.contextMenu} strokeWidth={STUDIO_ICON_STROKE} aria-hidden />
              {label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 [scrollbar-gutter:stable]">
          <div aria-live="polite" aria-atomic="true" className="mb-3 empty:hidden">
            {error ? (
              <p role="alert" className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-xs text-bad">
                {error}
              </p>
            ) : notice ? (
              <p
                role="status"
                className={cn(
                  "rounded-lg border px-3 py-2 text-xs",
                  noticeTone === "success" && "border-good/30 bg-good/10 text-good",
                  noticeTone === "warning" && "border-warn/35 bg-warn/10 text-warn",
                  noticeTone === "neutral" && "border-line bg-raised text-fg-2",
                )}
              >
                {notice}
              </p>
            ) : null}
          </div>

          <div
            id={`${titleId}-panel-export`}
            role="tabpanel"
            aria-labelledby={`${titleId}-tab-export`}
            hidden={tab !== "export"}
            className="space-y-4"
          >
            <section className={cn(CARD_CLASS, "p-3")} aria-labelledby={`${titleId}-export-list`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 id={`${titleId}-export-list`} className="text-xs font-bold text-fg">
                    내보낼 작업공간
                  </h3>
                  <p className="mt-1 text-[0.6875rem] text-fg-3">
                    현재 배치와 저장본을 합쳐 최대 24개까지 선택할 수 있습니다.
                  </p>
                </div>
                <span className="rounded-full bg-raised px-2 py-1 text-[0.6875rem] font-bold text-fg-2">
                  {selectedExportKeys.length}/{STUDIO_WORKSPACE_INTERCHANGE_MAX_WORKSPACES}
                </span>
                <span className="flex basis-full flex-wrap gap-1.5 sm:basis-auto sm:justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedExportKeys([STUDIO_WORKSPACE_CURRENT_EXPORT_KEY]);
                      resetMessages();
                    }}
                    className={cn(
                      "min-h-9 rounded-lg border border-line bg-panel px-2.5 text-[0.6875rem] font-bold text-fg-2 hover:bg-raised hover:text-fg",
                      FOCUS_CLASS,
                    )}
                  >
                    현재 배치만
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedExportKeys(
                        exportCandidates
                          .filter(({ source }) => source === "saved")
                          .map(({ key }) => key),
                      );
                      resetMessages();
                    }}
                    disabled={!exportCandidates.some(({ source }) => source === "saved")}
                    className={cn(
                      "min-h-9 rounded-lg border border-line bg-panel px-2.5 text-[0.6875rem] font-bold text-fg-2 hover:bg-raised hover:text-fg disabled:cursor-not-allowed disabled:opacity-45",
                      FOCUS_CLASS,
                    )}
                  >
                    저장본 모두
                  </button>
                </span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {exportCandidates.map((candidate) => {
                  const selected = selectedExportKeys.includes(candidate.key);
                  return (
                    <ToggleCard
                      key={candidate.key}
                      pressed={selected}
                      disabled={
                        !selected &&
                        selectedExportKeys.length >= STUDIO_WORKSPACE_INTERCHANGE_MAX_WORKSPACES
                      }
                      label={`${candidate.name}${candidate.source === "current" ? " · 현재 배치" : ""}`}
                      detail={`${candidate.description}${candidate.dirty ? " · 저장 전 변경 포함" : ""}`}
                      onPressedChange={(pressed) => {
                        setSelectedExportKeys((current) =>
                          toggleValue(current, candidate.key, pressed),
                        );
                        resetMessages();
                      }}
                    />
                  );
                })}
              </div>
            </section>

            <section className={cn(CARD_CLASS, "p-3")} aria-labelledby={`${titleId}-export-scope`}>
              <h3 id={`${titleId}-export-scope`} className="text-xs font-bold text-fg">
                포함 범위
              </h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <ToggleCard
                  pressed
                  disabled
                  label={SCOPE_LABELS.panels.label}
                  detail="모든 파일에 필수로 포함됩니다."
                  onPressedChange={() => undefined}
                />
                <ToggleCard
                  pressed={includeDrawingPalettes}
                  label={SCOPE_LABELS.drawingPalettes.label}
                  detail={SCOPE_LABELS.drawingPalettes.detail}
                  onPressedChange={setIncludeDrawingPalettes}
                />
                <ToggleCard
                  pressed={includeCommandSurfaces}
                  label={SCOPE_LABELS.quickAccess.label}
                  detail={SCOPE_LABELS.quickAccess.detail}
                  onPressedChange={setIncludeCommandSurfaces}
                />
              </div>
            </section>

            <aside className="flex items-start gap-2 rounded-xl border border-good/30 bg-good/10 px-3 py-2 text-[0.6875rem] leading-relaxed text-good">
              <ShieldCheck size={STUDIO_ICON_SIZE.contextMenu} strokeWidth={STUDIO_ICON_STROKE} aria-hidden />
              <span>
                프로젝트 문서·그림·에셋·댓글·계정·토큰 필드는 차단되며 JSON은 64KB로 제한됩니다.
              </span>
            </aside>

            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={downloadExport}
                disabled={selectedExportKeys.length === 0}
                className={cn(
                  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-accent px-3 text-xs font-bold text-on-accent hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-45",
                  FOCUS_CLASS,
                )}
              >
                <Download size={STUDIO_ICON_SIZE.contextMenu} strokeWidth={STUDIO_ICON_STROKE} aria-hidden />
                JSON 파일 다운로드
              </button>
              <button
                type="button"
                onClick={() => void copyExport()}
                disabled={selectedExportKeys.length === 0}
                className={cn(
                  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-panel px-3 text-xs font-bold text-fg-2 hover:bg-raised hover:text-fg disabled:cursor-not-allowed disabled:opacity-45",
                  FOCUS_CLASS,
                )}
              >
                <Clipboard size={STUDIO_ICON_SIZE.contextMenu} strokeWidth={STUDIO_ICON_STROKE} aria-hidden />
                JSON 복사
              </button>
            </div>
          </div>

          <div
            id={`${titleId}-panel-import`}
            role="tabpanel"
            aria-labelledby={`${titleId}-tab-import`}
            hidden={tab !== "import"}
            className="space-y-4"
          >
            <section
              className={cn(CARD_CLASS, "p-3")}
              aria-labelledby={`${titleId}-import-file`}
              aria-busy={importBusy}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
              }}
              onDrop={(event) => {
                event.preventDefault();
                const file = event.dataTransfer.files[0];
                if (!file) return;
                const input = fileInputRef.current;
                if (input) {
                  const transfer = new DataTransfer();
                  transfer.items.add(file);
                  input.files = transfer.files;
                  input.dispatchEvent(new Event("change", { bubbles: true }));
                }
              }}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <h3 id={`${titleId}-import-file`} className="text-xs font-bold text-fg">
                    작업공간 파일
                  </h3>
                  <p className="mt-1 truncate text-[0.6875rem] text-fg-3">
                    {importFileName || "툰스튜디오 작업공간 JSON · 최대 64KB · 선택하거나 이 영역에 놓기"}
                  </p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={(event) => void handleFileChange(event)}
                  className="sr-only"
                  aria-label="작업공간 JSON 파일 선택"
                />
                <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={importBusy}
                    className={cn(
                      "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-panel px-3 text-xs font-bold text-fg-2 hover:bg-raised hover:text-fg disabled:opacity-45",
                      FOCUS_CLASS,
                    )}
                  >
                    <FileJson size={STUDIO_ICON_SIZE.contextMenu} strokeWidth={STUDIO_ICON_STROKE} aria-hidden />
                    파일 선택
                  </button>
                  <button
                    type="button"
                    onClick={() => void loadClipboardImport()}
                    disabled={importBusy}
                    className={cn(
                      "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-line bg-panel px-3 text-xs font-bold text-fg-2 hover:bg-raised hover:text-fg disabled:opacity-45",
                      FOCUS_CLASS,
                    )}
                  >
                    <Clipboard size={STUDIO_ICON_SIZE.contextMenu} strokeWidth={STUDIO_ICON_STROKE} aria-hidden />
                    {importBusy ? "검사 중…" : "JSON 붙여넣기"}
                  </button>
                </div>
              </div>
            </section>

            {hasStandaloneQuickAccess ? (
              <aside className="flex items-start gap-2 rounded-xl border border-warn/35 bg-warn/10 px-3 py-2 text-[0.6875rem] leading-relaxed text-warn">
                <AlertTriangle size={STUDIO_ICON_SIZE.contextMenu} strokeWidth={STUDIO_ICON_STROKE} aria-hidden />
                <span>
                  별도 빠른 액세스 세트는 전역 저장 영역이라 건너뜁니다. 방사형 빠른 실행과 상단 커맨드 바는 계획대로 적용됩니다.
                </span>
              </aside>
            ) : null}

            {importDocument ? (
              <>
                <section className={cn(CARD_CLASS, "p-3")} aria-labelledby={`${titleId}-import-list`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 id={`${titleId}-import-list`} className="text-xs font-bold text-fg">
                        가져올 작업공간
                      </h3>
                      <p className="mt-1 text-[0.6875rem] text-fg-3">
                        파일 안의 항목을 개별 선택할 수 있습니다.
                      </p>
                    </div>
                    <span className="rounded-full bg-raised px-2 py-1 text-[0.6875rem] font-bold text-fg-2">
                      {selectedImportIds.length}/{importDocument.workspaces.length}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {importDocument.workspaces.map((workspace) => (
                      <ToggleCard
                        key={workspace.id}
                        pressed={selectedImportIds.includes(workspace.id)}
                        label={workspace.name}
                        detail={`ID ${workspace.id}`}
                        onPressedChange={(pressed) => {
                          setSelectedImportIds((current) =>
                            toggleValue(current, workspace.id, pressed),
                          );
                          setDiscardConfirmed(false);
                          resetMessages();
                        }}
                      />
                    ))}
                  </div>
                </section>

                <section className={cn(CARD_CLASS, "p-3")} aria-labelledby={`${titleId}-import-action`}>
                  <h3 id={`${titleId}-import-action`} className="text-xs font-bold text-fg">
                    충돌 처리와 적용 방식
                  </h3>
                  <div className="mt-3 grid gap-2 lg:grid-cols-3">
                    <ActionCard
                      selected={importAction === "add"}
                      label="안전하게 추가"
                      detail="충돌을 자동 구분하고 현재 화면은 유지합니다."
                      onSelect={() => {
                        setImportAction("add");
                        setDiscardConfirmed(false);
                        resetMessages();
                      }}
                    />
                    <ActionCard
                      selected={importAction === "add-and-apply"}
                      label="추가 후 바로 적용"
                      detail="선택한 작업공간을 추가하고 화면 배치도 전환합니다."
                      onSelect={() => {
                        setImportAction("add-and-apply");
                        setDiscardConfirmed(false);
                        resetMessages();
                      }}
                    />
                    <ActionCard
                      selected={importAction === "replace-same-name"}
                      label="같은 이름 교체"
                      detail="동일 이름의 저장본만 교체하고 없는 항목은 추가합니다."
                      onSelect={() => {
                        setImportAction("replace-same-name");
                        setDiscardConfirmed(false);
                        resetMessages();
                      }}
                    />
                  </div>

                  {importAction === "add-and-apply" ? (
                    <div className="mt-3">
                      <label
                        htmlFor={`${titleId}-apply-workspace`}
                        className="text-[0.6875rem] font-bold text-fg-2"
                      >
                        바로 적용할 작업공간
                      </label>
                      <select
                        id={`${titleId}-apply-workspace`}
                        value={effectiveApplyWorkspaceId}
                        onChange={(event) => {
                          setApplyWorkspaceId(event.currentTarget.value);
                          setDiscardConfirmed(false);
                          resetMessages();
                        }}
                        disabled={selectedImportWorkspaces.length === 0}
                        className={cn(
                          "mt-1 min-h-11 w-full rounded-lg border border-line bg-panel px-3 text-xs text-fg disabled:opacity-45",
                          FOCUS_CLASS,
                        )}
                      >
                        {selectedImportWorkspaces.map((workspace) => (
                          <option key={workspace.id} value={workspace.id}>
                            {workspace.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                </section>

                <section className={cn(CARD_CLASS, "p-3")} aria-labelledby={`${titleId}-import-scope`}>
                  <h3 id={`${titleId}-import-scope`} className="text-xs font-bold text-fg">
                    가져올 범위
                  </h3>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    {IMPORT_SCOPES.map((scope) => (
                      <ToggleCard
                        key={scope}
                        pressed={importScopes.includes(scope)}
                        label={SCOPE_LABELS[scope].label}
                        detail={SCOPE_LABELS[scope].detail}
                        onPressedChange={(pressed) => {
                          setImportScopes((current) => toggleValue(current, scope, pressed));
                          setDiscardConfirmed(false);
                          resetMessages();
                        }}
                      />
                    ))}
                  </div>
                  <p className="mt-2 text-[0.6875rem] leading-relaxed text-fg-3">
                    파일에 없는 범위는 현재 배치를 유지합니다. 기기별 오버라이드는 교체 대상에는 유지하고 새 항목에는 복사하지 않습니다.
                  </p>
                </section>

                <section className={cn(CARD_CLASS, "p-3")} aria-labelledby={`${titleId}-plan`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 id={`${titleId}-plan`} className="text-xs font-bold text-fg">
                        적용 전 계획
                      </h3>
                      <p className="mt-1 text-[0.6875rem] text-fg-3">
                        실제 저장 전에 충돌과 이름·ID 재매핑을 계산합니다.
                      </p>
                    </div>
                    {plan ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-good/15 px-2 py-1 text-[0.6875rem] font-bold text-good">
                        <Check size={STUDIO_ICON_SIZE.subtab} strokeWidth={STUDIO_ICON_STROKE} aria-hidden />
                        검증 완료
                      </span>
                    ) : null}
                  </div>

                  {importPlanResult && !importPlanResult.ok ? (
                    <p className="mt-3 rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-xs text-bad">
                      {failureText(importPlanResult.reason)}
                    </p>
                  ) : plan ? (
                    <div className="mt-3 max-h-48 space-y-1.5 overflow-y-auto pr-1">
                      {plan.operations.map((operation) => (
                        <div
                          key={`${operation.sourceWorkspaceId}:${operation.targetWorkspaceId}`}
                          className="flex min-w-0 items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2"
                        >
                          <LayoutPanelTop
                            size={STUDIO_ICON_SIZE.contextMenu}
                            strokeWidth={STUDIO_ICON_STROKE}
                            aria-hidden
                            className={studioChromeIconClass({ tone: "default" })}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-bold text-fg">
                              {operation.workspace.name}
                            </span>
                            <span className="mt-0.5 block truncate text-[0.6875rem] text-fg-3">
                              {operation.kind === "replace" ? "같은 이름 저장본 교체" : "새 작업공간 추가"}
                              {operation.renamed ? " · 이름 자동 구분" : ""}
                              {operation.idRemapped ? " · ID 안전 재매핑" : ""}
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 rounded-lg border border-line bg-raised px-3 py-2 text-xs text-fg-3">
                      작업공간과 범위를 하나 이상 선택하면 계획을 계산합니다.
                    </p>
                  )}
                </section>

                {requiresDiscardConfirmation ? (
                  <ToggleCard
                    pressed={discardConfirmed}
                    label="현재 저장 전 배치 변경을 버리고 바로 적용"
                    detail="가져오기만 선택하면 현재 변경을 유지할 수 있습니다."
                    onPressedChange={setDiscardConfirmed}
                  />
                ) : null}

                <button
                  type="button"
                  onClick={commitImport}
                  disabled={
                    importBusy ||
                    !plan ||
                    importScopes.length === 0 ||
                    (requiresDiscardConfirmation && !discardConfirmed)
                  }
                  className={cn(
                    "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 text-xs font-bold text-on-accent hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-45",
                    FOCUS_CLASS,
                  )}
                >
                  <PackageOpen size={STUDIO_ICON_SIZE.contextMenu} strokeWidth={STUDIO_ICON_STROKE} aria-hidden />
                  {importAction === "add-and-apply" ? "계획대로 가져오고 적용" : "계획대로 가져오기"}
                </button>
              </>
            ) : (
              <div className="grid min-h-64 place-items-center rounded-xl border border-dashed border-line-strong bg-card/40 px-6 py-10 text-center">
                <span>
                  <Upload size={40} strokeWidth={1.5} aria-hidden className="mx-auto text-fg-3" />
                  <span className="mt-3 block text-sm font-bold text-fg">
                    파일을 선택해 먼저 안전 검사를 실행하세요.
                  </span>
                  <span className="mt-1 block text-[0.6875rem] leading-relaxed text-fg-3">
                    형식·버전·용량·중복·민감 필드를 검증한 뒤에만 적용 계획을 표시합니다.
                  </span>
                </span>
              </div>
            )}
          </div>
        </div>
      </section>
    </DialogPortal>
  );
}
