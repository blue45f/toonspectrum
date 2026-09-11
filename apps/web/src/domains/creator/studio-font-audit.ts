export type StudioFontDestination = "webtoon" | "print" | "video" | "app" | "ebook" | "logo";
export type StudioFontPermission = "allowed" | "conditional" | "prohibited";

export interface StudioFontCoverageRange {
  readonly from: number;
  readonly to: number;
}

export interface StudioFontManifest {
  readonly id: string;
  readonly family: string;
  readonly source: string;
  readonly coverage: readonly StudioFontCoverageRange[];
  readonly permissions: Readonly<Record<StudioFontDestination, StudioFontPermission>>;
  readonly attributionRequired: boolean;
  readonly attributionText: string | null;
  readonly embeddingAllowed: boolean;
  readonly expiresAt: string | null;
}

export interface StudioFontTextRun {
  readonly id: string;
  readonly fontId: string;
  readonly text: string;
  readonly destination: StudioFontDestination;
  readonly embedsFont: boolean;
}

export interface StudioFontAuditFinding {
  readonly code: string;
  readonly severity: "warning" | "error";
  readonly runId: string;
  readonly fontId: string;
  readonly characters: readonly string[];
  readonly messageKo: string;
  readonly messageEn: string;
}

export interface StudioFontAuditReport {
  readonly status: "allowed" | "warning" | "blocked";
  readonly findings: readonly StudioFontAuditFinding[];
  readonly attributionTexts: readonly string[];
  readonly fontIds: readonly string[];
}

function covers(manifest: StudioFontManifest, codePoint: number): boolean {
  return manifest.coverage.some((range) => codePoint >= range.from && codePoint <= range.to);
}

function finding(
  code: string,
  severity: StudioFontAuditFinding["severity"],
  run: StudioFontTextRun,
  characters: readonly string[],
  messageKo: string,
  messageEn: string,
): StudioFontAuditFinding {
  return Object.freeze({
    code,
    severity,
    runId: run.id,
    fontId: run.fontId,
    characters: Object.freeze([...characters]),
    messageKo,
    messageEn,
  });
}

export function validateStudioFontManifests(
  manifests: readonly StudioFontManifest[],
): readonly string[] {
  const issues: string[] = [];
  const ids = manifests.map((manifest) => manifest.id);
  if (new Set(ids).size !== ids.length) issues.push("font-id-duplicate");
  for (const manifest of manifests) {
    if (!manifest.id.trim() || !manifest.family.trim() || !manifest.source.trim()) {
      issues.push("font-required");
    }
    if (manifest.coverage.length === 0
      || manifest.coverage.some((range) => !Number.isSafeInteger(range.from)
        || !Number.isSafeInteger(range.to)
        || range.from < 0
        || range.to < range.from)) {
      issues.push("font-coverage");
    }
    if (manifest.attributionRequired && !manifest.attributionText?.trim()) {
      issues.push("font-attribution");
    }
    if (manifest.expiresAt && !Number.isFinite(Date.parse(manifest.expiresAt))) {
      issues.push("font-expiry");
    }
  }
  return Object.freeze([...new Set(issues)]);
}

export function auditStudioFonts(input: {
  readonly manifests: readonly StudioFontManifest[];
  readonly runs: readonly StudioFontTextRun[];
  readonly now: string;
}): StudioFontAuditReport {
  if (validateStudioFontManifests(input.manifests).length > 0) {
    throw new Error("Valid font manifests are required.");
  }
  if (!Number.isFinite(Date.parse(input.now))) throw new Error("A valid audit time is required.");
  const byId = new Map(input.manifests.map((manifest) => [manifest.id, manifest]));
  const findings: StudioFontAuditFinding[] = [];
  const attributionTexts = new Set<string>();
  for (const run of input.runs) {
    if (!run.id.trim() || !run.fontId.trim() || !run.text.trim()) {
      throw new Error("Font text runs require ids, fonts and text.");
    }
    const manifest = byId.get(run.fontId);
    if (!manifest) {
      findings.push(finding("font-missing", "error", run, [], "글꼴을 사용할 수 없습니다.", "The font is unavailable."));
      continue;
    }
    const missingCharacters = [...new Set([...run.text]
      .filter((character) => !covers(manifest, character.codePointAt(0) ?? -1)))];
    if (missingCharacters.length > 0) {
      findings.push(finding("glyph-missing", "error", run, missingCharacters, "글꼴에 필요한 글자가 없습니다.", "The font is missing required glyphs."));
    }
    const permission = manifest.permissions[run.destination];
    if (permission === "prohibited") {
      findings.push(finding("font-license", "error", run, [], "현재 용도에서 이 글꼴을 사용할 수 없습니다.", "The font is not licensed for this destination."));
    } else if (permission === "conditional") {
      findings.push(finding("font-license-review", "warning", run, [], "글꼴 사용 조건을 확인하세요.", "Review the font usage conditions."));
    }
    if (run.embedsFont && !manifest.embeddingAllowed) {
      findings.push(finding("font-embedding", "error", run, [], "이 글꼴은 파일에 포함할 수 없습니다.", "The font cannot be embedded in the output."));
    }
    if (manifest.expiresAt && Date.parse(input.now) > Date.parse(manifest.expiresAt)) {
      findings.push(finding("font-expired", "error", run, [], "글꼴 사용 기간이 만료되었습니다.", "The font license has expired."));
    }
    if (manifest.attributionRequired && manifest.attributionText) {
      attributionTexts.add(manifest.attributionText);
    }
  }
  const blocked = findings.some((item) => item.severity === "error");
  const warning = findings.some((item) => item.severity === "warning");
  return Object.freeze({
    status: blocked ? "blocked" : warning ? "warning" : "allowed",
    findings: Object.freeze(findings),
    attributionTexts: Object.freeze([...attributionTexts].sort()),
    fontIds: Object.freeze([...new Set(input.runs.map((run) => run.fontId))].sort()),
  });
}
