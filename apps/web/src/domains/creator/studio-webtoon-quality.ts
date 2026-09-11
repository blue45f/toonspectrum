export type StudioWebtoonQualitySeverity = "info" | "warning" | "error";
export type StudioWebtoonBalloonKind = "dialogue" | "thought" | "shout" | "narration" | "sfx";

export interface StudioWebtoonRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface StudioWebtoonCutMetric {
  readonly id: string;
  readonly sceneId: string;
  readonly bounds: StudioWebtoonRect;
  readonly faceRects: readonly StudioWebtoonRect[];
  readonly dialogueCharacterCount: number;
  readonly balloonCount: number;
  readonly importance: number;
}

export interface StudioWebtoonBalloonMetric {
  readonly id: string;
  readonly cutId: string;
  readonly kind: StudioWebtoonBalloonKind;
  readonly speakerId?: string;
  readonly bounds: StudioWebtoonRect;
  readonly text: string;
  readonly fontSize: number;
  readonly minimumFontSize: number;
  readonly readingOrder: number | null;
  readonly anchor?: Readonly<{ x: number; y: number }>;
}

export interface StudioWebtoonReaderViewport {
  readonly width: number;
  readonly height: number;
  readonly safeInsetTop: number;
  readonly safeInsetBottom: number;
}

export interface StudioWebtoonQualityFinding {
  readonly code: string;
  readonly severity: StudioWebtoonQualitySeverity;
  readonly targetIds: readonly string[];
  readonly messageKo: string;
  readonly messageEn: string;
}

export interface StudioWebtoonRhythmSample {
  readonly cutId: string;
  readonly gapBefore: number;
  readonly viewportCoverage: number;
  readonly textDensity: number;
  readonly faceScale: number;
  readonly estimatedReadSeconds: number;
}

export interface StudioWebtoonQualityReport {
  readonly findings: readonly StudioWebtoonQualityFinding[];
  readonly rhythm: readonly StudioWebtoonRhythmSample[];
  readonly blockingCount: number;
  readonly warningCount: number;
  readonly score: number;
}

export interface StudioDialogueSource {
  readonly id: string;
  readonly cutId: string;
  readonly speakerId?: string;
  readonly kind: StudioWebtoonBalloonKind;
  readonly text: string;
  readonly revision: number;
}

export interface StudioDialogueBalloonLink {
  readonly dialogueId: string;
  readonly balloonId: string;
  readonly sourceRevision: number;
  readonly localTextOverride: string | null;
}

export interface StudioDialogueSyncResult {
  readonly text: string;
  readonly nextLink: StudioDialogueBalloonLink;
  readonly conflict: boolean;
  readonly reason?: "source-and-local-changed" | "missing-source";
}

export interface StudioBalloonPlacementRequest {
  readonly id: string;
  readonly cut: StudioWebtoonRect;
  readonly size: Readonly<{ width: number; height: number }>;
  readonly preferredAnchor?: Readonly<{ x: number; y: number }>;
  readonly occupied: readonly StudioWebtoonRect[];
  readonly margin: number;
}

export interface StudioBalloonPlacement {
  readonly id: string;
  readonly bounds: StudioWebtoonRect;
  readonly score: number;
  readonly overlaps: readonly number[];
}

function finiteNonNegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function validRect(rect: StudioWebtoonRect): boolean {
  return finiteNonNegative(rect.x)
    && finiteNonNegative(rect.y)
    && Number.isFinite(rect.width)
    && Number.isFinite(rect.height)
    && rect.width > 0
    && rect.height > 0;
}

function intersectArea(a: StudioWebtoonRect, b: StudioWebtoonRect): number {
  const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return width * height;
}

function contains(container: StudioWebtoonRect, child: StudioWebtoonRect): boolean {
  return child.x >= container.x
    && child.y >= container.y
    && child.x + child.width <= container.x + container.width
    && child.y + child.height <= container.y + container.height;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finding(
  code: string,
  severity: StudioWebtoonQualitySeverity,
  targetIds: readonly string[],
  messageKo: string,
  messageEn: string,
): StudioWebtoonQualityFinding {
  return Object.freeze({ code, severity, targetIds: Object.freeze([...targetIds]), messageKo, messageEn });
}

/** Analyze scroll pacing, mobile readability, balloon order, and cut composition without changing artwork. */
export function analyzeStudioWebtoonQuality(input: {
  readonly cuts: readonly StudioWebtoonCutMetric[];
  readonly balloons: readonly StudioWebtoonBalloonMetric[];
  readonly viewport: StudioWebtoonReaderViewport;
}): StudioWebtoonQualityReport {
  const { cuts, balloons, viewport } = input;
  if (!finiteNonNegative(viewport.safeInsetTop)
    || !finiteNonNegative(viewport.safeInsetBottom)
    || viewport.width <= 0
    || viewport.height <= 0) {
    throw new Error("A valid reader viewport is required.");
  }
  const ids = new Set<string>();
  for (const cut of cuts) {
    if (!cut.id.trim() || ids.has(cut.id) || !validRect(cut.bounds)) throw new Error("Cuts require unique ids and valid bounds.");
    ids.add(cut.id);
  }
  const cutMap = new Map(cuts.map((cut) => [cut.id, cut]));
  const findings: StudioWebtoonQualityFinding[] = [];
  const orderedCuts = [...cuts].sort((a, b) => a.bounds.y - b.bounds.y || a.id.localeCompare(b.id));
  const rhythm: StudioWebtoonRhythmSample[] = [];

  let previousBottom = 0;
  let previousSceneId: string | null = null;
  for (const cut of orderedCuts) {
    const gapBefore = Math.max(0, cut.bounds.y - previousBottom);
    const viewportCoverage = cut.bounds.height / viewport.height;
    const textDensity = cut.dialogueCharacterCount / Math.max(1, cut.bounds.width * cut.bounds.height / 10000);
    const faceScale = cut.faceRects.length === 0
      ? 0
      : Math.max(...cut.faceRects.map((face) => face.height / viewport.height));
    const estimatedReadSeconds = Math.round((1.1 + cut.dialogueCharacterCount / 15 + viewportCoverage * 0.7) * 10) / 10;
    rhythm.push(Object.freeze({
      cutId: cut.id,
      gapBefore,
      viewportCoverage: Math.round(viewportCoverage * 1000) / 1000,
      textDensity: Math.round(textDensity * 1000) / 1000,
      faceScale: Math.round(faceScale * 1000) / 1000,
      estimatedReadSeconds,
    }));

    if (textDensity > 28) {
      findings.push(finding(
        "dense-dialogue",
        "warning",
        [cut.id],
        "한 화면에 읽어야 할 대사가 많습니다. 컷을 나누거나 여백을 늘려 보세요.",
        "This area contains a high amount of dialogue. Consider splitting the panel or adding breathing room.",
      ));
    }
    if (previousSceneId !== null && previousSceneId !== cut.sceneId && gapBefore < viewport.height * 0.12) {
      findings.push(finding(
        "scene-transition-tight",
        "warning",
        [cut.id],
        "장면 전환 여백이 짧아 독자가 전환을 놓칠 수 있습니다.",
        "The scene transition gap is short and may be easy to miss.",
      ));
    }
    for (const face of cut.faceRects) {
      const viewportBoundaryY = Math.round(face.y / viewport.height) * viewport.height;
      if (Math.abs(face.y - viewportBoundaryY) < face.height * 0.2) {
        findings.push(finding(
          "face-near-viewport-edge",
          "info",
          [cut.id],
          "중요한 얼굴이 독자 화면 경계에 걸릴 수 있습니다.",
          "An important face may land near a reader viewport boundary.",
        ));
        break;
      }
    }
    previousBottom = Math.max(previousBottom, cut.bounds.y + cut.bounds.height);
    previousSceneId = cut.sceneId;
  }

  const ordersByCut = new Map<string, number[]>();
  for (const balloon of balloons) {
    const cut = cutMap.get(balloon.cutId);
    if (!balloon.id.trim() || !cut || !validRect(balloon.bounds)) {
      findings.push(finding("balloon-invalid", "error", [balloon.id], "말풍선 위치 정보를 확인하세요.", "Check the balloon placement data."));
      continue;
    }
    if (!contains(cut.bounds, balloon.bounds)) {
      findings.push(finding("balloon-outside-cut", "warning", [balloon.id, cut.id], "말풍선이 컷 밖으로 나가 있습니다.", "The balloon extends outside its panel."));
    }
    if (balloon.fontSize < balloon.minimumFontSize) {
      findings.push(finding("balloon-font-small", "error", [balloon.id], "말풍선 글자가 최소 권장 크기보다 작습니다.", "Balloon text is smaller than the recommended minimum."));
    }
    if (balloon.readingOrder === null) {
      findings.push(finding("reading-order-missing", "error", [balloon.id], "말풍선 읽기 순서를 지정해 주세요.", "Assign a reading order to this balloon."));
    } else {
      const values = ordersByCut.get(balloon.cutId) ?? [];
      values.push(balloon.readingOrder);
      ordersByCut.set(balloon.cutId, values);
    }
  }
  for (const [cutId, orders] of ordersByCut) {
    if (new Set(orders).size !== orders.length) {
      findings.push(finding("reading-order-duplicate", "error", [cutId], "같은 컷에서 말풍선 읽기 순서가 겹칩니다.", "Balloon reading order is duplicated within this panel."));
    }
  }

  for (let a = 0; a < balloons.length; a += 1) {
    for (let b = a + 1; b < balloons.length; b += 1) {
      const first = balloons[a];
      const second = balloons[b];
      if (!first || !second || first.cutId !== second.cutId) continue;
      const overlap = intersectArea(first.bounds, second.bounds);
      const smaller = Math.min(first.bounds.width * first.bounds.height, second.bounds.width * second.bounds.height);
      if (smaller > 0 && overlap / smaller > 0.08) {
        findings.push(finding("balloon-overlap", "warning", [first.id, second.id], "말풍선이 서로 많이 겹칩니다.", "Balloon shapes overlap substantially."));
      }
    }
  }

  const blockingCount = findings.filter((item) => item.severity === "error").length;
  const warningCount = findings.filter((item) => item.severity === "warning").length;
  const score = clamp(100 - blockingCount * 15 - warningCount * 5, 0, 100);
  return Object.freeze({
    findings: Object.freeze(findings),
    rhythm: Object.freeze(rhythm),
    blockingCount,
    warningCount,
    score,
  });
}

/** Synchronize one linked balloon while preserving intentional local lettering edits. */
export function synchronizeStudioDialogueBalloon(
  source: StudioDialogueSource | null,
  link: StudioDialogueBalloonLink,
  currentBalloonText: string,
): StudioDialogueSyncResult {
  if (!source || source.id !== link.dialogueId) {
    return Object.freeze({ text: currentBalloonText, nextLink: link, conflict: true, reason: "missing-source" });
  }
  const sourceChanged = source.revision !== link.sourceRevision;
  const localChanged = link.localTextOverride !== null && currentBalloonText !== link.localTextOverride;
  if (sourceChanged && localChanged) {
    return Object.freeze({ text: currentBalloonText, nextLink: link, conflict: true, reason: "source-and-local-changed" });
  }
  if (!sourceChanged) {
    return Object.freeze({ text: currentBalloonText, nextLink: link, conflict: false });
  }
  const text = source.text;
  return Object.freeze({
    text,
    conflict: false,
    nextLink: Object.freeze({ ...link, sourceRevision: source.revision, localTextOverride: null }),
  });
}

/** Produce a deterministic, non-destructive balloon placement candidate inside one cut. */
export function placeStudioBalloon(request: StudioBalloonPlacementRequest): StudioBalloonPlacement {
  if (!validRect(request.cut)
    || request.size.width <= 0
    || request.size.height <= 0
    || request.margin < 0) {
    throw new Error("A valid balloon placement request is required.");
  }
  const inner = {
    x: request.cut.x + request.margin,
    y: request.cut.y + request.margin,
    width: Math.max(1, request.cut.width - request.margin * 2),
    height: Math.max(1, request.cut.height - request.margin * 2),
  };
  const anchor = request.preferredAnchor ?? {
    x: inner.x + inner.width / 2,
    y: inner.y + inner.height * 0.25,
  };
  const candidates: StudioWebtoonRect[] = [];
  const offsets = [
    [0, -1], [1, -1], [-1, -1], [0, 0], [1, 0], [-1, 0], [0, 1], [1, 1], [-1, 1],
  ] as const;
  for (const [ox, oy] of offsets) {
    const x = clamp(anchor.x - request.size.width / 2 + ox * request.size.width * 0.65, inner.x, inner.x + inner.width - request.size.width);
    const y = clamp(anchor.y - request.size.height / 2 + oy * request.size.height * 0.65, inner.y, inner.y + inner.height - request.size.height);
    candidates.push({ x, y, width: request.size.width, height: request.size.height });
  }

  let best = candidates[0]!;
  let bestScore = Number.POSITIVE_INFINITY;
  let bestOverlaps: number[] = [];
  for (const candidate of candidates) {
    const overlaps = request.occupied.map((rect) => intersectArea(candidate, rect));
    const overlapPenalty = overlaps.reduce((sum, value) => sum + value, 0);
    const centerX = candidate.x + candidate.width / 2;
    const centerY = candidate.y + candidate.height / 2;
    const anchorDistance = Math.hypot(centerX - anchor.x, centerY - anchor.y);
    const score = overlapPenalty * 100 + anchorDistance;
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
      bestOverlaps = overlaps;
    }
  }
  return Object.freeze({
    id: request.id,
    bounds: Object.freeze(best),
    score: Math.round(bestScore * 100) / 100,
    overlaps: Object.freeze(bestOverlaps),
  });
}
