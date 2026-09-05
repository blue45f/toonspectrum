#!/usr/bin/env python3
"""One-shot, idempotent integration applicator for Studio finish-quality inspection."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(relative: str, old: str, new: str, marker: str) -> None:
    path = ROOT / relative
    text = path.read_text(encoding="utf-8")
    if marker in text:
        return
    if old not in text:
        raise RuntimeError(f"anchor not found in {relative}: {old[:120]!r}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    "src/domains/creator/StudioContinuityPanel.tsx",
    'import { useEffect } from "react";',
    'import { useEffect, useMemo } from "react";',
    "useEffect, useMemo",
)

replace_once(
    "src/domains/creator/StudioContinuityPanel.tsx",
    'import { createPortal } from "react-dom";\n\nimport type {',
    'import { createPortal } from "react-dom";\n\n'
    'import { StudioFinishQualityView } from "./StudioFinishQualityView";\n'
    'import {\n'
    '  inspectStudioFinishQuality,\n'
    '  serializeStudioFinishQualityReport,\n'
    '} from "./studio-finish-quality";\n\n'
    'import type { StudioCommentsDocument } from "./studio-comments";\n'
    'import type {',
    'from "./StudioFinishQualityView"',
)

replace_once(
    "src/domains/creator/StudioContinuityPanel.tsx",
    '} from "./studio-continuity";\n\nconst ISSUE_LABELS',
    '} from "./studio-continuity";\n'
    'import type { StudioFinishQualityIssue } from "./studio-finish-quality";\n'
    'import type { PageState } from "./studio-page-state";\n\n'
    'const ISSUE_LABELS',
    'StudioFinishQualityIssue } from "./studio-finish-quality"',
)

replace_once(
    "src/domains/creator/StudioContinuityPanel.tsx",
    '  /** 전달하면 장면 참조가 이동 버튼으로 렌더링됩니다. */\n'
    '  onSelectScene?: (sceneId: string) => void;\n'
    '}',
    '  /** 전달하면 장면 참조가 이동 버튼으로 렌더링됩니다. */\n'
    '  onSelectScene?: (sceneId: string) => void;\n'
    '  /** 최종 원고의 결정적 구조·품질 검사를 함께 표시합니다. */\n'
    '  qualityPages?: readonly PageState[];\n'
    '  qualityComments?: StudioCommentsDocument | null;\n'
    '  documentTitle?: string;\n'
    '  /** 문제를 누르면 해당 페이지·요소로 이동합니다. */\n'
    '  onSelectQualityIssue?: (issue: StudioFinishQualityIssue) => void;\n'
    '}',
    'qualityPages?: readonly PageState[]',
)

replace_once(
    "src/domains/creator/StudioContinuityPanel.tsx",
    '  scenes,\n'
    '  onSelectScene,\n'
    '}: StudioContinuityPanelProps) {\n'
    '  useEffect(() => {',
    '  scenes,\n'
    '  onSelectScene,\n'
    '  qualityPages,\n'
    '  qualityComments,\n'
    '  documentTitle,\n'
    '  onSelectQualityIssue,\n'
    '}: StudioContinuityPanelProps) {\n'
    '  const finishQualityResult = useMemo(\n'
    '    () =>\n'
    '      qualityPages\n'
    '        ? inspectStudioFinishQuality({\n'
    '            documentTitle,\n'
    '            pages: qualityPages,\n'
    '            comments: qualityComments,\n'
    '          })\n'
    '        : null,\n'
    '    [documentTitle, qualityComments, qualityPages]\n'
    '  );\n\n'
    '  useEffect(() => {',
    'const finishQualityResult = useMemo(',
)

replace_once(
    "src/domains/creator/StudioContinuityPanel.tsx",
    '              이야기 연속성 검사\n'
    '            </h2>\n'
    '            <p\n'
    '              id="studio-continuity-description"\n'
    '              className="mt-0.5 max-w-[70ch] text-xs leading-relaxed text-fg-2"\n'
    '            >\n'
    '              캐릭터 바이블과 장면 비트에 적힌 구조화 값만 정규화해 정확히 비교합니다. 자유문장의 의미를 추측하지 않아요.\n'
    '            </p>',
    '              마감 품질 · 이야기 연속성 검사\n'
    '            </h2>\n'
    '            <p\n'
    '              id="studio-continuity-description"\n'
    '              className="mt-0.5 max-w-[70ch] text-xs leading-relaxed text-fg-2"\n'
    '            >\n'
    '              원고 구조와 읽힘을 먼저 점검하고, 캐릭터 바이블과 장면 비트의 명시된 설정을 이어서 비교합니다. 창작 의도는 추측하지 않아요.\n'
    '            </p>',
    '마감 품질 · 이야기 연속성 검사',
)

replace_once(
    "src/domains/creator/StudioContinuityPanel.tsx",
    'aria-label="이야기 연속성 검사 닫기"',
    'aria-label="마감 품질·이야기 연속성 검사 닫기"',
    'aria-label="마감 품질·이야기 연속성 검사 닫기"',
)

quality_block = '''        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {finishQualityResult ? (
            <div className="mb-5">
              <StudioFinishQualityView
                result={finishQualityResult}
                onSelectIssue={onSelectQualityIssue}
                onDownloadReport={() => {
                  const safeTitle = (documentTitle?.trim() || "webtoon")
                    .normalize("NFKC")
                    .replace(/[^0-9A-Za-z가-힣._-]+/g, "-")
                    .replace(/^-+|-+$/g, "")
                    .slice(0, 80) || "webtoon";
                  const blob = new Blob(
                    [serializeStudioFinishQualityReport(finishQualityResult)],
                    { type: "application/json;charset=utf-8" }
                  );
                  const url = URL.createObjectURL(blob);
                  const anchor = document.createElement("a");
                  anchor.href = url;
                  anchor.download = `${safeTitle}-finish-quality.json`;
                  anchor.click();
                  URL.revokeObjectURL(url);
                }}
              />
            </div>
          ) : null}
          {finishQualityResult ? (
            <div className="mb-3 flex items-center gap-2" aria-hidden>
              <span className="h-px flex-1 bg-line" />
              <span className="text-[0.68rem] font-bold text-fg-3">이야기 연속성</span>
              <span className="h-px flex-1 bg-line" />
            </div>
          ) : null}'''
replace_once(
    "src/domains/creator/StudioContinuityPanel.tsx",
    '        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">',
    quality_block,
    'anchor.download = `${safeTitle}-finish-quality.json`',
)

replace_once(
    "src/domains/creator/StudioLazyPanelStack.tsx",
    '            issues={continuityIssues}\n'
    '            scenes={continuityScenes.map((scene) => ({ id: scene.id, label: scene.label }))}',
    '            issues={continuityIssues}\n'
    '            documentTitle={title}\n'
    '            qualityPages={pages}\n'
    '            qualityComments={studioComments}\n'
    '            onSelectQualityIssue={(issue) => {\n'
    '              if (issue.pageId) setCurrentPageId(issue.pageId);\n'
    '              if (issue.elementId) {\n'
    '                setTool("select");\n'
    '                setSelectedId(issue.elementId);\n'
    '              }\n'
    '              setContinuityOpen(false);\n'
    '            }}\n'
    '            scenes={continuityScenes.map((scene) => ({ id: scene.id, label: scene.label }))}',
    'qualityPages={pages}',
)

replace_once(
    "src/domains/creator/StudioProjectReviewActions.tsx",
    '      title: "캐릭터 바이블과 장면 비트를 비교해 인물·장소·시간·의상·소품의 불일치를 찾습니다.",',
    '      title: "원고 구조·대사·말풍선·이미지·레이어·검토 상태와 이야기 설정 불일치를 한 번에 점검합니다.",',
    '원고 구조·대사·말풍선·이미지·레이어·검토 상태',
)

replace_once(
    "src/domains/creator/StudioProjectReviewActions.tsx",
    '          타임라인 · 스토리보드 · 독자 시점 · 검토와 댓글',
    '          마감 품질 · 타임라인 · 독자 시점 · 검토와 댓글',
    '마감 품질 · 타임라인 · 독자 시점',
)

print("Studio finish-quality integration applied")
