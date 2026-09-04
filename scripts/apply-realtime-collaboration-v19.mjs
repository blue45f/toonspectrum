import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const block = (...lines) => lines.join("\n");

async function patchFile(relativePath, transform) {
  const path = resolve(root, relativePath);
  const before = await readFile(path, "utf8");
  const after = transform(before);
  if (after === before) {
    throw new Error("Patch produced no change: " + relativePath);
  }
  await writeFile(path, after);
}

function replaceOnce(source, matcher, replacement, label) {
  const matches = typeof matcher === "string"
    ? source.split(matcher).length - 1
    : [...source.matchAll(new RegExp(
        matcher.source,
        matcher.flags.includes("g") ? matcher.flags : matcher.flags + "g",
      ))].length;
  if (matches !== 1) {
    throw new Error(label + ": expected exactly one match, found " + matches);
  }
  return source.replace(matcher, replacement);
}

await patchFile(
  "src/domains/creator/live/StudioLiveCollaborationProvider.tsx",
  (source) => {
    source = replaceOnce(
      source,
      /      let roomModule: typeof import\(\s*"\.\/studio-live-collaboration-room"\s*\);\n      try \{\n        roomModule = await import\(\s*"\.\/studio-live-collaboration-room"\s*\);\n      \} catch \(cause\) \{/,
      block(
        '      let roomModule: typeof import("./studio-live-collaboration-room");',
        '      let adaptiveCursorModule: typeof import("./studio-live-adaptive-cursor-transport");',
        "      try {",
        "        [roomModule, adaptiveCursorModule] = await Promise.all([",
        '          import("./studio-live-collaboration-room"),',
        '          import("./studio-live-adaptive-cursor-transport"),',
        "        ]);",
        "      } catch (cause) {",
      ),
      "provider dynamic collaboration modules",
    );
    source = replaceOnce(
      source,
      "\n      let nextRoom: StudioLiveRoom;",
      "\n      let observedPeerCount = 0;\n      let nextRoom: StudioLiveRoom;",
      "provider peer counter",
    );
    source = replaceOnce(
      source,
      block(
        '          ...(transportPreference === "server" && transportFactory',
        "            ? { dependencies: { transportFactory } }",
        "            : {}),",
      ),
      block(
        "          dependencies: {",
        "            transportFactory: adaptiveCursorModule.createStudioAdaptiveCursorTransportFactory({",
        '              ...(transportPreference === "server" && transportFactory',
        "                ? { baseFactory: transportFactory }",
        "                : {}),",
        "              getPeerCount: () => observedPeerCount,",
        "            }),",
        "            cursorIntervalMs: adaptiveCursorModule.STUDIO_LIVE_CURSOR_CAPTURE_INTERVAL_MS,",
        "          },",
      ),
      "provider adaptive cursor dependency",
    );
    source = replaceOnce(
      source,
      block(
        '        if (event.type === "presence") {',
        "          setPeers(event.peers);",
      ),
      block(
        '        if (event.type === "presence") {',
        "          observedPeerCount = event.peers.length;",
        "          setPeers(event.peers);",
      ),
      "provider observed presence count",
    );
    source = replaceOnce(
      source,
      block(
        "          setPeers(nextRoom.getPeers());",
        "          setLocks(nextRoom.getLocks());",
      ),
      block(
        "          const readyPeers = nextRoom.getPeers();",
        "          observedPeerCount = readyPeers.length;",
        "          setPeers(readyPeers);",
        "          setLocks(nextRoom.getLocks());",
      ),
      "provider ready peer snapshot",
    );
    return source;
  },
);

await patchFile(
  "src/domains/creator/live/StudioLiveCanvasOverlay.tsx",
  (source) => {
    source = replaceOnce(
      source,
      block("  ExternalLink,", "  LoaderCircle,"),
      block("  ExternalLink,", "  Eye,", "  EyeOff,", "  LoaderCircle,"),
      "overlay eye icons",
    );
    source = replaceOnce(
      source,
      block("import {", "  planStudioCommentPinPreviewPosition,"),
      block(
        "import {",
        "  presentStudioLiveCursorQuality,",
        "  type StudioLiveCursorQualitySnapshot,",
        '} from "./studio-live-cursor-quality";',
        "import {",
        "  planStudioCommentPinPreviewPosition,",
      ),
      "overlay cursor quality import",
    );
    source = replaceOnce(
      source,
      block(
        'import { useStudioRemoteCursors } from "./studio-live-remote-cursor-store";',
        "import {",
      ),
      block(
        'import { useStudioRemoteCursors } from "./studio-live-remote-cursor-store";',
        'import { useStudioLiveCursorQuality } from "./use-studio-live-cursor-quality";',
        "import {",
        "  isStudioLiveCursorVisibilityShortcut,",
        "  isStudioLiveShortcutTextTarget,",
        "  toggleStudioLiveRemoteCursors,",
        "  useStudioLiveViewPreferences,",
        '} from "./studio-live-view-preferences";',
        "import {",
      ),
      "overlay collaboration preference imports",
    );
    source = replaceOnce(
      source,
      block(
        "  onToggleFollow: (sessionId: string) => void;",
        "  syncSnapshot?: StudioLiveSyncSnapshot;",
      ),
      block(
        "  onToggleFollow: (sessionId: string) => void;",
        "  remoteCursorsVisible?: boolean;",
        "  onToggleRemoteCursors?: () => void;",
        "  cursorQuality?: StudioLiveCursorQualitySnapshot | null;",
        "  syncSnapshot?: StudioLiveSyncSnapshot;",
      ),
      "presence dock cursor props",
    );
    source = replaceOnce(
      source,
      block(
        "  const { room } = useStudioLiveCollaboration();",
        "  const cursors = useStudioRemoteCursors(room);",
        "",
        "  if (hidden) return null;",
      ),
      block(
        "  const { room } = useStudioLiveCollaboration();",
        "  const { remoteCursorsVisible } = useStudioLiveViewPreferences();",
        "  const cursors = useStudioRemoteCursors(room);",
        "",
        "  if (hidden || !remoteCursorsVisible) return null;",
      ),
      "remote cursor visibility gate",
    );
    source = replaceOnce(
      source,
      block(
        "  onOpenCompanionTab,",
        "  onToggleFollow,",
        "  syncSnapshot,",
      ),
      block(
        "  onOpenCompanionTab,",
        "  onToggleFollow,",
        "  remoteCursorsVisible = true,",
        "  onToggleRemoteCursors,",
        "  cursorQuality = null,",
        "  syncSnapshot,",
      ),
      "presence dock cursor destructuring",
    );
    source = replaceOnce(
      source,
      block(
        "  const followedPeer = peers.find((peer) => peer.sessionId === followingSessionId) ?? null;",
        "",
        "  return (",
      ),
      block(
        "  const followedPeer = peers.find((peer) => peer.sessionId === followingSessionId) ?? null;",
        "  const cursorQualityPresentation = cursorQuality",
        "    ? presentStudioLiveCursorQuality(cursorQuality)",
        "    : null;",
        "",
        "  return (",
      ),
      "presence dock cursor quality presentation",
    );
    source = replaceOnce(
      source,
      block(
        "      <button",
        '        type="button"',
        '        aria-label={`${collaborationLabel} 팀 작업 공간 열기`}',
      ),
      block(
        "      {onToggleRemoteCursors ? (",
        "        <button",
        '          type="button"',
        '          aria-label={remoteCursorsVisible ? "팀원 커서 숨기기" : "팀원 커서 표시하기"}',
        "          aria-pressed={remoteCursorsVisible}",
        "          title={",
        "            remoteCursorsVisible",
        '              ? "팀원 커서 숨기기 · Ctrl/⌘+Alt+\\\\"',
        '              : "팀원 커서 표시하기 · Ctrl/⌘+Alt+\\\\"',
        "          }",
        '          data-studio-remote-cursor-visibility={remoteCursorsVisible ? "visible" : "hidden"}',
        '          className="hidden size-11 shrink-0 place-items-center rounded-lg border border-line/60 bg-card/80 text-fg-2 transition-colors duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent motion-reduce:transition-none sm:grid"',
        "          onClick={onToggleRemoteCursors}",
        "        >",
        "          {remoteCursorsVisible ? (",
        "            <Eye size={16} strokeWidth={1.75} aria-hidden />",
        "          ) : (",
        "            <EyeOff size={16} strokeWidth={1.75} aria-hidden />",
        "          )}",
        "        </button>",
        "      ) : null}",
        "      <button",
        '        type="button"',
        '        aria-label={`${collaborationLabel} 팀 작업 공간 열기`}',
      ),
      "presence dock cursor toggle",
    );
    source = replaceOnce(
      source,
      block("      </button>", "", "      {voiceControls}"),
      block(
        "      </button>",
        "",
        '      {cursorQuality && cursorQualityPresentation && cursorQuality.tier !== "live" ? (',
        "        <button",
        '          type="button"',
        '          aria-label={`${cursorQualityPresentation.detail} 팀 작업 공간 열기`}',
        "          title={cursorQualityPresentation.detail}",
        "          data-studio-cursor-quality={cursorQuality.tier}",
        "          className={cn(",
        '            "hidden min-h-11 max-w-44 items-center gap-1.5 rounded-full border px-2.5 text-[0.66rem] font-bold tabular-nums focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent xl:inline-flex",',
        "            syncToneClass(cursorQualityPresentation.tone)",
        "          )}",
        "          onClick={onOpenTeam}",
        "        >",
        '          <Radio size={13} className="shrink-0" aria-hidden />',
        '          <span className="truncate">',
        "            {cursorQualityPresentation.shortLabel} · {cursorQuality.cadenceMs}ms",
        "          </span>",
        "        </button>",
        "      ) : null}",
        "",
        "      {voiceControls}",
      ),
      "presence dock cursor quality chip",
    );
    source = replaceOnce(
      source,
      block(
        "  const { availability, peers, locks, sync, room } = live;",
        "  const followedPeer = peers.find((peer) => peer.sessionId === followingSessionId) ?? null;",
      ),
      block(
        "  const { availability, peers, locks, sync, room } = live;",
        "  const { remoteCursorsVisible } = useStudioLiveViewPreferences();",
        "  const cursorQuality = useStudioLiveCursorQuality(room?.workId ?? null);",
        "  const followedPeer = peers.find((peer) => peer.sessionId === followingSessionId) ?? null;",
      ),
      "connected dock cursor state",
    );
    source = replaceOnce(
      source,
      block(
        "  useEffect(() => {",
        "    if (followingSessionId && !followedPeer) onToggleFollow(followingSessionId);",
        "  }, [followedPeer, followingSessionId, onToggleFollow]);",
        "",
        "  if (!alwaysOn) return null;",
      ),
      block(
        "  useEffect(() => {",
        "    if (followingSessionId && !followedPeer) onToggleFollow(followingSessionId);",
        "  }, [followedPeer, followingSessionId, onToggleFollow]);",
        "",
        "  useEffect(() => {",
        '    if (typeof window === "undefined") return undefined;',
        "    const handleKeyDown = (event: KeyboardEvent) => {",
        "      if (",
        "        event.defaultPrevented",
        "        || event.repeat",
        "        || !isStudioLiveCursorVisibilityShortcut(event)",
        "        || isStudioLiveShortcutTextTarget(event.target)",
        "      ) return;",
        "      event.preventDefault();",
        "      toggleStudioLiveRemoteCursors();",
        "    };",
        '    window.addEventListener("keydown", handleKeyDown);',
        '    return () => window.removeEventListener("keydown", handleKeyDown);',
        "  }, []);",
        "",
        "  if (!alwaysOn) return null;",
      ),
      "connected dock cursor shortcut",
    );
    source = replaceOnce(
      source,
      block(
        "      onOpenTeam={onOpenTeam}",
        "      onToggleFollow={onToggleFollow}",
        "      syncSnapshot={sync}",
      ),
      block(
        "      onOpenTeam={onOpenTeam}",
        "      onToggleFollow={onToggleFollow}",
        "      remoteCursorsVisible={remoteCursorsVisible}",
        "      onToggleRemoteCursors={toggleStudioLiveRemoteCursors}",
        "      cursorQuality={cursorQuality}",
        "      syncSnapshot={sync}",
      ),
      "connected dock cursor props",
    );
    return source;
  },
);

await patchFile(
  "src/domains/creator/live/StudioLiveCollaborationPanel.tsx",
  (source) => {
    source = replaceOnce(
      source,
      block("  Eye,", "  LoaderCircle,"),
      block("  Eye,", "  EyeOff,", "  LoaderCircle,"),
      "panel eye-off icon",
    );
    source = replaceOnce(
      source,
      block(
        "import {",
        "  studioLiveParticipantColor,",
        '} from "./studio-live-canvas-overlay-model";',
      ),
      block(
        "import {",
        "  studioLiveParticipantColor,",
        '} from "./studio-live-canvas-overlay-model";',
        "import {",
        "  presentStudioLiveCursorQuality,",
        "  type StudioLiveCursorQualitySnapshot,",
        '} from "./studio-live-cursor-quality";',
      ),
      "panel cursor quality import",
    );
    source = replaceOnce(
      source,
      block("import {", "  formatStudioLiveLastAck,"),
      block(
        'import { useStudioLiveCursorQuality } from "./use-studio-live-cursor-quality";',
        "import {",
        "  toggleStudioLiveRemoteCursors,",
        "  useStudioLiveViewPreferences,",
        '} from "./studio-live-view-preferences";',
        "import {",
        "  formatStudioLiveLastAck,",
      ),
      "panel cursor preference imports",
    );
    source = replaceOnce(
      source,
      block(
        "  followingSessionId?: string | null;",
        "  videoRef?: Ref<HTMLVideoElement>;",
      ),
      block(
        "  followingSessionId?: string | null;",
        "  remoteCursorsVisible?: boolean;",
        "  cursorQuality?: StudioLiveCursorQualitySnapshot | null;",
        "  videoRef?: Ref<HTMLVideoElement>;",
      ),
      "panel cursor view props",
    );
    source = replaceOnce(
      source,
      block(
        "  onToggleFollow?: (sessionId: string) => void;",
        "  onApproveRequest:",
      ),
      block(
        "  onToggleFollow?: (sessionId: string) => void;",
        "  onToggleRemoteCursors?: () => void;",
        "  onApproveRequest:",
      ),
      "panel cursor action prop",
    );
    source = replaceOnce(
      source,
      block(
        "  recovery,",
        "  followingSessionId = null,",
        "  videoRef,",
      ),
      block(
        "  recovery,",
        "  followingSessionId = null,",
        "  remoteCursorsVisible = true,",
        "  cursorQuality = null,",
        "  videoRef,",
      ),
      "panel cursor view destructuring",
    );
    source = replaceOnce(
      source,
      block(
        "  onReloadAuthoritative,",
        "  onToggleFollow,",
        "  onApproveRequest,",
      ),
      block(
        "  onReloadAuthoritative,",
        "  onToggleFollow,",
        "  onToggleRemoteCursors,",
        "  onApproveRequest,",
      ),
      "panel cursor action destructuring",
    );
    source = replaceOnce(
      source,
      "  const renderedPeers = visibleLivePeers(peers, followingSessionId);\n",
      block(
        "  const renderedPeers = visibleLivePeers(peers, followingSessionId);",
        "  const cursorQualityPresentation = cursorQuality",
        "    ? presentStudioLiveCursorQuality(cursorQuality)",
        "    : null;",
        "",
      ),
      "panel cursor quality presentation",
    );
    source = replaceOnce(
      source,
      "      {syncSnapshot && syncPresentation ? (",
      block(
        "      {onToggleRemoteCursors ? (",
        "        <div",
        '          className="mt-3 rounded-xl border border-line bg-card/55 p-3"',
        '          data-studio-live-visual-controls="true"',
        "        >",
        '          <div className="flex items-center gap-3">',
        '            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">',
        "              {remoteCursorsVisible ? <Eye size={16} aria-hidden /> : <EyeOff size={16} aria-hidden />}",
        "            </span>",
        '            <div className="min-w-0 flex-1">',
        '              <p className="text-xs font-semibold text-fg">팀원 커서와 작업 위치</p>',
        '              <p className="mt-0.5 text-[0.68rem] leading-relaxed text-fg-3">',
        "                커서를 숨겨도 획·문서 변경·댓글·잠금 동기화는 계속됩니다. 단축키 Ctrl/⌘+Alt+\\",
        "              </p>",
        "            </div>",
        "            <button",
        '              type="button"',
        '              role="switch"',
        "              aria-checked={remoteCursorsVisible}",
        '              aria-label={remoteCursorsVisible ? "팀원 커서 숨기기" : "팀원 커서 표시하기"}',
        "              className={cn(",
        '                "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-card",',
        "                remoteCursorsVisible",
        '                  ? "border-accent/50 bg-accent-soft text-accent"',
        '                  : "border-line bg-card text-fg-2 hover:bg-raised"',
        "              )}",
        '              data-studio-remote-cursor-visibility={remoteCursorsVisible ? "visible" : "hidden"}',
        "              onClick={onToggleRemoteCursors}",
        "            >",
        "              {remoteCursorsVisible ? <Eye size={14} aria-hidden /> : <EyeOff size={14} aria-hidden />}",
        '              {remoteCursorsVisible ? "표시 중" : "숨김"}',
        "            </button>",
        "          </div>",
        "          {cursorQuality && cursorQualityPresentation ? (",
        "            <div",
        '              className="mt-2.5 border-t border-line/80 pt-2.5"',
        "              data-studio-cursor-quality-detail={cursorQuality.tier}",
        "            >",
        '              <div className="flex items-center justify-between gap-3 text-[0.7rem]">',
        '                <span className="font-semibold text-fg-2">{cursorQualityPresentation.shortLabel}</span>',
        '                <span className="shrink-0 font-semibold tabular-nums text-fg-3">',
        "                  {cursorQuality.cadenceMs}ms · 팀원 {cursorQuality.peerCount}명",
        "                </span>",
        "              </div>",
        '              <p className="mt-1 text-[0.68rem] leading-relaxed text-fg-3">',
        "                {cursorQualityPresentation.detail}",
        "              </p>",
        "            </div>",
        "          ) : null}",
        "        </div>",
        "      ) : null}",
        "",
        "      {syncSnapshot && syncPresentation ? (",
      ),
      "panel cursor controls",
    );
    source = replaceOnce(
      source,
      block(
        "}: StudioLiveCollaborationPanelProps) {",
        "  const live = useStudioLiveCollaboration();",
      ),
      block(
        "}: StudioLiveCollaborationPanelProps) {",
        "  const live = useStudioLiveCollaboration();",
        "  const { remoteCursorsVisible } = useStudioLiveViewPreferences();",
        "  const cursorQuality = useStudioLiveCursorQuality(live.room?.workId ?? null);",
      ),
      "panel cursor state hooks",
    );
    source = replaceOnce(
      source,
      block(
        "      recovery={live.recovery}",
        "      followingSessionId={followingSessionId}",
        "      mode={live.mode}",
      ),
      block(
        "      recovery={live.recovery}",
        "      followingSessionId={followingSessionId}",
        "      remoteCursorsVisible={remoteCursorsVisible}",
        "      cursorQuality={cursorQuality}",
        "      mode={live.mode}",
      ),
      "panel cursor view values",
    );
    source = replaceOnce(
      source,
      block(
        "      onToggleFollow={onToggleFollow}",
        "      onStopViewer={handleStopViewer}",
      ),
      block(
        "      onToggleFollow={onToggleFollow}",
        "      onToggleRemoteCursors={toggleStudioLiveRemoteCursors}",
        "      onStopViewer={handleStopViewer}",
      ),
      "panel cursor action value",
    );
    return source;
  },
);

console.log("Applied realtime collaboration V19 integration patches.");
