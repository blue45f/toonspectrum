import { useId, useState } from "react";
import {
  decodeStudioBrowserWorkspace, encodeStudioBrowserWorkspace,
  STUDIO_BROWSER_WORKSPACE_MAX_BYTES, type StudioBrowserWorkspaceProfile,
} from "./studio-companion-browser-workspace";

const CONTROL = "min-h-11 rounded-lg border border-line bg-card px-3 py-2 text-xs text-fg-2 outline-none hover:bg-raised focus-visible:ring-2 focus-visible:ring-accent/50 disabled:cursor-not-allowed disabled:opacity-50";

export function StudioBrowserWorkspaceTransfer({ profile, onImport, editorHref, disabled = false }: {
  readonly disabled?: boolean;
  readonly profile: StudioBrowserWorkspaceProfile;
  readonly onImport: (profile: StudioBrowserWorkspaceProfile) => void;
  readonly editorHref: string | null;
}) {
  const id = useId();
  const [text, setText] = useState("");
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice({ text: "복사했습니다. 다른 브라우저에서 붙여넣어 주세요.", error: false });
    } catch {
      setNotice({ text: "클립보드를 사용할 수 없습니다. 입력란의 내용을 직접 선택해 복사해 주세요.", error: true });
    }
  }
  function importProfile() {
    const decoded = decodeStudioBrowserWorkspace(text);
    if (!decoded) {
      setNotice({ text: "올바른 탭·창 배치 설정이 아닙니다. 기존 설정은 유지됩니다.", error: true });
      return;
    }
    onImport(decoded);
    setNotice({ text: "배치 설정을 가져왔습니다. 고정 화면을 하나씩 열어 복원해 주세요.", error: false });
  }
  return (
    <details className="rounded-xl border border-line bg-card/60 p-3">
      <summary className="min-h-11 cursor-pointer content-center text-xs font-semibold text-fg-2 outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
        다른 브라우저로 작업공간 옮기기
      </summary>
      <div className="space-y-3 pt-2">
        <p className="text-xs leading-relaxed text-fg-3">
          같은 브라우저·프로필의 동일 사이트 탭과 창만 실시간 연결됩니다.
          Chrome ↔ Safari, 다른 프로필·시크릿 창은 연결되지 않습니다.
          배치 설정에는 고정 화면과 열기 방식만 포함되며 원고·로그인·세션 정보는 포함되지 않습니다.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={CONTROL} disabled={disabled} onClick={() => {
            const encoded = encodeStudioBrowserWorkspace(profile);
            setText(encoded);
            void copy(encoded);
          }}>배치 설정 복사</button>
          <button type="button" className={CONTROL} disabled={disabled || !text.trim()} onClick={importProfile}>배치 설정 가져오기</button>
        </div>
        <label htmlFor={`${id}-profile`} className="block text-xs font-medium text-fg-2">배치 설정 JSON</label>
        <textarea id={`${id}-profile`} value={text} onChange={(event) => setText(event.target.value)}
          maxLength={STUDIO_BROWSER_WORKSPACE_MAX_BYTES} rows={5} spellCheck={false}
          className="w-full resize-y rounded-lg border border-line bg-canvas p-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
          placeholder="다른 브라우저에서 복사한 배치 설정을 붙여넣으세요." />
        {editorHref ? (
          <div className="space-y-2 border-t border-line pt-3">
            <p className="text-xs leading-relaxed text-fg-3">
              서버 저장을 완료한 뒤 다른 브라우저에서 같은 계정으로 로그인하세요.
              이 주소는 작품을 다시 여는 링크이며 저장 전 변경사항과 로컬 원고는 전송하지 않습니다.
              두 브라우저에서 동시에 편집하지 말고 저장 후 작업을 넘겨 주세요.
            </p>
            <label htmlFor={`${id}-editor`} className="block text-xs font-medium text-fg-2">저장된 작품 주소</label>
            <input id={`${id}-editor`} readOnly value={editorHref} onFocus={(event) => event.currentTarget.select()}
              className="min-h-11 w-full rounded-lg border border-line bg-canvas px-2 text-xs" />
            <button type="button" className={CONTROL} disabled={disabled} onClick={() => void copy(editorHref)}>작품 주소 복사</button>
          </div>
        ) : (
          <p className="text-xs leading-relaxed text-fg-3">
            로컬·새 원고는 주소만으로 다른 브라우저에 옮길 수 없습니다.
            기본 편집기에서 프로젝트 파일로 내보낸 뒤 다른 브라우저에서 가져와 주세요.
          </p>
        )}
        {notice ? <p role={notice.error ? "alert" : "status"} className="text-xs leading-relaxed text-fg-2">{notice.text}</p> : null}
      </div>
    </details>
  );
}
