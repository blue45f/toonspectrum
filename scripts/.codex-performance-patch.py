from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(relative_path: str, old: str, new: str) -> None:
    path = ROOT / relative_path
    text = path.read_text(encoding="utf-8")
    matches = text.count(old)
    if matches == 1:
        path.write_text(text.replace(old, new, 1), encoding="utf-8")
        print(f"patched {relative_path}")
        return
    if matches == 0 and new in text:
        print(f"already patched {relative_path}")
        return
    raise RuntimeError(
        f"Expected exactly one match in {relative_path}, found {matches}."
    )


replace_once(
    "apps/web/src/domains/creator/live/StudioLiveCanvasOverlay.tsx",
    '''import { useStudioLiveCursorChatBubbles } from "./use-studio-live-cursor-chat-bubbles";
import { useStudioLiveCursorQuality } from "./use-studio-live-cursor-quality";
''',
    '''import { useStudioLiveCursorChatBubbles } from "./use-studio-live-cursor-chat-bubbles";
import { useStudioLiveCursorQuality } from "./use-studio-live-cursor-quality";
import { useStudioLiveDisplaySync } from "./use-studio-live-display-sync";
''',
)

replace_once(
    "apps/web/src/domains/creator/live/StudioLiveCanvasOverlay.tsx",
    '''  useLayoutEffect(() => {
    const measure = () => {
      const anchorRect = anchor.getBoundingClientRect();
      const tooltipRect = tooltipRef.current?.getBoundingClientRect();
      const visualViewport = globalThis.visualViewport;
      setPosition(planStudioCommentPinPreviewPosition({
        anchor: anchorRect,
        viewport: {
          left: visualViewport?.offsetLeft ?? 0,
          top: visualViewport?.offsetTop ?? 0,
          width: visualViewport?.width ?? globalThis.innerWidth,
          height: visualViewport?.height ?? globalThis.innerHeight,
        },
        measured: tooltipRect && tooltipRect.width > 0 && tooltipRect.height > 0
          ? { width: tooltipRect.width, height: tooltipRect.height }
          : undefined,
      }));
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(anchor);
    if (tooltipRef.current) observer?.observe(tooltipRef.current);
    globalThis.addEventListener("resize", measure);
    globalThis.addEventListener("scroll", measure, true);
    globalThis.visualViewport?.addEventListener("resize", measure);
    globalThis.visualViewport?.addEventListener("scroll", measure);
    return () => {
      observer?.disconnect();
      globalThis.removeEventListener("resize", measure);
      globalThis.removeEventListener("scroll", measure, true);
      globalThis.visualViewport?.removeEventListener("resize", measure);
      globalThis.visualViewport?.removeEventListener("scroll", measure);
    };
  }, [anchor, author, body]);
''',
    '''  useLayoutEffect(() => {
    let measureFrame: number | null = null;
    const measure = () => {
      const anchorRect = anchor.getBoundingClientRect();
      const tooltipRect = tooltipRef.current?.getBoundingClientRect();
      const visualViewport = globalThis.visualViewport;
      setPosition(planStudioCommentPinPreviewPosition({
        anchor: anchorRect,
        viewport: {
          left: visualViewport?.offsetLeft ?? 0,
          top: visualViewport?.offsetTop ?? 0,
          width: visualViewport?.width ?? globalThis.innerWidth,
          height: visualViewport?.height ?? globalThis.innerHeight,
        },
        measured: tooltipRect && tooltipRect.width > 0 && tooltipRect.height > 0
          ? { width: tooltipRect.width, height: tooltipRect.height }
          : undefined,
      }));
    };
    const scheduleMeasure = () => {
      if (measureFrame !== null) return;
      measureFrame = globalThis.requestAnimationFrame(() => {
        measureFrame = null;
        measure();
      });
    };
    measure();
    const observer = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(scheduleMeasure);
    observer?.observe(anchor);
    if (tooltipRef.current) observer?.observe(tooltipRef.current);
    globalThis.addEventListener("resize", scheduleMeasure);
    globalThis.addEventListener("scroll", scheduleMeasure, true);
    globalThis.visualViewport?.addEventListener("resize", scheduleMeasure);
    globalThis.visualViewport?.addEventListener("scroll", scheduleMeasure);
    return () => {
      if (measureFrame !== null) globalThis.cancelAnimationFrame(measureFrame);
      observer?.disconnect();
      globalThis.removeEventListener("resize", scheduleMeasure);
      globalThis.removeEventListener("scroll", scheduleMeasure, true);
      globalThis.visualViewport?.removeEventListener("resize", scheduleMeasure);
      globalThis.visualViewport?.removeEventListener("scroll", scheduleMeasure);
    };
  }, [anchor, author, body]);
''',
)

replace_once(
    "apps/web/src/domains/creator/live/StudioLiveCanvasOverlay.tsx",
    '''  // Always-on collab chrome: parent passes alwaysOn while connecting/ready (presence strip).
  if (!alwaysOn && !connected && peers.length === 0) return null;
  const lockCount =
''',
    '''  // Always-on collab chrome: parent passes alwaysOn while connecting/ready (presence strip).
  const lockCount =
''',
)

replace_once(
    "apps/web/src/domains/creator/live/StudioLiveCanvasOverlay.tsx",
    '''  const connectionLabel = studioPresenceConnectionLabel(connected);
  const resolvedSync = syncSnapshot ?? {
    ...INITIAL_STUDIO_LIVE_SYNC_SNAPSHOT,
    phase: connected && operationSyncReady ? "syncing" : connected ? "syncing" : "retrying",
    transportReady: connected,
    operationSyncReady,
    message: connected
      ? operationSyncReady
        ? "원고 보존 경로를 확인하는 중입니다."
        : "원고 연산 동기화를 준비하는 중입니다."
      : connectionLabel,
  };
  const syncPresentation = presentStudioLiveSyncSnapshot(resolvedSync);
''',
    '''  const connectionLabel = studioPresenceConnectionLabel(connected);
  const rawResolvedSync: StudioLiveSyncSnapshot = syncSnapshot ?? {
    ...INITIAL_STUDIO_LIVE_SYNC_SNAPSHOT,
    phase: connected && operationSyncReady ? "syncing" : connected ? "syncing" : "retrying",
    transportReady: connected,
    operationSyncReady,
    message: connected
      ? operationSyncReady
        ? "원고 보존 경로를 확인하는 중입니다."
        : "원고 연산 동기화를 준비하는 중입니다."
      : connectionLabel,
  };
  const resolvedSync = useStudioLiveDisplaySync(rawResolvedSync) ?? rawResolvedSync;
  if (!alwaysOn && !connected && peers.length === 0) return null;
  const syncPresentation = presentStudioLiveSyncSnapshot(resolvedSync);
''',
)

replace_once(
    "apps/web/src/domains/creator/live/StudioLiveCollaborationPanel.tsx",
    '''import { StudioLiveCollaborationCommandCenter } from "./StudioLiveCollaborationCommandCenter";
import { useStudioLiveCursorQuality } from "./use-studio-live-cursor-quality";
''',
    '''import { StudioLiveCollaborationCommandCenter } from "./StudioLiveCollaborationCommandCenter";
import { useStudioLiveCursorQuality } from "./use-studio-live-cursor-quality";
import { useStudioLiveDisplaySync } from "./use-studio-live-display-sync";
''',
)

replace_once(
    "apps/web/src/domains/creator/live/StudioLiveCollaborationPanel.tsx",
    '''  const syncPresentation = syncSnapshot
    ? presentStudioLiveSyncSnapshot(syncSnapshot)
    : null;
''',
    '''  const displaySyncSnapshot = useStudioLiveDisplaySync(syncSnapshot);
  const syncPresentation = displaySyncSnapshot
    ? presentStudioLiveSyncSnapshot(displaySyncSnapshot)
    : null;
''',
)

replace_once(
    "apps/web/src/domains/creator/live/StudioLiveCollaborationCommandCenter.tsx",
    '''import { studioLiveParticipantColor } from "./studio-live-canvas-overlay-model";

import type {
''',
    '''import { studioLiveParticipantColor } from "./studio-live-canvas-overlay-model";
import { useStudioLiveDisplaySync } from "./use-studio-live-display-sync";

import type {
''',
)

replace_once(
    "apps/web/src/domains/creator/live/StudioLiveCollaborationCommandCenter.tsx",
    '''import { cn } from "@/shared/lib/utils";
''',
    '''import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { cn } from "@/shared/lib/utils";
''',
)

replace_once(
    "apps/web/src/domains/creator/live/StudioLiveCollaborationCommandCenter.tsx",
    '''  const [copying, setCopying] = useState(false);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);

  useEffect(
''',
    '''  const [copying, setCopying] = useState(false);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const displaySyncSnapshot = useStudioLiveDisplaySync(syncSnapshot);
  const debouncedQuery = useDebouncedValue(query, 120);

  useEffect(
''',
)

replace_once(
    "apps/web/src/domains/creator/live/StudioLiveCollaborationCommandCenter.tsx",
    '''  const attention = projectStudioLiveCollaborationAttention({
    availability,
    mode,
    peers,
    screenState,
    syncSnapshot,
    recovery,
    followingSessionId,
  });
''',
    '''  const attention = projectStudioLiveCollaborationAttention({
    availability,
    mode,
    peers,
    screenState,
    syncSnapshot: displaySyncSnapshot,
    recovery,
    followingSessionId,
  });
''',
)

replace_once(
    "apps/web/src/domains/creator/live/StudioLiveCollaborationCommandCenter.tsx",
    '''      filterStudioLiveCollaborationPeers(
        peers,
        query,
        roleFilter,
        activeOnly,
        followingSessionId
      ),
    [activeOnly, followingSessionId, peers, query, roleFilter]
''',
    '''      filterStudioLiveCollaborationPeers(
        peers,
        debouncedQuery,
        roleFilter,
        activeOnly,
        followingSessionId
      ),
    [activeOnly, debouncedQuery, followingSessionId, peers, roleFilter]
''',
)

replace_once(
    "apps/web/src/domains/creator/live/StudioLiveCollaborationCommandCenter.tsx",
    '''  const syncValue = syncSnapshot
    ? syncSnapshot.pendingCount > 0
      ? syncSnapshot.pendingCount.toLocaleString("ko-KR")
      : syncSnapshot.phase === "synced"
        ? "안전"
        : "확인"
    : "대기";
  const syncDetail = syncSnapshot ? SYNC_PHASE_LABEL[syncSnapshot.phase] : "보호 상태 준비 중";
''',
    '''  const syncValue = displaySyncSnapshot
    ? displaySyncSnapshot.pendingCount > 0
      ? displaySyncSnapshot.pendingCount.toLocaleString("ko-KR")
      : displaySyncSnapshot.phase === "synced"
        ? "안전"
        : "확인"
    : "대기";
  const syncDetail = displaySyncSnapshot
    ? SYNC_PHASE_LABEL[displaySyncSnapshot.phase]
    : "보호 상태 준비 중";
''',
)

replace_once(
    "apps/web/src/domains/creator/StudioCc0AssetLibraryPanel.tsx",
    '''import type { StudioAsset } from "./studio-asset-library";

const PAGE_SIZE = 24;
''',
    '''import type { StudioAsset } from "./studio-asset-library";

import { useDebouncedValue } from "@/hooks/use-debounced-value";

const PAGE_SIZE = 24;
''',
)

replace_once(
    "apps/web/src/domains/creator/StudioCc0AssetLibraryPanel.tsx",
    '''  const [notice, setNotice] = useState("");
  const insertController = useRef<AbortController | null>(null);

  useEffect(() => {
''',
    '''  const [notice, setNotice] = useState("");
  const insertController = useRef<AbortController | null>(null);
  const debouncedQuery = useDebouncedValue(query, 140);

  useEffect(() => {
''',
)

replace_once(
    "apps/web/src/domains/creator/StudioCc0AssetLibraryPanel.tsx",
    '''  const filtered = useMemo(() => curateStudioCc0Selection(
    filterStudioCc0Assets(catalog ?? [], query, kind === "all" ? undefined : kind),
    {style, includeComponents},
  ), [catalog, query, kind, style, includeComponents]);
''',
    '''  const filtered = useMemo(() => curateStudioCc0Selection(
    filterStudioCc0Assets(catalog ?? [], debouncedQuery, kind === "all" ? undefined : kind),
    {style, includeComponents},
  ), [catalog, debouncedQuery, kind, style, includeComponents]);
''',
)

replace_once(
    "apps/web/src/domains/creator/StudioLeftToolRail.tsx",
    '''  useEffect(() => {
    if (!railMoreOpen) return;
    const dialog = railMoreDialogRef.current;
    const updatePosition = () => {
      const trigger = document.getElementById(railMoreTriggerId);
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const next = measureStudioRailMorePosition(
        rect,
        dialog?.getBoundingClientRect()
      );
      setRailMorePosition((current) =>
        current.left === next.left
        && current.top === next.top
        && current.maxHeight === next.maxHeight
          ? current
          : next
      );
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setRailMoreOpen(false);
      requestAnimationFrame(() => document.getElementById(railMoreTriggerId)?.focus());
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (dialog?.contains(target) || document.getElementById(railMoreTriggerId)?.contains(target)) return;
      setRailMoreOpen(false);
    };
    updatePosition();
    dialog?.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown, true);
    globalThis.addEventListener("resize", updatePosition);
    globalThis.addEventListener("scroll", updatePosition, true);
    globalThis.visualViewport?.addEventListener("resize", updatePosition);
    globalThis.visualViewport?.addEventListener("scroll", updatePosition);
    const frame = requestAnimationFrame(() => {
      dialog
        ?.querySelector<HTMLElement>('button:not([disabled]), [href], input:not([disabled])')
        ?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
      dialog?.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown, true);
      globalThis.removeEventListener("resize", updatePosition);
      globalThis.removeEventListener("scroll", updatePosition, true);
      globalThis.visualViewport?.removeEventListener("resize", updatePosition);
      globalThis.visualViewport?.removeEventListener("scroll", updatePosition);
    };
  }, [railMoreOpen, railMoreTriggerId, setRailMoreOpen]);
''',
    '''  useEffect(() => {
    if (!railMoreOpen) return;
    const dialog = railMoreDialogRef.current;
    let positionFrame: number | null = null;
    const updatePosition = () => {
      const trigger = document.getElementById(railMoreTriggerId);
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const next = measureStudioRailMorePosition(
        rect,
        dialog?.getBoundingClientRect()
      );
      setRailMorePosition((current) =>
        current.left === next.left
        && current.top === next.top
        && current.maxHeight === next.maxHeight
          ? current
          : next
      );
    };
    const schedulePosition = () => {
      if (positionFrame !== null) return;
      positionFrame = globalThis.requestAnimationFrame(() => {
        positionFrame = null;
        updatePosition();
      });
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setRailMoreOpen(false);
      requestAnimationFrame(() => document.getElementById(railMoreTriggerId)?.focus());
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (dialog?.contains(target) || document.getElementById(railMoreTriggerId)?.contains(target)) return;
      setRailMoreOpen(false);
    };
    updatePosition();
    dialog?.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown, true);
    globalThis.addEventListener("resize", schedulePosition);
    globalThis.addEventListener("scroll", schedulePosition, true);
    globalThis.visualViewport?.addEventListener("resize", schedulePosition);
    globalThis.visualViewport?.addEventListener("scroll", schedulePosition);
    const frame = requestAnimationFrame(() => {
      dialog
        ?.querySelector<HTMLElement>('button:not([disabled]), [href], input:not([disabled])')
        ?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
      if (positionFrame !== null) globalThis.cancelAnimationFrame(positionFrame);
      dialog?.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown, true);
      globalThis.removeEventListener("resize", schedulePosition);
      globalThis.removeEventListener("scroll", schedulePosition, true);
      globalThis.visualViewport?.removeEventListener("resize", schedulePosition);
      globalThis.visualViewport?.removeEventListener("scroll", schedulePosition);
    };
  }, [railMoreOpen, railMoreTriggerId, setRailMoreOpen]);
''',
)

replace_once(
    "apps/web/src/shared/components/back-to-top.tsx",
    '''  useEffect(() => {
    const onScroll = () => setVisible(globalThis.scrollY > SHOW_AFTER_PX);
    onScroll(); // 초기 위치 반영(딥링크로 중간에 진입한 경우)
    globalThis.addEventListener("scroll", onScroll, { passive: true });
    return () => globalThis.removeEventListener("scroll", onScroll);
  }, []);
''',
    '''  useEffect(() => {
    let scrollFrame: number | null = null;
    const updateVisibility = () => setVisible(globalThis.scrollY > SHOW_AFTER_PX);
    const onScroll = () => {
      if (scrollFrame !== null) return;
      scrollFrame = globalThis.requestAnimationFrame(() => {
        scrollFrame = null;
        updateVisibility();
      });
    };
    updateVisibility(); // 초기 위치 반영(딥링크로 중간에 진입한 경우)
    globalThis.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (scrollFrame !== null) globalThis.cancelAnimationFrame(scrollFrame);
      globalThis.removeEventListener("scroll", onScroll);
    };
  }, []);
''',
)

replace_once(
    "apps/web/src/domains/market/components/MarketDetailStickyBar.tsx",
    '''  useEffect(() => {
    const handleScroll = () => {
      // Show sticky bar when scrolled past 260px
      setVisible(window.scrollY > 260);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);
''',
    '''  useEffect(() => {
    let scrollFrame: number | null = null;
    const updateVisibility = () => {
      // Show sticky bar when scrolled past 260px
      setVisible(window.scrollY > 260);
    };
    const handleScroll = () => {
      if (scrollFrame !== null) return;
      scrollFrame = window.requestAnimationFrame(() => {
        scrollFrame = null;
        updateVisibility();
      });
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      if (scrollFrame !== null) window.cancelAnimationFrame(scrollFrame);
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);
''',
)
