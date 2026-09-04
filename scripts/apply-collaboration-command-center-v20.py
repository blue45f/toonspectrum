from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    source = file.read_text(encoding="utf-8")
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one guarded match, found {count}")
    file.write_text(source.replace(old, new, 1), encoding="utf-8")


panel = "src/domains/creator/live/StudioLiveCollaborationPanel.tsx"
replace_once(
    panel,
    'import { useStudioLiveCursorQuality } from "./use-studio-live-cursor-quality";\n',
    'import { StudioLiveCollaborationCommandCenter } from "./StudioLiveCollaborationCommandCenter";\n'
    'import { useStudioLiveCursorQuality } from "./use-studio-live-cursor-quality";\n',
)
replace_once(
    panel,
    '''      </p>\n\n      {onToggleRemoteCursors ? (''',
    '''      </p>\n\n      <StudioLiveCollaborationCommandCenter\n        availability={availability}\n        mode={mode}\n        peers={peers}\n        chatMessages={chatMessages}\n        screenState={screenState}\n        syncSnapshot={syncSnapshot}\n        recovery={recovery}\n        followingSessionId={followingSessionId}\n        onToggleFollow={onToggleFollow}\n      />\n\n      {onToggleRemoteCursors ? (''',
)
replace_once(
    panel,
    '''        <div\n          className="mt-3 border-y border-line/80 py-3"\n          data-studio-sync-safety-detail={syncSnapshot.phase}\n        >''',
    '''        <div\n          id="studio-live-sync-section"\n          tabIndex={-1}\n          className="mt-3 scroll-mt-4 border-y border-line/80 py-3 outline-none"\n          data-studio-sync-safety-detail={syncSnapshot.phase}\n        >''',
)
replace_once(
    panel,
    '''      <div className="mt-3 rounded-xl border border-line bg-card/55 p-3">\n        <div className="flex items-center justify-between gap-3">\n          <div className="flex min-w-0 items-center gap-2">\n            <UsersRound className="shrink-0 text-accent"''',
    '''      <div\n        id="studio-live-people-section"\n        tabIndex={-1}\n        className="mt-3 scroll-mt-4 rounded-xl border border-line bg-card/55 p-3 outline-none"\n      >\n        <div className="flex items-center justify-between gap-3">\n          <div className="flex min-w-0 items-center gap-2">\n            <UsersRound className="shrink-0 text-accent"''',
)
replace_once(
    panel,
    '''      <div\n        aria-labelledby="studio-live-chat-title"\n        className="mt-3 rounded-xl border border-line bg-card/55 p-3"\n        data-studio-live-chat\n        role="group"\n      >''',
    '''      <div\n        id="studio-live-chat-section"\n        tabIndex={-1}\n        aria-labelledby="studio-live-chat-title"\n        className="mt-3 scroll-mt-4 rounded-xl border border-line bg-card/55 p-3 outline-none"\n        data-studio-live-chat\n        role="group"\n      >''',
)
replace_once(
    panel,
    '''      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">\n        {screenState.localSharing ? (''',
    '''      <div\n        id="studio-live-screen-section"\n        tabIndex={-1}\n        className="mt-3 grid scroll-mt-4 grid-cols-1 gap-2 outline-none sm:grid-cols-2"\n      >\n        {screenState.localSharing ? (''',
)

replace_once(
    "src/domains/creator/StudioTeamPanel.tsx",
    'commenter: { label: "검토자", description: "원고를 읽습니다. 서버 앵커 댓글은 다음 단계에서 연결됩니다." },',
    'commenter: { label: "검토자", description: "원고를 읽고 서버 앵커 댓글로 검토 의견을 남깁니다." },',
)

command_center = "src/domains/creator/live/StudioLiveCollaborationCommandCenter.tsx"
replace_once(
    command_center,
    'import {\n  AlertCircle,',
    '/* eslint-disable react-refresh/only-export-components -- command-center view models are intentionally unit-tested beside the component. */\nimport {\n  AlertCircle,',
)
replace_once(
    command_center,
    'import { useEffect, useId, useMemo, useRef, useState } from "react";',
    'import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";',
)
replace_once(command_center, "readonly icon: React.ReactNode;", "readonly icon: ReactNode;")
replace_once(
    command_center,
    '''  if ((recovery?.updateCount ?? 0) > 0) {\n    lines.push(`주의: 분리된 로컬 변경 ${recovery!.updateCount.toLocaleString("ko-KR")}개 복구 필요`);\n  }''',
    '''  if ((recovery?.updateCount ?? 0) > 0) {\n    const recoveryCount = recovery?.updateCount ?? 0;\n    lines.push(`주의: 분리된 로컬 변경 ${recoveryCount.toLocaleString("ko-KR")}개 복구 필요`);\n  }''',
)
replace_once(
    command_center,
    '''          {followedPeer\n            ? `${followedPeer.displayName} 따라가기 중지`\n            : activePeer\n              ? `${activePeer.displayName} 바로 따라가기`\n              : "따라갈 활성 탭 없음"}''',
    '''          {followedPeer\n            ? `집중 모드 종료 · ${followedPeer.displayName}`\n            : activePeer\n              ? `집중 모드 시작 · ${activePeer.displayName}`\n              : "집중할 활성 탭 없음"}''',
)
replace_once(
    command_center,
    'peer.visibility === "active" ? "활성 탭" : "백그라운드 탭"',
    'peer.visibility === "active" ? "활성 탭" : "유휴 탭"',
)

command_center_test = "src/domains/creator/live/StudioLiveCollaborationCommandCenter.test.tsx"
replace_once(
    command_center_test,
    '''        exportAvailable: true,\n        exported: false,\n      },''',
    '''        exportAvailable: true,\n        exported: false,\n        message: "복구 파일을 내보내 주세요.",\n      },''',
)
replace_once(
    command_center_test,
    '    expect(html).toContain("민호 따라가기 중지");',
    '    expect(html).toContain("집중 모드 종료 · 민호");',
)
replace_once(
    command_center_test,
    '  peer("viewer-id", "지우", { role: "viewer", visibility: "background" }),',
    '  peer("viewer-id", "지우", { role: "viewer", visibility: "idle" }),',
)
replace_once(
    command_center_test,
    '  peer("followed-id", "민호", { role: "editor", visibility: "background" }),',
    '  peer("followed-id", "민호", { role: "editor", visibility: "idle" }),',
)
