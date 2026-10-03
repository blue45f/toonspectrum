/**
 * 매뉴얼 "화면에서 찾기" 도식 데이터.
 *
 * 실제 화면 캡처 대신, 각 작업 공간의 영역 배치를 단순화해 그린 위치 안내다.
 * 캡처 이미지는 화면이 바뀔 때마다 낡지만, 영역 배치(도구 레일·캔버스·패널 등)는 잘 바뀌지 않으므로
 * 문서의 단계가 "화면의 어디에서" 일어나는지를 오래 정확하게 보여 줄 수 있다.
 * 영역 이름과 설명은 실제 화면의 이름과 맞춘다(편집기: 상단 바·도구 레일·캔버스·레이어/속성 패널·페이지 스트립).
 */
export interface ManualBilingual {
  readonly ko: string;
  readonly en: string;
}

export const MANUAL_SURFACE_REGIONS = {
  editor: ["topbar", "tools", "canvas", "panel", "pages"],
  three: ["library", "gizmo", "viewport", "inspector", "poses"],
  ai: ["director", "suggestions", "request", "answer"],
  music: ["mode", "presets", "brief", "library"],
  toolchain: ["connection", "tools", "queue", "results"],
  publish: ["manuscript", "distribution", "preview", "result"],
} as const;

export type ManualSurface = keyof typeof MANUAL_SURFACE_REGIONS;
export type ManualRegion<S extends ManualSurface = ManualSurface> = (typeof MANUAL_SURFACE_REGIONS)[S][number];

/** 화면 종류와, 그 화면에서 강조할 영역(번호 순서). 화면 종류마다 쓸 수 있는 영역만 허용한다. */
export type ManualScreen = {
  readonly [S in ManualSurface]: { readonly surface: S; readonly focus: readonly ManualRegion<S>[] };
}[ManualSurface];

export interface ManualSurfaceInfo {
  readonly title: ManualBilingual;
  /** CSS grid-template-areas(영역 id 그대로). */
  readonly areas: readonly string[];
  readonly columns: string;
  readonly rows: string;
}

export const MANUAL_SURFACES: Readonly<Record<ManualSurface, ManualSurfaceInfo>> = {
  editor: {
    title: { ko: "스튜디오 편집기", en: "Studio editor" },
    areas: ["topbar topbar topbar", "tools canvas panel", "pages pages pages"],
    columns: "2.75rem minmax(0,1fr) 30%",
    rows: "2.25rem minmax(9rem,1fr) 2.75rem",
  },
  three: {
    title: { ko: "3D 캐릭터·배경 작업실", en: "3D character & background workspace" },
    areas: ["library gizmo viewport inspector", "library poses poses inspector"],
    columns: "24% 2.5rem minmax(0,1fr) 28%",
    rows: "minmax(9rem,1fr) 2.75rem",
  },
  ai: {
    title: { ko: "AI 크리에이티브 디렉터", en: "AI creative director" },
    areas: ["director suggestions", "director request", "answer answer"],
    columns: "34% minmax(0,1fr)",
    rows: "minmax(5rem,1fr) 3rem 3rem",
  },
  music: {
    title: { ko: "애니 OST 만들기", en: "Anime OST maker" },
    areas: ["mode library", "presets library", "brief library"],
    columns: "minmax(0,1.3fr) minmax(0,1fr)",
    rows: "2.75rem 3.25rem minmax(5rem,1fr)",
  },
  toolchain: {
    title: { ko: "제작 툴체인", en: "Production toolchain" },
    areas: ["connection connection", "tools queue", "tools results"],
    columns: "minmax(0,1fr) minmax(0,1fr)",
    rows: "2.75rem minmax(4rem,1fr) 3rem",
  },
  publish: {
    title: { ko: "발행 준비", en: "Publishing" },
    areas: ["manuscript distribution preview", "result result result"],
    columns: "repeat(3, minmax(0,1fr))",
    rows: "minmax(7rem,1fr) 2.75rem",
  },
};

/** 영역 이름과 한 줄 설명. 문서의 단계가 같은 이름을 쓰도록 실제 화면 용어를 따른다. */
export const MANUAL_REGION_COPY: {
  readonly [S in ManualSurface]: Readonly<Record<ManualRegion<S>, { readonly name: ManualBilingual; readonly hint: ManualBilingual }>>;
} = {
  editor: {
    topbar: { name: { ko: "상단 바", en: "Top bar" }, hint: { ko: "파일·저장 상태·내보내기", en: "File, save status, export" } },
    tools: { name: { ko: "도구 레일", en: "Tool rail" }, hint: { ko: "브러시·지우개·선택·채우기·텍스트", en: "Brush, eraser, select, fill, text" } },
    canvas: { name: { ko: "캔버스", en: "Canvas" }, hint: { ko: "원고를 그리고 고치는 곳", en: "Where you draw and edit the page" } },
    panel: { name: { ko: "레이어·속성 패널", en: "Layers & properties" }, hint: { ko: "레이어 순서·잠금·불투명도·도구 설정", en: "Layer order, lock, opacity, tool settings" } },
    pages: { name: { ko: "페이지 스트립", en: "Page strip" }, hint: { ko: "컷·페이지 순서와 추가", en: "Panel and page order" } },
  },
  three: {
    library: { name: { ko: "캐릭터·장면 목록", en: "Characters & scenes" }, hint: { ko: "내 캐릭터·프리셋·모델 고르기", en: "Pick characters, presets, models" } },
    gizmo: { name: { ko: "세로 도구바", en: "Vertical toolbar" }, hint: { ko: "선택·이동·회전·크기·카메라", en: "Select, move, rotate, scale, camera" } },
    viewport: { name: { ko: "3D 뷰포트", en: "3D viewport" }, hint: { ko: "드래그로 돌려 보고 구도 잡기", en: "Drag to orbit and frame the shot" } },
    inspector: { name: { ko: "속성 탭", en: "Property tabs" }, hint: { ko: "얼굴·헤어·의상·체형·조명", en: "Face, hair, outfit, body, lighting" } },
    poses: { name: { ko: "포즈·썸네일 줄", en: "Pose strip" }, hint: { ko: "기본·앉기·걷기·액션 포즈", en: "Idle, sit, walk, action poses" } },
  },
  ai: {
    director: { name: { ko: "루나 안내", en: "Luna" }, hint: { ko: "연결 상태와 지금 할 수 있는 일", en: "Connection status and what you can do" } },
    suggestions: { name: { ko: "제안 목록", en: "Suggestions" }, hint: { ko: "스토리·캐릭터·구도·연출·번역", en: "Story, character, composition, directing, translation" } },
    request: { name: { ko: "요청 입력", en: "Request box" }, hint: { ko: "아이디어 적기·예시 넣기·보내기", en: "Type, use an example, send" } },
    answer: { name: { ko: "답변·바로가기", en: "Answer & shortcut" }, hint: { ko: "복사·다시 요청·관련 도구 열기", en: "Copy, ask again, open the related tool" } },
  },
  music: {
    mode: { name: { ko: "만들 음악 고르기", en: "Choose the music" }, hint: { ko: "보컬 OST 또는 장면 BGM", en: "Vocal OST or scene BGM" } },
    presets: { name: { ko: "스타터·테마", en: "Starters & themes" }, hint: { ko: "장르·악기·템포 한 번에 채우기", en: "Fill genre, instruments, tempo at once" } },
    brief: { name: { ko: "장면·가사·권리 확인", en: "Scene, lyrics, rights" }, hint: { ko: "세부 설정 후 생성", en: "Fine-tune, then generate" } },
    library: { name: { ko: "나의 사운드트랙", en: "My soundtracks" }, hint: { ko: "미리 듣기·MP3 보관·작품 연결", en: "Preview, keep MP3, link to a work" } },
  },
  toolchain: {
    connection: { name: { ko: "실행기 연결", en: "Runner connection" }, hint: { ko: "주소·토큰 입력 후 연결 확인", en: "Enter URL and token, then check" } },
    tools: { name: { ko: "도구 상태", en: "Tool status" }, hint: { ko: "실행 준비·설치 안 됨 배지", en: "Ready / not installed badges" } },
    queue: { name: { ko: "작업 큐", en: "Job queue" }, hint: { ko: "도구·작업 고르고 파일 넣기", en: "Pick a tool and job, add files" } },
    results: { name: { ko: "결과·영수증", en: "Results & receipts" }, hint: { ko: "내려받기와 실행 기록", en: "Download and run records" } },
  },
  publish: {
    manuscript: { name: { ko: "원고 정리", en: "Manuscript" }, hint: { ko: "이미지 순서·표지·사전 검사", en: "Image order, cover, preflight" } },
    distribution: { name: { ko: "공개 방식", en: "Distribution" }, hint: { ko: "공개 범위·즉시/예약", en: "Visibility, now or scheduled" } },
    preview: { name: { ko: "독자 화면", en: "Reader view" }, hint: { ko: "세로 스크롤·페이지 미리보기", en: "Scroll and page preview" } },
    result: { name: { ko: "게시·공유", en: "Publish & share" }, hint: { ko: "게시 결과와 독자 화면 열기", en: "Result and reader link" } },
  },
};

export function manualRegionCopy(screen: ManualScreen, region: string): { readonly name: ManualBilingual; readonly hint: ManualBilingual } | undefined {
  const table: Readonly<Record<string, { readonly name: ManualBilingual; readonly hint: ManualBilingual }>> = MANUAL_REGION_COPY[screen.surface];
  return table[region];
}

/** 강조 영역의 번호(1부터). 강조하지 않는 영역은 undefined. */
export function manualRegionNumber(screen: ManualScreen, region: string): number | undefined {
  const index = screen.focus.findIndex((entry) => entry === region);
  return index < 0 ? undefined : index + 1;
}

/** 도식에 그릴 영역 목록(화면 종류의 전체 영역, 배치 순서). */
export function manualSurfaceRegions(surface: ManualSurface): readonly string[] {
  return MANUAL_SURFACE_REGIONS[surface];
}
