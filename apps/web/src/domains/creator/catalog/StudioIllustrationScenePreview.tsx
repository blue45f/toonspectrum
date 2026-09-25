import { useEffect, useId, useMemo, useState, type ReactNode } from "react";

import type { SvgExportEl } from "../export/studio-svg-export-types";
import type { StudioSceneTemplateSummary } from "./studio-scene-template-summary";

import { resolveAssetUrl } from "@/shared/catalog/catalog-static";

/** 실제 내보내기 렌더러로 배경·말풍선·대사를 함께 표시한다. */
export function StudioIllustrationScenePreview({ summary, label, fallback }: {
  readonly summary: StudioSceneTemplateSummary;
  readonly label: string;
  readonly fallback: ReactNode;
}) {
  const [rendered, setRendered] = useState<{ summary: StudioSceneTemplateSummary; svg: string | null } | null>(null);
  const prefix = useId().replace(/[^a-zA-Z0-9-]/gu, "");
  useEffect(() => {
    let active = true;
    void import("../export/studio-svg-export").then(({ exportPageToSvg }) => {
      const elements: SvgExportEl[] = summary.seeds.map((seed, index) => ({
        ...seed,
        id: `preview-${index}`,
        ...(seed.type === "frame" && seed.bg ? { bg: resolveAssetUrl(seed.bg) } : {}),
      }));
      const result = exportPageToSvg({ width: summary.width, height: summary.height, elements, theme: "classic" });
      if (active) setRendered({ summary, svg: result.svg });
    }).catch(() => {
      if (active) setRendered({ summary, svg: null });
    });
    return () => { active = false; };
  }, [summary]);
  // 같은 목록의 여러 SVG가 서로의 클립·그라데이션 ID를 참조하지 않게 격리한다.
  const svg = rendered?.summary === summary ? rendered.svg : null;
  const markup = useMemo(() => svg
    ?.replace(/id="([^"]+)"/gu, `id="${prefix}-$1"`)
    .replace(/url\(#([^)]+)\)/gu, `url(#${prefix}-$1)`)
    .replace(/href="#([^"]+)"/gu, `href="#${prefix}-$1"`), [svg, prefix]);
  if (!markup) return <div className="size-full" aria-busy={rendered?.summary !== summary}>
    {fallback}
    <span className="sr-only">{rendered?.summary === summary ? "작화 미리보기를 불러오지 못해 구성도를 표시합니다." : "배경과 대사 미리보기를 불러오는 중입니다."}</span>
  </div>;
  // 문자열은 사용자 HTML이 아니라 escapeXml을 거친 자체 SVG 내보내기 결과다.
  return <div role="img" aria-label={`${label} · 배경과 편집 가능한 대사 미리보기`}
    data-studio-illustration-scene-preview="true"
    className="size-full [&>svg]:size-full [&>svg]:object-contain"
    dangerouslySetInnerHTML={{ __html: markup }} />;
}
