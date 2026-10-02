/**
 * Blob 다운로드 어댑터. `URL.createObjectURL`로 만든 URL은 클릭 이후 반드시 `revokeObjectURL`한다
 * (예외가 나도 finally에서 해제 예약). 브라우저가 다운로드를 시작할 시간을 주기 위해
 * 해제는 `schedule`(기본 setTimeout 250 ms)로 미룬다.
 */

export interface DownloadOptions {
  /** 앵커를 붙일 문서. 기본 `document`. */
  doc?: Document;
  /** revoke 예약 함수. 테스트에서 즉시 실행으로 바꾼다. */
  schedule?: (fn: () => void) => void;
}

const DEFAULT_REVOKE_DELAY_MS = 250;

function defaultSchedule(fn: () => void): void {
  setTimeout(fn, DEFAULT_REVOKE_DELAY_MS);
}

export function downloadBlob(name: string, blob: Blob, opts: DownloadOptions = {}): void {
  const doc = opts.doc ?? document;
  const schedule = opts.schedule ?? defaultSchedule;
  const url = URL.createObjectURL(blob);
  try {
    const anchor = doc.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.rel = "noopener";
    anchor.style.display = "none";
    doc.body.appendChild(anchor);
    try {
      anchor.click();
    } finally {
      anchor.remove();
    }
  } finally {
    schedule(() => URL.revokeObjectURL(url));
  }
}

export function downloadJson(name: string, json: string, opts?: DownloadOptions): void {
  downloadBlob(name, new Blob([json], { type: "application/json" }), opts);
}

export function downloadPng(name: string, bytes: Uint8Array, opts?: DownloadOptions): void {
  // Blob 생성자는 ArrayBuffer 뷰를 받으므로 바이트 범위를 복사해 넘긴다.
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  downloadBlob(name, new Blob([copy], { type: "image/png" }), opts);
}
