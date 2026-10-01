import { ExternalLink } from "lucide-react";

import { GLOSSARY_TERM_COUNT } from "./engineering-glossary-content";

import Link from "@/shared/navigation/router-link";
import { formatI18nTemplate, translateBilingualValueForActiveLocale, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo => translateBilingualValueForActiveLocale("EngineeringSeminarResources", ko, en);

/** 공식 문서와 외부 참고 링크이다. 링크가 있다는 이유로 제품 연동 완료를 주장하지 않는다. */
const SEMINAR_RESOURCES = [
  ["3D", "Three.js", "https://threejs.org/docs/", "장면·카메라·재질·렌더링 API", "Scene, camera, material and rendering APIs"],
  ["3D", "React Three Fiber · Drei", "https://r3f.docs.pmnd.rs/getting-started/introduction", "React에서 3D 장면을 구성하는 방법", "Constructing 3D scenes in React"],
  ["3D", "Babylon.js", "https://doc.babylonjs.com/", "3D 런타임과 기능별 공식 가이드", "Official guides to the 3D runtime and capabilities"],
  ["3D", "Rapier", "https://rapier.rs/docs/", "물리 세계·충돌·강체의 기초", "Physics worlds, collision and rigid bodies"],
  ["3D", "VRM · three-vrm", "https://github.com/pixiv/three-vrm", "캐릭터 모델 구조와 런타임 호환성", "Character structure and runtime compatibility"],
  ["3D", "glTF Transform", "https://gltf-transform.dev/", "glTF 자산의 변환·검사·최적화", "Transforming, inspecting and optimizing glTF assets"],
  ["3D", "Meshoptimizer", "https://github.com/zeux/meshoptimizer", "메시 최적화의 목적과 제약", "Mesh optimization and its constraints"],
  ["3D", "Blender Manual", "https://docs.blender.org/manual/en/latest/", "모델링·리깅·재질·장면 제작의 배경 지식", "Background knowledge on modeling, rigging, materials and scenes"],
  ["DRAWING", "perfect-freehand", "https://github.com/steveruizok/perfect-freehand", "압력 입력을 선의 외곽으로 만드는 과정", "Creating stroke outlines from pressure samples"],
  ["DRAWING", "Google Ink", "https://github.com/google/ink", "잉크 입력과 스트로크 표현", "Ink input and stroke representation"],
  ["DRAWING", "Paper.js", "http://paperjs.org/tutorials/", "벡터 경로·곡선·기하 연산", "Vector paths, curves and geometry operations"],
  ["DRAWING", "p5.brush", "https://github.com/acamposuribe/p5.brush", "브러시와 자연매체 표현의 구현 예시", "Brush and natural-media implementation examples"],
  ["DRAWING", "CanvasKit / Skia", "https://skia.org/docs/user/modules/canvaskit/", "Skia의 웹·WASM 렌더링 경로", "Skia rendering on the web through WASM"],
  ["DRAWING", "Konva", "https://konvajs.org/docs/", "캔버스 객체·레이어·이벤트 조작", "Canvas objects, layers and event handling"],
  ["LOCAL", "OPFS · MDN", "https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system", "사이트 전용 파일 공간과 보존 한계", "Origin-private file storage and persistence limits"],
  ["LOCAL", "SQLite WASM", "https://sqlite.org/wasm/doc/trunk/index.md", "브라우저 SQLite와 저장 방식", "Browser SQLite and storage backends"],
  ["LOCAL", "Web Workers · MDN", "https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers", "메인 스레드에서 작업을 분리하는 방법", "Moving work off the main thread"],
  ["LOCAL", "Service Worker · MDN", "https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API", "캐시와 업데이트 수명주기", "Caching and update lifecycle"],
  ["AI", "ONNX Runtime Web", "https://onnxruntime.ai/docs/tutorials/web/", "로컬 추론의 실행 환경과 제약", "Local inference environments and constraints"],
  ["AI", "MediaPipe", "https://ai.google.dev/edge/mediapipe/solutions/guide", "비전 모델과 작업별 파이프라인", "Vision models and task-specific pipelines"],
  ["WORKFLOW", "Remotion Player", "https://www.remotion.dev/docs/player/player", "프레임·재생 제어·오디오의 동기화", "Frames, playback controls and audio synchronization"],
  ["WORKFLOW", "Model Context Protocol", "https://modelcontextprotocol.io/docs/getting-started/intro", "AI 도구 연결의 개념과 보안 경계", "AI tool connectivity and security boundaries"],
  ["REFERENCE", "OpenAI Image Generation", "https://developers.openai.com/api/docs/guides/image-generation", "외부 생성 API 참고 · 실제 연결·비용은 별도 확인", "External generation API reference; verify integration and costs separately"],
  ["REFERENCE", "Adobe Firefly", "https://www.adobe.com/products/firefly.html", "외부 이미지 생성 도구 참고 · 내장 연동을 의미하지 않음", "External image-generation reference; not a claim of embedded integration"],
  ["REFERENCE", "Poly Haven", "https://polyhaven.com/", "3D·재질·HDRI 자료 탐색 · 파일과 이용 조건 확인", "Discover 3D, material and HDRI assets; check files and usage terms"],
  ["REFERENCE", "ambientCG", "https://ambientcg.com/", "표면 재질 참고 · 사용 조건·크기·색 공간 확인", "Surface-material references; check terms, resolution and color space"],
] as const;

export function EngineeringSeminarResources({ query = "" }: { readonly query?: string }) {
  useBilingualI18nRevision();
  const normalized = query.normalize("NFKC").trim().toLocaleLowerCase();
  const resources = SEMINAR_RESOURCES.filter((item) => item.join(" ").toLocaleLowerCase().includes(normalized));
  return <section className="mt-8 rounded-3xl border border-line/70 bg-panel/60 p-5 sm:p-7" aria-labelledby="seminar-resource-title" id="seminar-resources">
    <p className="text-xs font-bold tracking-widest text-accent">{bi("발표 후 더 알아보기", "GO DEEPER AFTER THE TALK")}</p>
    <h2 id="seminar-resource-title" className="mt-3 text-2xl font-black text-fg">{bi("기술 공구함과 참고 자료", "Technology toolbox and references")}</h2>
    <p className="mt-3 text-sm leading-7 text-fg-2">{bi("공식 문서는 역할과 한계를 이해하는 자료입니다. 외부 참고 사이트는 내장 연동·사용 권리·오프라인 동작을 보장하지 않습니다. 현재 적용 상태는 각 슬라이드의 코드 근거와 기술 스토리에서 확인하세요.", "Official documentation explains roles and limitations. External references do not guarantee embedded integration, usage rights or offline availability. Inspect each slide's source evidence and engineering story for implementation status.")}</p>
    <details className="mt-5 rounded-2xl border border-line bg-card p-4" open={normalized ? true : undefined}>
      <summary className="cursor-pointer py-2 text-base font-bold text-fg">{bi("공식 문서·생성 도구·자산 사이트", "Documentation, generation tools and asset resources")} · {resources.length}</summary>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{resources.map(([category, name, href, ko, en]) => <li key={name} className="min-w-0 rounded-xl border border-line p-4" data-seminar-resource={category}>
        <span className="text-[0.65rem] font-bold tracking-wider text-fg-3">{category}</span>
        <a href={href} target="_blank" rel="noopener noreferrer" className="mt-2 flex min-h-11 items-center justify-between gap-2 break-words text-sm font-black text-accent">{name}<ExternalLink size={14} className="shrink-0" aria-hidden="true" /></a>
        <p className="mt-2 text-xs leading-6 text-fg-2">{bi(ko, en)}</p>
      </li>)}</ul>
      {resources.length === 0 ? <p className="mt-3 text-sm text-fg-3">{bi("검색어와 일치하는 추가 참고 자료가 없습니다.", "No additional resources match this query.")}</p> : null}
    </details>
    <p className="mt-4 text-sm leading-7 text-fg-2">
      {bi("발표 용어는 ", "Talk terms are explained with analogies in the ")}
      <Link href="/about/technology/glossary" className="font-bold text-accent hover:underline">
        {formatI18nTemplate(String(bi("용어집({value0}개)", "glossary ({value0} terms)")), { value0: GLOSSARY_TERM_COUNT })}
      </Link>
      {bi("에서 쉬운 비유와 실제 적용 위치로 설명합니다.", ", together with where each is used.")}
    </p>
  </section>;
}
