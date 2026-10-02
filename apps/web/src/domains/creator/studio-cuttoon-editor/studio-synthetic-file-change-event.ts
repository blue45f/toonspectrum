import type { ChangeEvent } from "react";

/**
 * 가져오기 핸들러가 기대하는 `<input type="file">` 변경 이벤트 모양을 File 하나로 만든다.
 *
 * 핸들러(`handleImportPsd` 등)는 `event.target.files?.[0]`를 읽고 `event.target.value = ""`로 비우기만 하므로,
 * 실제 입력창을 거치지 않고도 프로젝트 센터의 파일 선택과 같은 경로로 들어간다.
 * 가져오기 전달 호스트(`StudioImportHandoffHost`)와 캔버스 파일 끌어 놓기가 이 한 곳을 같이 쓴다.
 */
export function createStudioFileChangeEvent(file: File): ChangeEvent<HTMLInputElement> {
  const input = { files: [file], value: "" } as unknown as HTMLInputElement;
  return { currentTarget: input, target: input } as ChangeEvent<HTMLInputElement>;
}
