import type { StudioFeatureModuleId } from "./studio-feature-registry";
import type { StudioProjectSection } from "./studio-project-views";

export type StudioFeatureSurfaceTone = "asset" | "governance" | "market" | "publishing" | "system";

export interface StudioFeatureSurfaceRegistration {
  readonly id: string;
  readonly moduleId: StudioFeatureModuleId;
  readonly section: StudioProjectSection;
  readonly views: readonly string[];
  readonly tone: StudioFeatureSurfaceTone;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly primaryActionKo: string;
  readonly primaryActionEn: string;
  readonly destination: {
    readonly section: StudioProjectSection;
    readonly view: string;
  } | {
    readonly href: string;
  };
}

export const STUDIO_FEATURE_SURFACE_REGISTRY: readonly StudioFeatureSurfaceRegistration[] = Object.freeze([
  {
    id: "asset.quality-passport",
    moduleId: "assetPassport",
    section: "assets",
    views: ["project", "installed", "rights"],
    tone: "asset",
    titleKo: "에셋 품질 여권",
    titleEn: "Asset quality passport",
    descriptionKo: "브러시·2D·3D·폰트·오디오의 해상도, 호환성, 성능과 편집 가능 범위를 같은 형식으로 확인합니다.",
    descriptionEn: "Review resolution, compatibility, performance and editability for brushes, 2D, 3D, fonts and audio in one format.",
    primaryActionKo: "품질과 권리 확인",
    primaryActionEn: "Review quality and rights",
    destination: { section: "assets", view: "rights" },
  },
  {
    id: "asset.providers",
    moduleId: "assetProvider",
    section: "assets",
    views: ["project", "installed", "missing"],
    tone: "asset",
    titleKo: "에셋 공급자와 설치",
    titleEn: "Asset providers and installs",
    descriptionKo: "내장·개인·팀·마켓·외부 구매 파일을 하나의 설치 상태와 버전으로 관리합니다.",
    descriptionEn: "Manage built-in, personal, team, market and externally purchased files through one install and version state.",
    primaryActionKo: "설치 에셋 보기",
    primaryActionEn: "Open installed assets",
    destination: { section: "assets", view: "installed" },
  },
  {
    id: "asset.rights-graph",
    moduleId: "rightsGraph",
    section: "assets",
    views: ["rights", "project"],
    tone: "governance",
    titleKo: "사용 권리와 출처 그래프",
    titleEn: "Rights and provenance graph",
    descriptionKo: "원본 파일, 파생 결과, AI 보조 여부, 팀 좌석, 게시 목적과 실제 사용 위치를 연결합니다.",
    descriptionEn: "Connect source files, derivatives, AI assistance, team seats, publishing intent and actual usage locations.",
    primaryActionKo: "출력 전 검사로 이동",
    primaryActionEn: "Open export preflight",
    destination: { section: "export", view: "preflight" },
  },
  {
    id: "asset.font-audit",
    moduleId: "fontAudit",
    section: "assets",
    views: ["rights", "missing"],
    tone: "governance",
    titleKo: "폰트·글리프·임베딩 검사",
    titleEn: "Font, glyph and embedding audit",
    descriptionKo: "대사와 효과음의 누락 글리프, 언어 지원, 인쇄·웹·영상·전자책 임베딩 권한을 검사합니다.",
    descriptionEn: "Audit missing glyphs, language support and print, web, video and ebook embedding permissions.",
    primaryActionKo: "누락 에셋 확인",
    primaryActionEn: "Review missing assets",
    destination: { section: "assets", view: "missing" },
  },
  {
    id: "market.submission",
    moduleId: "marketplaceSubmission",
    section: "assets",
    views: ["project", "installed", "series"],
    tone: "market",
    titleKo: "마켓 등록 준비",
    titleEn: "Marketplace submission",
    descriptionKo: "파일 품질, 미리보기, 라이선스, AI 출처, 호환성, 가격과 심사 상태를 등록 전 확인합니다.",
    descriptionEn: "Validate files, previews, licenses, AI provenance, compatibility, pricing and review state before submission.",
    primaryActionKo: "판매자 센터 열기",
    primaryActionEn: "Open seller center",
    destination: { href: "/market/seller" },
  },
  {
    id: "extensions.plugins",
    moduleId: "pluginRegistry",
    section: "settings",
    views: ["automation", "defaults"],
    tone: "system",
    titleKo: "플러그인과 자동화 확장",
    titleEn: "Plugins and automation extensions",
    descriptionKo: "Importer, Exporter, AI, 게시 연결과 자동화 명령을 권한·버전·기능 상태와 함께 관리합니다.",
    descriptionEn: "Manage importer, exporter, AI, publishing and automation extensions with permissions, versions and capability state.",
    primaryActionKo: "자동화 관리",
    primaryActionEn: "Manage automation",
    destination: { section: "settings", view: "automation" },
  },
  {
    id: "project.archive",
    moduleId: "archiveManifest",
    section: "settings",
    views: ["archive"],
    tone: "system",
    titleKo: "완전한 프로젝트 사본",
    titleEn: "Complete project archive",
    descriptionKo: "원고, 에셋, Series Kit, 현지화, 검토, 버전과 출력 기록을 재현 가능한 manifest로 묶습니다.",
    descriptionEn: "Package documents, assets, Series Kit, localization, review, versions and export history in a reproducible manifest.",
    primaryActionKo: "보관 안전 확인",
    primaryActionEn: "Review archive safety",
    destination: { section: "settings", view: "archive" },
  },
  {
    id: "publishing.connectors",
    moduleId: "publishingConnector",
    section: "export",
    views: ["targets", "preflight", "localization"],
    tone: "publishing",
    titleKo: "게시 플랫폼 연결",
    titleEn: "Publishing connectors",
    descriptionKo: "직접 API 게시, 게시 패키지, 업로드 페이지 연결을 플랫폼 권한에 맞춰 구분합니다.",
    descriptionEn: "Distinguish direct API publishing, publish packages and upload-page handoff according to platform permissions.",
    primaryActionKo: "게시 대상 선택",
    primaryActionEn: "Choose publish targets",
    destination: { section: "export", view: "targets" },
  },
  {
    id: "publishing.packages",
    moduleId: "publishingPackage",
    section: "export",
    views: ["packages", "history", "preflight"],
    tone: "publishing",
    titleKo: "재현 가능한 출력 패키지",
    titleEn: "Reproducible export packages",
    descriptionKo: "사용한 문서 버전, 규격, 권리 영수증, 경고와 산출물 checksum을 함께 기록합니다.",
    descriptionEn: "Record document version, target rules, rights receipts, warnings and output checksums together.",
    primaryActionKo: "패키지 만들기",
    primaryActionEn: "Build package",
    destination: { section: "export", view: "packages" },
  },
]);

export function studioFeatureSurfacesForView(
  section: StudioProjectSection,
  view: string,
): readonly StudioFeatureSurfaceRegistration[] {
  return STUDIO_FEATURE_SURFACE_REGISTRY.filter(
    (registration) => registration.section === section && registration.views.includes(view),
  );
}

export function auditStudioFeatureSurfaceRegistry(): readonly string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  for (const registration of STUDIO_FEATURE_SURFACE_REGISTRY) {
    if (ids.has(registration.id)) issues.push(`duplicate feature surface: ${registration.id}`);
    ids.add(registration.id);
    if (registration.views.length === 0) issues.push(`${registration.id} has no reachable view`);
    if ("href" in registration.destination && !registration.destination.href.startsWith("/")) {
      issues.push(`${registration.id} must use an internal product route`);
    }
  }
  const covered = new Set(STUDIO_FEATURE_SURFACE_REGISTRY.map((entry) => entry.moduleId));
  const expected: readonly StudioFeatureModuleId[] = [
    "archiveManifest",
    "assetPassport",
    "assetProvider",
    "fontAudit",
    "marketplaceSubmission",
    "pluginRegistry",
    "publishingConnector",
    "publishingPackage",
    "rightsGraph",
  ];
  for (const moduleId of expected) {
    if (!covered.has(moduleId)) issues.push(`${moduleId} has no product surface`);
  }
  return Object.freeze(issues);
}
