/**
 * LT 변환 결과 → 레이어 문서 연동 경계.
 *
 * 현황: `domains/creator/layer/`의 레이어 명령(`studio-layer-operations.ts`)은
 * StudioPage의 document/command authority에 묶여 있어, 외부 도메인(3D 뷰)에서
 * 직접 호출할 수 있는 "ImageData → 래스터 레이어 추가" 공개 API가 없다.
 * 그래서 이 파일은 연동에 필요한 페이로드 타입과 변환 결과→페이로드 빌더만
 * 정의하고, 실제 문서 커밋은 호출 측(StudioPage 권한 영역)의 TODO로 남긴다.
 *
 * TODO(레이어 연동 담당):
 * 1. StudioPage(또는 레이어 authority 소유 영역)에서
 *    `createStudioLtConvertLayerPayloads()` 결과를 받아
 *    `ImageData` → canvas → `toDataURL()`(또는 blob URL)로 직렬화한다.
 * 2. 직렬화된 src로 `ImageEl`(`type: "image"`, `studio-element-model.ts`)을
 *    생성해 레이어 스택에 커밋한다. 레이어 이름은 페이로드의 `name`을 사용한다.
 * 3. 선화 레이어는 톤 레이어 위에 배치한다(CSP LT 변환과 동일한 순서).
 */

import type { StudioLtConvertResult } from "./studio-lt-convert";

export type StudioLtConvertLayerKind = "lt-convert-line" | "lt-convert-tone";

/**
 * 레이어 문서에 커밋하기 직전의 LT 변환 레이어 페이로드.
 * `imageData`는 엔진 출력 그대로이며, 직렬화(data URL 등)는 호출 측이 수행한다.
 */
export interface StudioLtConvertLayerPayload {
  readonly kind: StudioLtConvertLayerKind;
  /** 레이어 패널에 표시될 이름 (예: "LT 선화", "LT 톤"). */
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly imageData: ImageData;
}

export interface StudioLtConvertLayerNaming {
  readonly lineName?: string;
  readonly toneName?: string;
}

/**
 * 엔진 결과를 [선화, 톤] 순서의 레이어 페이로드 쌍으로 변환한다.
 * 반환 순서는 레이어 스택에 쌓을 순서(선화가 위)와 같다.
 */
export function createStudioLtConvertLayerPayloads(
  result: StudioLtConvertResult,
  naming?: StudioLtConvertLayerNaming,
): readonly [StudioLtConvertLayerPayload, StudioLtConvertLayerPayload] {
  if (!result || typeof result !== "object") {
    throw new Error("LT 변환 결과가 필요합니다.");
  }
  return [
    {
      kind: "lt-convert-line",
      name: naming?.lineName ?? "LT 선화",
      width: result.lineLayer.width,
      height: result.lineLayer.height,
      imageData: result.lineLayer,
    },
    {
      kind: "lt-convert-tone",
      name: naming?.toneName ?? "LT 톤",
      width: result.toneLayer.width,
      height: result.toneLayer.height,
      imageData: result.toneLayer,
    },
  ];
}
