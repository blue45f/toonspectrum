/**
 * Audited interchange registry for Studio.
 *
 * `engine-ready` means a tested codec exists but a visible menu may still need wiring. It is kept
 * separate from `available` so product copy never promises a button that does not exist yet.
 */
export type StudioInterchangeCategory =
  | "3d"
  | "animation"
  | "brush"
  | "document"
  | "palette"
  | "publication"
  | "raster"
  | "vector";

export type StudioInterchangeDirectionSupport =
  | "available"
  | "engine-ready"
  | "partial"
  | "unsupported";

export type StudioInterchangeRoundTrip = "lossless" | "none" | "partial" | "rendered";
export type StudioInterchangeStatus =
  | "available"
  | "bridge-only"
  | "engine-ready"
  | "partial"
  | "planned"
  | "unsupported";

export interface StudioInterchangeSizeBudget {
  readonly maxBatchBytes?: number;
  readonly maxDecodedBytes?: number;
  readonly maxDimensionPx?: number;
  readonly maxFileBytes?: number;
  readonly maxFiles?: number;
  readonly maxItems?: number;
  readonly notes?: string;
}

export interface StudioInterchangeCapability {
  readonly id: string;
  readonly label: string;
  readonly extensions: readonly string[];
  readonly mime: readonly string[];
  readonly category: StudioInterchangeCategory;
  readonly import: StudioInterchangeDirectionSupport;
  readonly export: StudioInterchangeDirectionSupport;
  readonly roundTrip: StudioInterchangeRoundTrip;
  readonly lossModel: readonly string[];
  readonly runtimeRequirement: readonly string[];
  readonly sizeBudget: StudioInterchangeSizeBudget;
  readonly status: StudioInterchangeStatus;
  readonly notes: readonly string[];
  readonly recommendedBridge?: readonly string[];
  readonly proprietary?: boolean;
}

const MiB = 1024 * 1024;

export const STUDIO_INTERCHANGE_CAPABILITIES: readonly StudioInterchangeCapability[] = Object.freeze([
  {
    id: "toonproject-archive",
    label: "ToonSpectrum 프로젝트 아카이브",
    extensions: [".toonproject.zip"],
    mime: ["application/vnd.toonspectrum.project+zip"],
    category: "document",
    import: "available",
    export: "available",
    roundTrip: "lossless",
    lossModel: [],
    runtimeRequirement: ["Web Crypto SHA-256", "Blob", "UTF-8 ZIP32 store subset"],
    sizeBudget: { maxFileBytes: 280_000_000, maxDecodedBytes: 256_000_000, maxFiles: 514 },
    status: "available",
    notes: [
      "프로젝트 JSON과 래스터·마스크·참고 이미지·VRM/GLB·오디오를 해시 기반으로 묶습니다.",
      "현재 writer가 만든 비압축 deterministic ZIP subset만 가져오며 일반 ZIP은 받지 않습니다.",
    ],
  },
  {
    id: "toonproject-json",
    label: "ToonSpectrum 프로젝트 JSON",
    extensions: [".json"],
    mime: ["application/json"],
    category: "document",
    import: "available",
    export: "available",
    roundTrip: "partial",
    lossModel: ["외부 URL/IndexedDB 원본 자산은 JSON 한 파일에 포함되지 않을 수 있음"],
    runtimeRequirement: ["UTF-8", "JSON"],
    sizeBudget: { maxFileBytes: 16 * MiB },
    status: "partial",
    notes: ["가벼운 백업용입니다. 다른 기기로 이동할 때는 프로젝트 아카이브가 우선입니다."],
    recommendedBridge: ["완전한 이동에는 .toonproject.zip 사용"],
  },
  {
    id: "png",
    label: "PNG",
    extensions: [".png"],
    mime: ["image/png"],
    category: "raster",
    import: "available",
    export: "available",
    roundTrip: "rendered",
    lossModel: ["레이어·벡터·텍스트 편집성은 평탄화됨", "ICC/광색역 메타데이터는 보존하지 않음"],
    runtimeRequirement: ["Canvas 2D", "브라우저 PNG decoder/encoder"],
    sizeBudget: { maxFileBytes: 12 * MiB, maxBatchBytes: 48 * MiB, maxDimensionPx: 16_384 },
    status: "available",
    notes: ["투명 배경과 무손실 픽셀을 지원하며 참고 이미지·펜촉에도 사용합니다."],
  },
  {
    id: "jpeg",
    label: "JPEG",
    extensions: [".jpg", ".jpeg"],
    mime: ["image/jpeg"],
    category: "raster",
    import: "available",
    export: "available",
    roundTrip: "rendered",
    lossModel: ["손실 압축", "알파 제거", "레이어·벡터·텍스트 편집성 평탄화"],
    runtimeRequirement: ["Canvas 2D", "브라우저 JPEG decoder/encoder"],
    sizeBudget: { maxFileBytes: 12 * MiB, maxBatchBytes: 48 * MiB, maxDimensionPx: 16_384 },
    status: "available",
    notes: ["내보내기 기본 품질은 0.92입니다."],
  },
  {
    id: "webp",
    label: "WebP",
    extensions: [".webp"],
    mime: ["image/webp"],
    category: "raster",
    import: "available",
    export: "available",
    roundTrip: "rendered",
    lossModel: ["내보내기 설정에 따른 손실 압축", "레이어·벡터·텍스트 편집성 평탄화"],
    runtimeRequirement: ["Canvas 2D", "브라우저 WebP decoder/encoder"],
    sizeBudget: { maxFileBytes: 12 * MiB, maxBatchBytes: 48 * MiB, maxDimensionPx: 16_384 },
    status: "available",
    notes: ["정적 WebP를 안전 검사하며 내보내기 기본 품질은 0.92입니다."],
  },
  ...([
    {
      id: "bmp",
      label: "BMP / DIB",
      extensions: [".bmp", ".dib"],
      mime: ["image/bmp", "image/x-ms-bmp"],
      category: "raster",
      import: "available",
      export: "available",
      roundTrip: "rendered",
      lossModel: ["가져오기는 장변 1,280px WebP quality 0.85 표시 프록시로 변환", "24-bit 출력은 알파를 흰색 배경에 합성"],
      runtimeRequirement: ["Web Worker", "bounded direct fallback", "Canvas 2D insertion bridge"],
      sizeBudget: { maxFileBytes: 64 * MiB, maxDecodedBytes: 64 * MiB, maxDimensionPx: 32_768 },
      status: "partial",
      notes: ["압축되지 않은 24/32-bit RGB BMP를 가져오고 24-bit BMP를 내보냅니다."],
    },
    {
      id: "tga",
      label: "TGA true-color",
      extensions: [".tga", ".icb", ".vda", ".vst"],
      mime: ["image/x-tga", "image/x-targa"],
      category: "raster",
      import: "available",
      export: "available",
      roundTrip: "rendered",
      lossModel: ["가져오기는 장변 1,280px WebP quality 0.85 표시 프록시로 변환", "색상표·RLE 등 TGA 변형은 지원하지 않음"],
      runtimeRequirement: ["Web Worker", "bounded direct fallback", "Canvas 2D insertion bridge"],
      sizeBudget: { maxFileBytes: 64 * MiB, maxDecodedBytes: 64 * MiB, maxDimensionPx: 32_768 },
      status: "partial",
      notes: ["압축되지 않은 24/32-bit true-color TGA를 교환합니다."],
    },
    {
      id: "netpbm",
      label: "Netpbm PPM / PAM",
      extensions: [".ppm", ".pam"],
      mime: ["image/x-portable-pixmap", "image/x-portable-arbitrarymap"],
      category: "raster",
      import: "available",
      export: "available",
      roundTrip: "rendered",
      lossModel: ["가져오기는 장변 1,280px WebP quality 0.85 표시 프록시로 변환", "PPM은 알파를 흰색 배경에 합성"],
      runtimeRequirement: ["Web Worker", "bounded direct fallback", "Canvas 2D insertion bridge"],
      sizeBudget: { maxFileBytes: 64 * MiB, maxDecodedBytes: 64 * MiB, maxDimensionPx: 32_768 },
      status: "partial",
      notes: ["8-bit binary P6 PPM과 P7 RGB/RGBA PAM 범위를 교환합니다."],
    },
    {
      id: "qoi",
      label: "Quite OK Image",
      extensions: [".qoi"],
      mime: ["image/qoi"],
      category: "raster",
      import: "available",
      export: "available",
      roundTrip: "rendered",
      lossModel: ["가져오기는 장변 1,280px WebP quality 0.85 표시 프록시로 변환", "원본 colorspace metadata는 보존하지 않음"],
      runtimeRequirement: ["Web Worker", "bounded direct fallback", "Canvas 2D insertion bridge"],
      sizeBudget: { maxFileBytes: 64 * MiB, maxDecodedBytes: 64 * MiB, maxDimensionPx: 32_768 },
      status: "partial",
      notes: ["QOI 3/4-channel sRGB 계열을 교환합니다."],
    },
  ] satisfies readonly StudioInterchangeCapability[]),
  {
    id: "tiff",
    label: "TIFF 6.0 baseline",
    extensions: [".tif", ".tiff"],
    mime: ["image/tiff", "image/x-tiff"],
    category: "raster",
    import: "available",
    export: "available",
    roundTrip: "rendered",
    lossModel: ["가져오기는 장변 1,280px WebP quality 0.85 표시 프록시로 변환", "무압축 8-bit RGB/RGBA baseline 범위", "ICC·광색역·임의 TIFF metadata는 보존하지 않음"],
    runtimeRequirement: ["Web Worker", "bounded direct fallback", "baseline TIFF codec", "Canvas 2D insertion bridge"],
    sizeBudget: { maxFileBytes: 64 * MiB, maxDimensionPx: 32_768, maxDecodedBytes: 64 * MiB },
    status: "partial",
    notes: ["II/MM, chunky 또는 separated multi-strip RGB/RGBA를 가져오고 little-endian TIFF를 내보냅니다."],
  },
  {
    id: "gif",
    label: "GIF",
    extensions: [".gif"],
    mime: ["image/gif"],
    category: "animation",
    import: "available",
    export: "unsupported",
    roundTrip: "none",
    lossModel: ["가져온 GIF는 캔버스 요소/참고 재생용이며 GIF 재인코딩은 제공하지 않음"],
    runtimeRequirement: ["브라우저 GIF decoder"],
    sizeBudget: { maxFileBytes: 12 * MiB, maxBatchBytes: 48 * MiB },
    status: "partial",
    notes: ["서명 검증 뒤 가져옵니다."],
    recommendedBridge: ["애니메이션 출력은 WebM 사용"],
  },
  {
    id: "psd",
    label: "Adobe Photoshop Document",
    extensions: [".psd"],
    mime: ["image/vnd.adobe.photoshop"],
    category: "document",
    import: "partial",
    export: "partial",
    roundTrip: "partial",
    lossModel: [
      "텍스트·벡터·스마트 오브젝트·조정 레이어·일부 효과는 래스터화 또는 생략",
      "그룹·마스크·블렌드 모드의 일부만 근사",
    ],
    runtimeRequirement: ["ag-psd lazy chunk", "Canvas 2D"],
    sizeBudget: {
      notes: "공통 손실 미리보기에서 영구 프로젝트 포함 자산을 모바일 64MiB, 데스크톱 128MiB로 제한",
    },
    status: "partial",
    notes: [
      "레이어 기반 교환은 가능하지만 Photoshop/CSP와 완전한 편집 왕복은 아닙니다.",
      "ORA/CBZ와 같은 손실 미리보기에서 해상도·레이어·표시 프록시·편집성 변화를 적용 전에 확인합니다.",
    ],
  },
  {
    id: "svg",
    label: "SVG",
    extensions: [".svg"],
    mime: ["image/svg+xml"],
    category: "vector",
    import: "unsupported",
    export: "available",
    roundTrip: "none",
    lossModel: ["일부 브러시·필터·래스터 효과는 이미지 또는 근사 벡터로 출력"],
    runtimeRequirement: ["Web Worker 권장", "UTF-8 XML"],
    sizeBudget: { notes: "페이지 요소/직렬화 Worker 예산 적용" },
    status: "partial",
    notes: ["현재는 페이지 내보내기 전용입니다."],
    recommendedBridge: ["SVG 가져오기는 PNG로 렌더하거나 지원 예정 벡터 import 사용"],
  },
  {
    id: "pdf",
    label: "PDF 1.4",
    extensions: [".pdf"],
    mime: ["application/pdf"],
    category: "publication",
    import: "unsupported",
    export: "available",
    roundTrip: "none",
    lossModel: ["각 페이지가 JPEG 이미지로 평탄화됨", "편집 가능한 텍스트/벡터 구조 없음"],
    runtimeRequirement: ["Canvas JPEG encoder"],
    sizeBudget: { maxDimensionPx: 16_384 },
    status: "available",
    notes: ["공유·검토·제출용 이미지 PDF이며 전문 인쇄 PDF/X writer는 아닙니다."],
  },
  {
    id: "webm",
    label: "WebM",
    extensions: [".webm"],
    mime: ["video/webm", "video/webm;codecs=vp8,opus", "video/webm;codecs=vp9,opus"],
    category: "animation",
    import: "unsupported",
    export: "available",
    roundTrip: "none",
    lossModel: ["타임라인 편집 정보가 최종 영상으로 렌더됨", "코덱은 브라우저 지원에 따라 VP9→VP8로 폴백"],
    runtimeRequirement: ["MediaRecorder", "Canvas captureStream", "WebM codec"],
    sizeBudget: { notes: "해상도·fps 기반 2.5–16 Mbps 비트레이트" },
    status: "available",
    notes: ["브라우저가 지원하는 경우에만 동작합니다."],
  },
  {
    id: "dialogue-json",
    label: "ToonSpectrum dialogue JSON",
    extensions: [".dialogue.json", ".json"],
    mime: ["application/json"],
    category: "document",
    import: "available",
    export: "available",
    roundTrip: "lossless",
    lossModel: [],
    runtimeRequirement: ["UTF-8", "JSON"],
    sizeBudget: { maxFileBytes: 8 * MiB, maxItems: 20_000 },
    status: "available",
    notes: ["대사 ID·페이지·컷·화자·메모·시간 정보를 versioned schema로 보존합니다."],
  },
  {
    id: "dialogue-table",
    label: "Dialogue CSV / TSV",
    extensions: [".csv", ".tsv"],
    mime: ["text/csv", "text/tab-separated-values", "text/plain"],
    category: "document",
    import: "available",
    export: "available",
    roundTrip: "partial",
    lossModel: ["스프레드시트 수식 실행 방지를 위해 위험한 셀 시작 문자를 apostrophe로 중립화"],
    runtimeRequirement: ["UTF-8"],
    sizeBudget: { maxFileBytes: 8 * MiB, maxItems: 20_000 },
    status: "partial",
    notes: ["번역표용이며 quoted newline/escaped quote를 검증합니다."],
  },
  {
    id: "dialogue-script-text",
    label: "Dialogue TXT / Markdown / Fountain",
    extensions: [".txt", ".md", ".fountain"],
    mime: ["text/plain", "text/markdown"],
    category: "document",
    import: "available",
    export: "available",
    roundTrip: "partial",
    lossModel: ["TXT/Markdown은 메모·시간을 보존하지 않음", "Fountain은 페이지·컷 주석을 보존하지만 캔버스 좌표는 없음"],
    runtimeRequirement: ["UTF-8"],
    sizeBudget: { maxFileBytes: 8 * MiB, maxItems: 20_000 },
    status: "partial",
    notes: ["대사 일괄 편집 패널에서 가져오기·내보내기가 연결되어 있습니다."],
  },
  {
    id: "subtitles",
    label: "SRT / WebVTT subtitles",
    extensions: [".srt", ".vtt"],
    mime: ["application/x-subrip", "text/vtt", "text/plain"],
    category: "animation",
    import: "available",
    export: "available",
    roundTrip: "partial",
    lossModel: ["페이지·컷·캔버스 좌표가 없어 문서 순서로 연결", "시간이 없으면 출력 시 3초 간격 자동 생성"],
    runtimeRequirement: ["UTF-8"],
    sizeBudget: { maxFileBytes: 8 * MiB, maxItems: 20_000 },
    status: "partial",
    notes: ["모션 웹툰 자막/대사 타이밍 bridge입니다."],
  },
  {
    id: "release-calendar",
    label: "iCalendar release schedule",
    extensions: [".ics"],
    mime: ["text/calendar"],
    category: "publication",
    import: "unsupported",
    export: "available",
    roundTrip: "none",
    lossModel: ["명시적으로 허용한 로컬 일정 필드만 RFC 5545 event로 출력", "외부 플랫폼 예약 게시 상태는 포함하지 않음"],
    runtimeRequirement: ["UTF-8"],
    sizeBudget: { maxFileBytes: 2_000_000, maxItems: 500 },
    status: "available",
    notes: ["메모는 사용자가 opt-in한 경우에만 포함합니다."],
  },
  {
    id: "publication-analytics-csv",
    label: "Publication analytics CSV",
    extensions: [".csv"],
    mime: ["text/csv", "text/plain"],
    category: "publication",
    import: "available",
    export: "unsupported",
    roundTrip: "none",
    lossModel: ["외부 플랫폼 원문 대신 허용된 정규화 지표와 출처 라벨만 로컬 저장"],
    runtimeRequirement: ["UTF-8"],
    sizeBudget: { maxItems: 10_000, notes: "최대 2,000,000 UTF-16 code units, 64 columns" },
    status: "partial",
    notes: ["WEBTOON/Tapas API 연동을 가장하지 않는 로컬 CSV 분석 경로입니다."],
  },
  {
    id: "toonaction-json",
    label: "ToonSpectrum Auto Action",
    extensions: [".toonaction.json"],
    mime: ["application/json"],
    category: "document",
    import: "available",
    export: "available",
    roundTrip: "lossless",
    lossModel: [],
    runtimeRequirement: ["UTF-8", "JSON"],
    sizeBudget: { maxItems: 64, notes: "128,000 JSON code units, depth 12, tree nodes 8,000" },
    status: "available",
    notes: ["검증된 명령 집합만 가져오며 실행 전 영향 범위와 복구 지점을 만듭니다."],
  },
  {
    id: "publish-package",
    label: "ToonSpectrum publish package",
    extensions: [".toonpkg.zip"],
    mime: ["application/zip"],
    category: "publication",
    import: "unsupported",
    export: "available",
    roundTrip: "none",
    lossModel: ["게시 목적지용 페이지·review PDF·manifest·공개 AI 요약을 묶은 결과 패키지"],
    runtimeRequirement: ["Blob", "UTF-8 ZIP32 store writer"],
    sizeBudget: { maxFileBytes: 520_000_000, maxDecodedBytes: 512_000_000, maxFiles: 1_100 },
    status: "available",
    notes: ["Studio 편집 프로젝트 복구용이 아니라 검수·제출용입니다."],
  },
  {
    id: "abr",
    label: "Adobe Photoshop Brush",
    extensions: [".abr"],
    mime: ["application/octet-stream", "application/x-photoshop-abr"],
    category: "brush",
    import: "partial",
    export: "unsupported",
    roundTrip: "none",
    lossModel: ["지원하지 않는 Photoshop dynamics/dual brush/texture는 근사 또는 생략"],
    runtimeRequirement: ["Web Worker", "ag-psd ABR parser"],
    sizeBudget: { maxFileBytes: 32 * MiB, maxItems: 256, maxDecodedBytes: 64 * MiB },
    status: "partial",
    notes: ["ABR 6/7/9/10을 검사하고 최대 256개 브러시를 Studio 스냅샷으로 변환합니다."],
  },
  {
    id: "brush-tip-png",
    label: "PNG 브러시 펜촉",
    extensions: [".png"],
    mime: ["image/png"],
    category: "brush",
    import: "available",
    export: "unsupported",
    roundTrip: "none",
    lossModel: ["64×64 이하 알파 마스크로 다운샘플"],
    runtimeRequirement: ["Canvas 2D", "PNG decoder"],
    sizeBudget: { maxFileBytes: 4 * MiB, maxDimensionPx: 4_096, maxDecodedBytes: 16 * MiB },
    status: "available",
    notes: ["투명 알파 또는 흑백 명도를 펜촉 알파 마스크로 변환합니다."],
  },
  ...(["gpl", "ase", "aco", "act", "jasc-pal", "css-palette", "json-palette"] as const).map((id): StudioInterchangeCapability => {
    const spec = {
      gpl: { label: "GIMP Palette", ext: [".gpl"], mime: ["text/plain"] },
      ase: { label: "Adobe Swatch Exchange", ext: [".ase"], mime: ["application/octet-stream"] },
      aco: { label: "Adobe Color Swatch", ext: [".aco"], mime: ["application/octet-stream"] },
      act: { label: "Adobe Color Table", ext: [".act"], mime: ["application/octet-stream"] },
      "jasc-pal": { label: "JASC-PAL", ext: [".pal"], mime: ["text/plain"] },
      "css-palette": { label: "CSS Custom Properties", ext: [".css"], mime: ["text/css"] },
      "json-palette": { label: "ToonSpectrum Palette JSON", ext: [".palette.json", ".json"], mime: ["application/json"] },
    }[id];
    return {
      id,
      label: spec.label,
      extensions: spec.ext,
      mime: spec.mime,
      category: "palette",
      import: "available",
      export: "available",
      roundTrip: "partial",
      lossModel: [
        "Studio 팔레트 모델은 8비트 불투명 sRGB이므로 알파·광색역·spot/global 구분은 경고 후 제거",
        ...(id === "act" || id === "jasc-pal" ? ["256색 한도와 색 이름 미지원 손실을 명시적으로 경고"] : []),
      ],
      runtimeRequirement: id === "ase" || id === "aco" || id === "act" ? ["ArrayBuffer", "DataView"] : ["UTF-8"],
      sizeBudget: { maxFileBytes: 4 * MiB, maxItems: id === "act" || id === "jasc-pal" ? 256 : 1_000 },
      status: "available",
      notes: ["검증된 codec과 팔레트 라이브러리 가져오기·내보내기 UI가 연결되어 있습니다."],
    };
  }),
  ...(["glb", "gltf", "obj", "fbx", "dae", "stl", "ply", "3ds"] as const).map((id): StudioInterchangeCapability => ({
    id: `3d-${id}`,
    label: id === "glb" ? "glTF Binary" : id === "gltf" ? "glTF JSON" : id.toUpperCase(),
    extensions: [`.${id}`],
    mime: id === "glb" ? ["model/gltf-binary"]
      : id === "gltf" ? ["model/gltf+json"]
        : id === "obj" ? ["model/obj", "text/plain"]
          : id === "stl" ? ["model/stl", "application/sla"]
            : ["application/octet-stream"],
    category: "3d",
    import: "available",
    export: "unsupported",
    roundTrip: "none",
    lossModel: id === "glb" ? ["안전 정규화 뒤 self-contained GLB로 보관"] : ["재질·애니메이션 일부를 self-contained GLB로 정규화하며 원본 포맷 구조는 보존하지 않음"],
    runtimeRequirement: ["Three.js lazy loader", "Web Worker for large OBJ/STL/PLY", "WebGL 또는 WebGPU renderer"],
    sizeBudget: { maxFileBytes: id === "glb" ? 100 * MiB : 32 * MiB, maxBatchBytes: 300 * MiB, maxFiles: 256, maxDecodedBytes: 256 * MiB },
    status: "partial",
    notes: ["가져온 모델은 검증된 self-contained GLB로 변환되어 프로젝트에 저장됩니다."],
    recommendedBridge: ["수정 가능한 원본은 Blender/SketchUp 등에 별도 보관"],
  })),
  {
    id: "vrm",
    label: "VRM humanoid avatar",
    extensions: [".vrm"],
    mime: ["model/vrm", "model/gltf-binary"],
    category: "3d",
    import: "available",
    export: "unsupported",
    roundTrip: "none",
    lossModel: ["원본 VRM을 포즈/렌더 소스로 사용하지만 VRM authoring/export는 제공하지 않음"],
    runtimeRequirement: ["@pixiv/three-vrm", "WebGL 또는 WebGPU renderer", "IndexedDB"],
    sizeBudget: { maxFileBytes: 128 * MiB },
    status: "partial",
    notes: ["VRM 파일 업로드와 포즈·표정·소품 결합을 지원합니다."],
    recommendedBridge: ["VRM 제작/재내보내기는 VRoid Studio 또는 Blender 사용"],
  },
  ...([
    ["clip", "CLIP STUDIO FORMAT", [".clip"], ["PSD", "PNG", "SVG"]],
    ["sut", "CLIP STUDIO brush", [".sut"], ["ABR", "PNG 펜촉 + Studio 브러시 설정"]],
    ["ai", "Adobe Illustrator", [".ai"], ["SVG", "PDF", "PSD", "PNG"]],
  ] as const).map(([id, label, extensions, bridge]): StudioInterchangeCapability => ({
    id,
    label,
    extensions,
    mime: ["application/octet-stream"],
    category: id === "sut" ? "brush" : "document",
    import: "unsupported",
    export: "unsupported",
    roundTrip: "none",
    lossModel: ["독점 내부 구조를 직접 해석하거나 쓰지 않음"],
    runtimeRequirement: [],
    sizeBudget: {},
    status: "bridge-only",
    notes: ["직접 호환을 지원한다고 표시하지 않습니다."],
    recommendedBridge: bridge,
    proprietary: true,
  })),
  {
    id: "ora",
    label: "OpenRaster",
    extensions: [".ora"],
    mime: ["image/openraster"],
    category: "document",
    import: "available",
    export: "available",
    roundTrip: "partial",
    lossModel: [
      "OpenRaster가 표현하지 못하는 Studio 전용 요소/효과는 PNG 레이어로 렌더",
      "검증된 중첩 stack은 Studio 적용 시 전체 경로명을 가진 단일 그룹으로 평탄화될 수 있음",
      "그룹 단위 opacity/blend는 자식 레이어 유효 값으로 근사되어 겹침 픽셀이 달라질 수 있음",
    ],
    runtimeRequirement: [
      "bounded ZIP32 STORE/DEFLATE reader/writer",
      "strict UTF-8 XML parser",
      "PNG IHDR validator",
      "순차 browser pixel decode gate",
      "공통 손실 미리보기",
    ],
    sizeBudget: {
      maxFileBytes: 520_000_000,
      maxDecodedBytes: 128 * MiB,
      maxDimensionPx: 32_768,
      maxFiles: 516,
      maxItems: 500,
      notes: "PNG 한 장당 최대 16,777,216픽셀, 전체 디코딩 RGBA 최대 128MiB, 영구 포함 자산 모바일 64MiB/데스크톱 128MiB",
    },
    status: "partial",
    notes: [
      "가져오기는 레이어 순서·좌표·유효 opacity/visibility·지원 blend mode와 PNG 원본을 보존합니다.",
      "중첩 그룹 관계는 검증된 DTO로 유지하지만 현재 Studio 그룹 모델에는 ‘상위 / 하위’ 경로명으로 평탄화해 적용할 수 있습니다.",
      "그룹 단위 opacity/blend 합성은 손실 미리보기에서 경고하고 자식 레이어 유효 값으로 근사합니다.",
      "현재 내보내기 메뉴는 화면과 같은 합성 1레이어 ORA만 저장합니다.",
      "PNG IHDR·개별/누적 예산을 선검증한 뒤 브라우저 픽셀 디코드와 실제 크기 대조를 통과해야 적용하며, ZIP64·암호화·data descriptor·legacy non-UTF-8 경로·STORE/DEFLATE 외 압축은 fail-closed 처리합니다.",
    ],
  },
  {
    id: "cbz",
    label: "Comic Book ZIP",
    extensions: [".cbz"],
    mime: ["application/vnd.comicbook+zip", "application/zip"],
    category: "publication",
    import: "available",
    export: "available",
    roundTrip: "none",
    lossModel: [
      "가져온 각 페이지는 편집 가능한 내부 레이어가 없는 단일 페이지 이미지로 배치됨",
      "ComicInfo.xml 핵심 metadata는 검증·요약하지만 프로젝트 metadata로 완전 왕복하지 않음",
      "내보내기는 Studio 페이지를 순서 지정 PNG/JPEG로 평탄화함",
    ],
    runtimeRequirement: [
      "bounded ZIP32 STORE/DEFLATE reader/writer",
      "strict PNG/JPEG/WebP/GIF header validator",
      "strict UTF-8 ComicInfo.xml parser",
      "순차 browser pixel decode gate",
      "Canvas image encoder",
      "공통 손실 미리보기",
    ],
    sizeBudget: {
      maxFileBytes: 520_000_000,
      maxDecodedBytes: 512 * MiB,
      maxDimensionPx: 131_072,
      maxFiles: 1_163,
      maxItems: 200,
      notes: "codec core의 절대 상한은 1,099페이지지만 Studio는 기존 페이지를 포함해 200페이지, 영구 포함 자산은 모바일 64MiB/데스크톱 128MiB로 제한",
    },
    status: "partial",
    notes: [
      "PNG/JPEG/WebP/GIF 페이지를 strict header·dimension·decoded-memory 검사와 순차 browser pixel decode 후 Unicode natural order로 가져옵니다.",
      "ComicInfo.xml은 구조 복잡도를 제한하고 제목·시리즈·권수·제작진·언어 등 허용된 핵심 metadata만 엄격히 읽습니다.",
      "ZIP64·암호화·data descriptor·legacy non-UTF-8 경로·STORE/DEFLATE 외 압축은 fail-closed 처리합니다.",
      "내보내기는 전체 Studio 페이지를 평탄화하고 ComicInfo.xml과 함께 저장하는 기존 범위를 유지합니다.",
    ],
  },
  {
    id: "gif-apng-mp4-export",
    label: "GIF / APNG / MP4 animation export",
    extensions: [".gif", ".apng", ".mp4"],
    mime: ["image/gif", "image/apng", "video/mp4"],
    category: "animation",
    import: "unsupported",
    export: "unsupported",
    roundTrip: "none",
    lossModel: ["구현 전"],
    runtimeRequirement: ["추가 encoder 또는 WebCodecs/muxer 검증 필요"],
    sizeBudget: {},
    status: "planned",
    notes: ["현재 WebM 출력을 GIF/APNG/MP4 지원으로 오표시하지 않습니다."],
  },
]);

export function studioInterchangeCapability(id: string): StudioInterchangeCapability | undefined {
  return STUDIO_INTERCHANGE_CAPABILITIES.find((capability) => capability.id === id);
}

export function studioInterchangeCapabilitiesForExtension(extension: string): readonly StudioInterchangeCapability[] {
  const normalized = extension.trim().toLowerCase();
  const withDot = normalized.startsWith(".") ? normalized : `.${normalized}`;
  return STUDIO_INTERCHANGE_CAPABILITIES.filter((capability) => capability.extensions.includes(withDot));
}

export function studioDirectlySupportedInterchangeCapabilities(): readonly StudioInterchangeCapability[] {
  return STUDIO_INTERCHANGE_CAPABILITIES.filter((capability) =>
    capability.import !== "unsupported" || capability.export !== "unsupported"
  );
}
