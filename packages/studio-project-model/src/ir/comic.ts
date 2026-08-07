import { z } from "zod";

import { pathIRSchema } from "./path";

/**
 * ComicGraphIR — the connected comic-production layer (V11.1 §10.2).
 *
 * Panels, balloons, tones and effect lines are one graph, not isolated tools:
 * reading order, panel masks and dialogue-character links are first-class so
 * the workflow "컷 생성 → 컷 폴더·마스크 → 말풍선 독서 순서 → 대사·캐릭터 연결
 * → 톤·효과선 컷 경계 인식 → 규격별 출력" validates structurally instead of
 * by convention.
 */

export const comicPanelIRSchema = z.object({
  id: z.string().min(1),
  /** Panel boundary in page space; also the default clip mask. */
  shape: pathIRSchema,
  /** Layer-folder id that panel-scoped content lives under. */
  folderId: z.string().min(1),
  /** True when panel content clips at the panel boundary (tone/effect aware). */
  masksContent: z.boolean().default(true),
  /** 0-based reading position within the page. */
  readingOrder: z.number().int().nonnegative(),
});
export type ComicPanelIR = z.infer<typeof comicPanelIRSchema>;

export const comicBalloonIRSchema = z.object({
  id: z.string().min(1),
  /** Panel this balloon reads inside; tail may point outside. */
  panelId: z.string().min(1),
  shape: pathIRSchema,
  tail: pathIRSchema.nullable().default(null),
  /** Dialogue text node id (TextIR lives in the scene layer). */
  textNodeId: z.string().nullable().default(null),
  /** Speaking character id for script/translation tooling. */
  characterId: z.string().nullable().default(null),
  /** 0-based reading position within the panel. */
  readingOrder: z.number().int().nonnegative(),
});
export type ComicBalloonIR = z.infer<typeof comicBalloonIRSchema>;

export const comicToneIRSchema = z.object({
  id: z.string().min(1),
  /** Bound panel; tones respect panel boundaries (§10.2). */
  panelId: z.string().min(1),
  region: pathIRSchema,
  /** Screen-tone recipe: lines-per-inch, dot angle and density. */
  lpi: z.number().positive(),
  angleDeg: z.number().min(0).max(180),
  density: z.number().min(0).max(1),
});
export type ComicToneIR = z.infer<typeof comicToneIRSchema>;

export const comicEffectLineIRSchema = z.object({
  id: z.string().min(1),
  panelId: z.string().min(1),
  kind: z.enum(["speed", "focus", "flash"]),
  /** Focus/vanishing center in page space. */
  center: z.tuple([z.number(), z.number()]),
  strokeCount: z.number().int().positive(),
  seed: z.number().int().nonnegative(),
});
export type ComicEffectLineIR = z.infer<typeof comicEffectLineIRSchema>;

export const comicPageIRSchema = z.object({
  id: z.string().min(1),
  widthPx: z.number().int().positive(),
  heightPx: z.number().int().positive(),
  panels: z.array(comicPanelIRSchema),
  balloons: z.array(comicBalloonIRSchema),
  tones: z.array(comicToneIRSchema).default([]),
  effectLines: z.array(comicEffectLineIRSchema).default([]),
});
export type ComicPageIR = z.infer<typeof comicPageIRSchema>;

export const comicExportProfileIRSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["page", "spread", "webtoon-strip"]),
  widthPx: z.number().int().positive(),
  /** Strip export slices pages vertically; page export is 1:1. */
  maxSliceHeightPx: z.number().int().positive().nullable().default(null),
});
export type ComicExportProfileIR = z.infer<typeof comicExportProfileIRSchema>;

export const comicGraphIRSchema = z.object({
  version: z.literal(1),
  pages: z.array(comicPageIRSchema),
  characters: z
    .array(z.object({ id: z.string().min(1), name: z.string().min(1) }))
    .default([]),
  exportProfiles: z.array(comicExportProfileIRSchema).default([]),
});
export type ComicGraphIR = z.infer<typeof comicGraphIRSchema>;

export interface ComicGraphIssue {
  pageId: string | null;
  entityId: string | null;
  message: string;
}

/**
 * Structural validation: unique ids, resolvable panel/character references and
 * contiguous 0..n-1 reading orders per page and per panel. Rendering-level
 * checks (mask coverage, tail geometry) belong to providers.
 */
export function validateComicGraph(graph: ComicGraphIR): ComicGraphIssue[] {
  const issues: ComicGraphIssue[] = [];
  const characterIds = new Set(graph.characters.map((character) => character.id));

  for (const page of graph.pages) {
    const panelIds = new Set<string>();
    for (const panel of page.panels) {
      if (panelIds.has(panel.id)) {
        issues.push({
          pageId: page.id,
          entityId: panel.id,
          message: `duplicate panel id: ${panel.id}`,
        });
      }
      panelIds.add(panel.id);
    }

    const panelOrder = page.panels.map((panel) => panel.readingOrder).sort((a, b) => a - b);
    if (!panelOrder.every((value, index) => value === index)) {
      issues.push({
        pageId: page.id,
        entityId: null,
        message: `panel reading order must be a contiguous 0..${page.panels.length - 1} sequence`,
      });
    }

    const balloonOrdersByPanel = new Map<string, number[]>();
    for (const balloon of page.balloons) {
      if (!panelIds.has(balloon.panelId)) {
        issues.push({
          pageId: page.id,
          entityId: balloon.id,
          message: `balloon ${balloon.id} references unknown panel ${balloon.panelId}`,
        });
        continue;
      }
      if (balloon.characterId !== null && !characterIds.has(balloon.characterId)) {
        issues.push({
          pageId: page.id,
          entityId: balloon.id,
          message: `balloon ${balloon.id} references unknown character ${balloon.characterId}`,
        });
      }
      const orders = balloonOrdersByPanel.get(balloon.panelId) ?? [];
      orders.push(balloon.readingOrder);
      balloonOrdersByPanel.set(balloon.panelId, orders);
    }
    for (const [panelId, orders] of balloonOrdersByPanel) {
      const sorted = [...orders].sort((a, b) => a - b);
      if (!sorted.every((value, index) => value === index)) {
        issues.push({
          pageId: page.id,
          entityId: panelId,
          message: `balloon reading order in panel ${panelId} must be contiguous from 0`,
        });
      }
    }

    for (const tone of page.tones) {
      if (!panelIds.has(tone.panelId)) {
        issues.push({
          pageId: page.id,
          entityId: tone.id,
          message: `tone ${tone.id} references unknown panel ${tone.panelId}`,
        });
      }
    }
    for (const effectLine of page.effectLines) {
      if (!panelIds.has(effectLine.panelId)) {
        issues.push({
          pageId: page.id,
          entityId: effectLine.id,
          message: `effect line ${effectLine.id} references unknown panel ${effectLine.panelId}`,
        });
      }
    }
  }
  return issues;
}

/** Panels of a page in reading order — the canonical traversal for export. */
export function panelsInReadingOrder(page: ComicPageIR): ComicPanelIR[] {
  return [...page.panels].sort((a, b) => a.readingOrder - b.readingOrder);
}
