/**
 * 브라우저 다운로드 바인딩: Blob URL + `<a download>` 클릭. 코어(save-bytes.ts)가 revoke를 보장한다.
 */
import { saveBytesWith } from "./save-bytes";

import type { SaveBytesFn, SaveBytesPorts, SaveBytesResult } from "./save-bytes";

export function createDomSavePorts(doc: Document = document, urlApi: Pick<typeof URL, "createObjectURL" | "revokeObjectURL"> = URL): SaveBytesPorts {
  return {
    createObjectUrl(bytes, mime) {
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      return urlApi.createObjectURL(new Blob([copy], { type: mime }));
    },
    revokeObjectUrl(url) {
      urlApi.revokeObjectURL(url);
    },
    triggerDownload(url, fileName) {
      const anchor = doc.createElement("a");
      anchor.href = url;
      anchor.download = fileName;
      anchor.rel = "noopener";
      anchor.style.display = "none";
      doc.body.appendChild(anchor);
      try {
        anchor.click();
      } finally {
        anchor.remove();
      }
    },
    schedule(callback, delayMs) {
      setTimeout(callback, delayMs);
    },
  };
}

export const saveBytes: SaveBytesFn = (fileName, bytes, mime): SaveBytesResult => saveBytesWith(createDomSavePorts(), fileName, bytes, mime);
