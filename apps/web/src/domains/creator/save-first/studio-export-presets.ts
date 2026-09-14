export type StudioExportImageFormat = "jpg" | "png" | "gif" | "webp";

export interface StudioExportPreset {
  readonly id: string;
  readonly platform: string;
  readonly labelKo: string;
  readonly version: string;
  readonly verifiedAt: string;
  readonly exactWidth?: number;
  readonly maxWidth?: number;
  readonly maxHeight?: number;
  readonly maxFileBytes?: number;
  readonly maxTotalBytes?: number;
  readonly formats: readonly StudioExportImageFormat[];
  readonly thumbnail?: Readonly<{ width: number; height: number }>;
  readonly namingPattern: string;
}

export interface StudioExportCandidateFile {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  readonly format: StudioExportImageFormat;
}

export interface StudioExportValidationIssue {
  readonly code:
    | "width"
    | "height"
    | "file-size"
    | "total-size"
    | "format"
    | "empty";
  readonly severity: "error" | "warning";
  readonly fileName: string | null;
  readonly message: string;
}

export interface StudioExportValidationResult {
  readonly valid: boolean;
  readonly totalBytes: number;
  readonly issues: readonly StudioExportValidationIssue[];
}

const MB = 1024 * 1024;

export const STUDIO_EXPORT_PRESETS: readonly StudioExportPreset[] = Object.freeze([
  {
    id: "generic-webtoon",
    platform: "generic",
    labelKo: "범용 세로 웹툰",
    version: "2026.09",
    verifiedAt: "2026-09-15",
    maxWidth: 2_000,
    maxHeight: 20_000,
    maxFileBytes: 20 * MB,
    formats: ["jpg", "png", "webp"],
    namingPattern: "{episode}-{index}",
  },
  {
    id: "naver-challenge",
    platform: "naver-challenge",
    labelKo: "네이버 도전만화",
    version: "2026.09",
    verifiedAt: "2026-09-15",
    exactWidth: 690,
    maxFileBytes: 5 * MB,
    maxTotalBytes: 50 * MB,
    formats: ["jpg", "png", "gif"],
    namingPattern: "{episode}-{index}",
  },
  {
    id: "tapas-comic",
    platform: "tapas",
    labelKo: "Tapas 에피소드",
    version: "2026.09",
    verifiedAt: "2026-09-15",
    exactWidth: 940,
    maxFileBytes: 10 * MB,
    formats: ["jpg", "png", "gif"],
    thumbnail: { width: 300, height: 300 },
    namingPattern: "{episode}-{index}",
  },
  {
    id: "globalcomix",
    platform: "globalcomix",
    labelKo: "GlobalComix",
    version: "2026.09",
    verifiedAt: "2026-09-15",
    maxWidth: 4_000,
    maxFileBytes: 25 * MB,
    formats: ["jpg", "png"],
    namingPattern: "{episode}-{index}",
  },
]);

export function studioExportPreset(id: string): StudioExportPreset | null {
  return STUDIO_EXPORT_PRESETS.find((preset) => preset.id === id) ?? null;
}

export function validateStudioExport(
  preset: StudioExportPreset,
  files: readonly StudioExportCandidateFile[],
): StudioExportValidationResult {
  const issues: StudioExportValidationIssue[] = [];
  if (files.length === 0) {
    issues.push({
      code: "empty",
      severity: "error",
      fileName: null,
      message: "내보낼 페이지가 없습니다.",
    });
  }

  let totalBytes = 0;
  for (const file of files) {
    totalBytes += Math.max(0, file.bytes);
    if (!preset.formats.includes(file.format)) {
      issues.push({
        code: "format",
        severity: "error",
        fileName: file.name,
        message: `${file.name}: ${file.format.toUpperCase()} 형식은 이 프리셋에서 허용되지 않습니다.`,
      });
    }
    if (preset.exactWidth !== undefined && file.width !== preset.exactWidth) {
      issues.push({
        code: "width",
        severity: "error",
        fileName: file.name,
        message: `${file.name}: 가로 ${preset.exactWidth}px로 변환해야 합니다.`,
      });
    } else if (preset.maxWidth !== undefined && file.width > preset.maxWidth) {
      issues.push({
        code: "width",
        severity: "error",
        fileName: file.name,
        message: `${file.name}: 가로 크기가 최대 ${preset.maxWidth}px를 초과합니다.`,
      });
    }
    if (preset.maxHeight !== undefined && file.height > preset.maxHeight) {
      issues.push({
        code: "height",
        severity: "warning",
        fileName: file.name,
        message: `${file.name}: 세로 ${preset.maxHeight}px 이하로 안전하게 분할하세요.`,
      });
    }
    if (preset.maxFileBytes !== undefined && file.bytes > preset.maxFileBytes) {
      issues.push({
        code: "file-size",
        severity: "error",
        fileName: file.name,
        message: `${file.name}: 파일 용량 제한을 초과합니다.`,
      });
    }
  }
  if (preset.maxTotalBytes !== undefined && totalBytes > preset.maxTotalBytes) {
    issues.push({
      code: "total-size",
      severity: "error",
      fileName: null,
      message: "전체 에피소드 파일 용량 제한을 초과합니다.",
    });
  }

  return Object.freeze({
    valid: !issues.some((issue) => issue.severity === "error"),
    totalBytes,
    issues: Object.freeze(issues),
  });
}

export function studioExportFileName(
  preset: StudioExportPreset,
  input: { readonly episode: number; readonly index: number; readonly extension: StudioExportImageFormat },
): string {
  const episode = String(Math.max(0, Math.trunc(input.episode))).padStart(3, "0");
  const index = String(Math.max(1, Math.trunc(input.index))).padStart(3, "0");
  return `${preset.namingPattern
    .replace("{episode}", episode)
    .replace("{index}", index)}.${input.extension}`;
}
