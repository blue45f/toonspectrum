import { createLucideIcon } from "lucide-react";
import { forwardRef } from "react";

import type { Studio3dToolIconName } from "./studio-3d-tool-icons";
import type { LucideProps } from "lucide-react";
import type { ReactNode } from "react";

import "./studio-3d-tool-icons.css";

export type { Studio3dToolIconName } from "./studio-3d-tool-icons";

/**
 * 3D 편집 도구 전용 듀오톤 아이콘 세트.
 *
 * 두 계층으로 나눠 그린다.
 * - 구조 계층(`currentColor`): 20px에서도 실루엣만으로 구별되는 형태. 2px 스트로크.
 * - 액센트 계층(`var(--studio-3d-icon-accent)`): 28px에서만 읽히는 보조 디테일. 채움 기반이라
 *   단색 컨텍스트에서는 작은 점으로 물러나며, CSS 변수가 없으면 `currentColor`로 물러난다.
 *
 * 설계 규칙: 24×24 뷰박스 안에 2px 안전 여백(2..22)으로만 그린다. 한 글리프 안에서 스트로크
 * 굵기를 섞지 않는다. 인접 슬롯과 실루엣이 겹치기 쉬운 쌍은 형태를 갈아탔다 —
 * `eyes`/`irises`, `top`/`body`, `camera`/`scene`, `layers`/`export`, `pose`/`hand-pose`,
 * `face-shape`/`expression`.
 */

/** 채움 액센트. 강제 색상 모드에서는 `currentColor`로 내려앉아 작은 점이 된다. */
function Accent({ children }: { readonly children: ReactNode }) {
  return (
    <g fill="var(--studio-3d-icon-accent, currentColor)" fillOpacity={0.92} stroke="none">
      {children}
    </g>
  );
}

const GLYPHS: Readonly<Record<Studio3dToolIconName, ReactNode>> = {
  /* 얼굴 윤곽 + 광대 평면. 구조는 얼굴형 슬라이더, 액센트는 광대뼈 볼륨. */
  "face-shape": (
    <>
      <path d="M12 2.6c-3.7 0-6.2 2.5-6.2 6.1v3.1c0 4 3.1 8.2 6.2 9.6 3.1-1.4 6.2-5.6 6.2-9.6V8.7c0-3.6-2.5-6.1-6.2-6.1Z" />
      <Accent>
        <path d="M8.4 10.2c.9-.6 1.8-.9 2.6-.9h2c.8 0 1.7.3 2.6.9-.9 1.4-1.6 2.9-1.6 4.3 0 1.3.5 2.6 1.2 3.6-1.3.6-2.7 1-4.2 1s-2.9-.4-4.2-1c.7-1 1.2-2.3 1.2-3.6 0-1.4-.7-2.9-1.6-4.3Z" />
      </Accent>
      <path d="M9.2 10.8h.01M14.8 10.8h.01" />
    </>
  ),
  /* 눈꺼풀·속눈썹. `irises`와 달리 동공을 담지 않는다. */
  eyes: (
    <>
      <path d="M2.8 12.4c1.7-2.6 4.4-4 7.2-4h4c2.8 0 5.5 1.4 7.2 4-1.7 2.6-4.4 4-7.2 4h-4c-2.8 0-5.5-1.4-7.2-4Z" />
      <path d="M4.6 9.6 3 7.3M19.4 9.6 21 7.3" />
      <Accent>
        <path d="M6.2 12.9c1.4-1 3.3-1.6 5.8-1.6s4.4.6 5.8 1.6c-1.4 1-3.3 1.6-5.8 1.6s-4.4-.6-5.8-1.6Z" />
      </Accent>
    </>
  ),
  /* 홍채 원 + 방사선. 눈 전체 윤곽이 아니라 홍채 조율 도구를 가리킨다. */
  irises: (
    <>
      <circle cx="12" cy="12" r="7.4" />
      <circle cx="12" cy="12" r="2.9" />
      <path d="M12 4.6v2.2M12 17.2v2.2M4.6 12h2.2M17.2 12h2.2M6.8 6.8l1.6 1.6M15.6 15.6l1.6 1.6M17.2 6.8l-1.6 1.6M8.4 15.6l-1.6 1.6" />
      <Accent>
        <circle cx="12" cy="12" r="1.1" />
      </Accent>
    </>
  ),
  /* 코브리지 + 콧볼 + 숨구멍 액센트. */
  nose: (
    <>
      <path d="M9.4 3.4c0 4.3-.5 7.6-2 10.4-1.3 2.4-.7 4.6 1.2 5.2" />
      <path d="M14.6 3.4c0 4.3.5 7.6 2 10.4 1.3 2.4.7 4.6-1.2 5.2" />
      <path d="M7.4 20.4c1.6 1 3.1 1.5 4.6 1.5s3-.5 4.6-1.5" />
      <Accent>
        <ellipse cx="9" cy="18.7" rx="1" ry="0.7" />
        <ellipse cx="15" cy="18.7" rx="1" ry="0.7" />
      </Accent>
    </>
  ),
  /* 입술 외곽선 + 입안 채움. */
  mouth: (
    <>
      <path d="M3 12.4c1.8-1.1 3.1-2.6 4.4-2.6 1.4 0 2.9 1.3 4.6 1.3s3.2-1.3 4.6-1.3c1.3 0 2.6 1.5 4.4 2.6-1.7 1-3 2.6-4.4 2.6-1.4 0-2.9-1.3-4.6-1.3s-3.2 1.3-4.6 1.3c-1.4 0-2.7-1.6-4.4-2.6Z" />
      <path d="M4.6 14.3c1.9 1 3.5 1.6 4.9 1.9M19.4 14.3c-1.9 1-3.5 1.6-4.9 1.9" />
      <Accent>
        <path d="M7.2 12.9c1.1-.3 2.1-.9 2.9-1.5.6.4 1.2.7 1.9.9.7-.2 1.3-.5 1.9-.9.8.6 1.8 1.2 2.9 1.5-1.1.9-2.3 1.4-3.5 1.6h-2.6c-1.2-.2-2.4-.7-3.5-1.6Z" />
      </Accent>
    </>
  ),
  /* 귀 윤곽 + 이개 채움. */
  /* 귀 — 큰 반지름 원호는 실제 bbox가 좌표값을 벗어나 y가 음수가 되어 위쪽이 잘렸다.
     24 안전영역 안에 닫히도록 절대 좌표 큐브로 다시 그린다. */
  ears: (
    <>
      <path d="M8.6 5.2c4.9 0 8.3 3.2 8.3 7.3 0 3.1-1.9 4.9-4.1 6.1-1.4.7-2.1 1.6-2.1 2.9 0 1.4-1.1 2.5-2.5 2.5-1.5 0-2.6-1-2.6-2.4" />
      <path d="M10.9 8.5c2.5 0 4.2 1.6 4.2 3.6 0 1.6-1 2.6-2.4 3.1-1 .4-1.5 1-1.5 1.9" />
      <Accent>
        <path d="M11.4 9.3c1.7 0 2.9 1.1 2.9 2.5 0 .9-.5 1.5-1.3 1.8-.6.3-1 .6-1.2 1.1-.2-1.4-.3-2.5-.4-3.4-.1-.7-.1-1.4 0-2Z" />
      </Accent>
    </>
  ),
  /* 머리카락 덩어리 + 잔물결 하이라이트. */
  hair: (
    <>
      <path d="M4 20.6 4.9 9.8A7.5 7.5 0 0 1 12 2.9a7.5 7.5 0 0 1 7.1 6.9l.9 10.8-3.6-1.2-1.7 2.3-2.7-1.4-2.7 1.4-1.7-2.3Z" />
      <path d="M8.3 9.4c1-2.2 2.3-3.6 3.7-4.5M11 10.6c1.3-.6 2.6-1.7 3.6-3.3M6.6 15.2c.4-1.6.5-3 .4-4.2" />
      <Accent>
        <path d="M14.4 7.2c1.2 1 2 2.4 2.3 4-.6-.9-1.4-1.7-2.4-2.3l-1.4-1c.4-.4.9-.6 1.5-.7Z" />
      </Accent>
    </>
  ),
  /* 어깨·몸통 + 골반 액센트(비율 편집 기준점). */
  body: (
    <>
      <circle cx="12" cy="3.8" r="2.4" />
      <path d="M8.2 8.1c1.2-.7 2.5-1 3.8-1s2.6.3 3.8 1l2.1 6.1-2.9 1v6.6H9V15.2l-2.9-1Z" />
      <path d="M12 8.1v9.1" />
      <Accent>
        <rect x="9.4" y="17.2" width="5.2" height="1.5" rx="0.7" />
      </Accent>
    </>
  ),
  /* 상의(셔츠) 실루엣 + 깃 액센트. `body`는 원형 머리 실루엣이라 겹치지 않는다. */
  top: (
    <>
      <path d="m8.6 3.4-6.4 3.7 2.7 4.6 2.4-1.5v10.4h9.4V10.2l2.4 1.5 2.7-4.6-6.4-3.7" />
      <Accent>
        <path d="M8.6 3.4c.4 1.5 1.7 2.5 3.4 2.5s3-1 3.4-2.5l-1.2-.7c-.3 1-.9 1.5-2.2 1.5s-1.9-.5-2.2-1.5Z" />
      </Accent>
    </>
  ),
  /* 하의(바지) 실루엣 + 허리밴 액센트. */
  bottom: (
    <>
      <path d="M6.4 3.2h11.2l1.5 17.6h-5.6l-1.5-9.4-1.5 9.4H4.9Z" />
      <Accent>
        <rect x="6.2" y="3.2" width="11.6" height="2.2" rx="0.6" />
      </Accent>
    </>
  ),
  /* 운동화 실루엣 + 밑창 스트라이프 액센트. */
  shoes: (
    <>
      <path d="M2.6 8.4 6 9.9l2.9-3.1 3.1 1.9v4.1l6.4 2.7 1.1 1.9v2.8H2.6Z" />
      <path d="M8.4 14.2 6.7 16.4" />
      <Accent>
        <path d="M2.6 17.8h18.9v3.3H2.6Z" />
      </Accent>
    </>
  ),
  /* 모자(액세서리) 실루엣 + 챙대 액센트. */
  accessory: (
    <>
      <path d="M8.4 12.2 9.8 5.6c.2-1 1-1.6 2.2-1.6s2 .6 2.2 1.6l1.4 6.6" />
      <path d="M12 4v8.2" />
      <Accent>
        <path d="M3.4 12.2c0-.9 3.9-1.6 8.6-1.6s8.6.7 8.6 1.6-3.9 1.7-8.6 1.7-8.6-.8-8.6-1.7Z" />
      </Accent>
    </>
  ),
  /* 표정 — 원형 얼굴 + 볼터치 액센트. `face-shape`는 각진 머리 윤곽이라 겹치지 않는다. */
  expression: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M7.8 10.4c.5-.6 1.1-.9 1.8-.9s1.3.3 1.8.9M12.6 10.4c.5-.6 1.1-.9 1.8-.9s1.3.3 1.8.9" />
      <path d="M8.4 14.6c1 1.3 2.2 2 3.6 2s2.6-.7 3.6-2" />
      <Accent>
        <ellipse cx="7" cy="13" rx="1.2" ry="0.8" />
        <ellipse cx="17" cy="13" rx="1.2" ry="0.8" />
      </Accent>
    </>
  ),
  /* 포즈 — 전신 막대 + 관절 액센트. `hand-pose`는 손 클로즈업이라 스케일이 다르다. */
  pose: (
    <>
      <circle cx="13.4" cy="3.6" r="1.9" />
      <path d="M13.4 6.2v5.4M13.4 7.6 7.4 9.4M13.4 7.6l4.8 2.6M13.4 11.6l-2.6 4.3M13.4 11.6l3.4 3.7M10.8 15.9 8.6 20.6M16.8 15.3l1.8 4.6" />
      <Accent>
        <circle cx="13.4" cy="11.6" r="1.3" />
        <circle cx="7.4" cy="9.4" r="1" />
        <circle cx="18.2" cy="10.2" r="1" />
      </Accent>
    </>
  ),
  /* 손 포즈 — 손 클로즈업 + 손끝 패드 액센트. */
  "hand-pose": (
    <>
      <path d="M7.6 12.4V6.2a1.5 1.5 0 0 1 3 0v5.2-6.6a1.5 1.5 0 0 1 3 0v6.6-5.2a1.5 1.5 0 0 1 3 0v5.8-2.6a1.5 1.5 0 0 1 3 0v5.4a5.8 5.8 0 0 1-5.8 5.8h-1.6a5 5 0 0 1-4.1-2.1l-3.3-3.9a1.5 1.5 0 0 1 2.2-2l1.2 1Z" />
      <Accent>
        <circle cx="10.6" cy="5" r="0.9" />
        <circle cx="13.6" cy="4.2" r="0.9" />
        <circle cx="16.6" cy="5.4" r="0.9" />
      </Accent>
    </>
  ),
  /* 카메라 — 바디 실루엣 + 렌즈 유리 액센트. `scene`는 3D 박스라 면이 다르다. */
  camera: (
    <>
      <path d="M3.4 7.4h4.1l1.7-2.8h5.6l1.7 2.8h4.1v13.2H3.4Z" />
      <circle cx="12" cy="13.4" r="3.9" />
      <Accent>
        <circle cx="12" cy="13.4" r="1.9" />
        <rect x="15.6" y="9.4" width="2.4" height="1.4" rx="0.7" />
      </Accent>
    </>
  ),
  /* 장면(소품 배치) — 3D 박스 + 상면 액센트. */
  scene: (
    <>
      <path d="m3.2 7.4 8.8-4.6 8.8 4.6-8.8 4.6Z" />
      <path d="m3.2 7.4 8.8 4.6v9l-8.8-4.6Zm17.6 0-8.8 4.6v9l8.8-4.6Z" />
      <Accent>
        <path d="m12 3 8.8 4.6L12 12.2 3.2 7.6Z" />
      </Accent>
    </>
  ),
  /* 표면 드로잉 — 브러시 + 잉크 방울 액센트. */
  "surface-ink": (
    <>
      <path d="m2.8 16.4 9.2 5 9.2-5" />
      <path d="m8.6 14.2 1.1-4.2 8-8 3.1 3.1-8 8-4.2 1.1Zm7-10.3 3.1 3.1" />
      <Accent>
        <path d="M18.2 14.6c1.3 1.6 2.1 2.8 2.1 3.7a2.1 2.1 0 0 1-4.2 0c0-.9.8-2.1 2.1-3.7Z" />
      </Accent>
    </>
  ),
  /* 레이어 — 스택 실루엣 + 최상단 면 액센트. `export`는 화살표라 방향이 다르다. */
  layers: (
    <>
      <path d="m3.2 12 8.8 4.6 8.8-4.6M3.2 16.6l8.8 4.6 8.8-4.6" />
      <Accent>
        <path d="m3.2 7.4 8.8-4.6 8.8 4.6-8.8 4.6Z" />
      </Accent>
    </>
  ),
  /* 내보내기 — 트레이 + 화살촉·받침 액센트. */
  export: (
    <>
      <path d="M12 6v9.4" />
      <path d="M8.2 12.2 12 16l3.8-3.8" />
      <path d="M4.2 14.6v5.6h15.6v-5.6" />
      <Accent>
        <path d="M12 2.8 15.2 6.4H8.8Z" />
        <rect x="4.2" y="18.6" width="15.6" height="1.4" rx="0.7" />
      </Accent>
    </>
  ),
  /* 오빗 — 회전 화살표 + 중심점 액센트. */
  orbit: (
    <>
      <path d="M4.4 4.2v5.2h5.2M19.6 19.8v-5.2h-5.2" />
      <path d="M19.6 9.4A7.4 7.4 0 0 0 5.6 6.2M4.4 14.6a7.4 7.4 0 0 0 14 3.2" />
      <Accent>
        <circle cx="12" cy="12" r="2.4" />
      </Accent>
    </>
  ),
};

export interface Studio3dToolIconProps extends Omit<LucideProps, "ref" | "name"> {
  readonly name: Studio3dToolIconName;
}

const Studio3dSvg = createLucideIcon("Studio3dTool", []);

/** Lucide의 SVG props·ref·크기·선 굵기 계약을 그대로 재사용한다. */
export const Studio3dToolIcon = forwardRef<SVGSVGElement, Studio3dToolIconProps>(function Studio3dToolIcon(
  { name, size = 20, className, children, ...props }, ref,
) {
  return <Studio3dSvg ref={ref} data-studio-3d-tool-icon={name} size={size} strokeWidth={2}
    className={["studio-3d-tool-icon", className].filter(Boolean).join(" ")}
    aria-hidden="true" focusable="false" {...props}>{GLYPHS[name]}{children}</Studio3dSvg>;
});
