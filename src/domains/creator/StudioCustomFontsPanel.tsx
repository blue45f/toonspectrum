/**
 * StudioCustomFontsPanel — 사용자가 소유한 글꼴 파일을 가져와 보관·적용하는 패널.
 * StudioBrushLibraryPanel과 같은 controlled consumer다: 목록은 StudioPage가 소유하고
 * (영속화도 거기서), 이 패널은 파일 검증·등록·표시만 맡아 새 배열을 콜백으로 올려보낸다.
 *
 * 브라우저 seam(document.fonts·FontFace)은 prop으로 주입 가능하다 — jsdom에는 FontFace가
 * 없으므로 테스트가 가짜 폰트 집합을 넣어 등록 성공/실패 경로를 그대로 검증한다.
 */
import { Type, Upload, X } from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";

import {
  addCustomFont,
  browserFontSet,
  CUSTOM_FONT_ACCEPT,
  CUSTOM_FONT_FORMAT_HELP,
  customFontCssValue,
  formatCustomFontBytes,
  MAX_CUSTOM_FONT_FILE_BYTES,
  MAX_CUSTOM_FONT_TOTAL_BYTES,
  MAX_CUSTOM_FONTS,
  registerStudioCustomFont,
  removeCustomFont,
  totalCustomFontBytes,
  type StudioCustomFont,
  type StudioFontFaceFactory,
  type StudioFontSetLike,
} from "./studio-custom-fonts";
import { STUDIO_EASE, STUDIO_FOCUS_RING, StudioEmptyState, StudioSectionHeader } from "./studio-panel-ui";

import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

function localizeText(
  t: (key: string) => string,
  fallback: string,
  key: string,
): string {
  return t(key) === key ? fallback : t(key);
}

function interpolateText(message: string, values?: Record<string, string | number>): string {
  if (!values) return message;
  return Object.entries(values).reduce((memo, [key, value]) => memo.replaceAll(`{${key}}`, String(value)), message);
}

function tText(
  t: (key: string) => string,
  fallback: string,
  key: string,
  values?: Record<string, string | number>,
): string {
  return interpolateText(localizeText(t, fallback, key), values);
}

export interface StudioCustomFontsPanelProps {
  /** 보관 중인 사용자 글꼴 — StudioPage가 소유하는 단일 목록. */
  readonly fonts: readonly StudioCustomFont[];
  /** 추가·삭제 결과. 영속화(saveCustomFonts)는 소유자가 한다. */
  readonly onFontsChange: (fonts: StudioCustomFont[]) => void;
  /** 선택한 요소에 글꼴 적용 — 값은 customFontCssValue()가 만든 CSS font-family 문자열
   *  (StudioBrandKitPanel.onApplyFont와 완전히 동일한 규약). */
  readonly onApplyFont?: (cssValue: string) => void;
  /** 텍스트/말풍선이 선택돼 있어 적용이 의미 있는 상태인지. */
  readonly canApplyFont?: boolean;
  /** 테스트 주입 seam. 생략하면 document.fonts / window.FontFace. */
  readonly fontSet?: StudioFontSetLike | null;
  readonly createFontFace?: StudioFontFaceFactory | null;
}

export function StudioCustomFontsPanel({
  fonts,
  onFontsChange,
  onApplyFont,
  canApplyFont = false,
  fontSet,
  createFontFace,
}: StudioCustomFontsPanelProps) {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const t = useT();

  const usedBytes = totalCustomFontBytes(fonts);
  const usedPercent = Math.min(100, Math.round((usedBytes / MAX_CUSTOM_FONT_TOTAL_BYTES) * 100));

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // 같은 파일 재선택에도 onChange가 다시 발생하도록 즉시 리셋.
    if (!file || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      // 예산을 넘는 파일은 통째로 메모리에 올리기 전에 거절한다.
      if (file.size > MAX_CUSTOM_FONT_FILE_BYTES) {
        setError(
          tText(
            t,
            `글꼴 파일이 ${formatCustomFontBytes(file.size)}로 한 개당 `
            + `${formatCustomFontBytes(MAX_CUSTOM_FONT_FILE_BYTES)} 한도를 넘었어요. `
            + "필요한 굵기만 서브셋한 WOFF2로 변환해 주세요.",
            "studio.customFonts.fileTooLarge",
            {
              selectedFileSize: formatCustomFontBytes(file.size),
              limitSize: formatCustomFontBytes(MAX_CUSTOM_FONT_FILE_BYTES),
            },
          ),
        );
        return;
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = addCustomFont(fonts, { fileName: file.name, bytes });
      if (result.status === "rejected") {
        setError(result.message);
        return;
      }
      const registered = await registerStudioCustomFont(
        result.font,
        fontSet === undefined ? browserFontSet() : fontSet,
        createFontFace === undefined ? undefined : createFontFace,
      );
      if (registered.status === "failed") {
        setError(registered.message);
        return; // 등록 실패한 글꼴은 보관함에 남기지 않는다(못 쓰는 항목이 예산만 먹는다).
      }
      onFontsChange(result.fonts);
      setNotice(
        registered.status === "unsupported"
          ? tText(
            t,
            `“${result.font.family}” 글꼴을 담았어요. 이 브라우저는 미리보기를 지원하지 않아요.`,
            "studio.customFonts.noticeUnsupported",
            { fontName: result.font.family },
          )
          : tText(
            t,
            `“${result.font.family}” 글꼴을 담았어요. (${formatCustomFontBytes(result.font.byteLength)})`,
            "studio.customFonts.noticeUploaded",
            {
              fontName: result.font.family,
              size: formatCustomFontBytes(result.font.byteLength),
            },
          ),
      );
    } catch {
      setError(tText(
        t,
        "글꼴 파일을 읽지 못했어요. 파일이 손상됐는지 확인해주세요.",
        "studio.customFonts.readFailed",
      ));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function handleDelete(font: StudioCustomFont) {
    if (busyRef.current) return;
    setError(null);
    setNotice(null);
    onFontsChange(removeCustomFont(fonts, font.id));
  }

  return (
    <section aria-label={t("studio.customFonts.title")} aria-busy={busy}>
      <StudioSectionHeader
        title={t("studio.customFonts.title")}
        description={tText(
          t,
          `보유한 ${CUSTOM_FONT_FORMAT_HELP} 파일을 담아 레터링·효과음에 씁니다.`,
          "studio.customFonts.description",
          { format: CUSTOM_FONT_FORMAT_HELP },
        )}
      />

      <label
        className={cn(
          "flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-2 text-[0.72rem] font-semibold text-fg-2",
          STUDIO_EASE,
          "hover:bg-raised focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent",
          busy && "pointer-events-none cursor-wait opacity-55",
        )}
      >
        <Upload size={14} aria-hidden />
        {busy ? t("studio.customFonts.importing") : t("studio.customFonts.importButton")}
        <input
          type="file"
          accept={CUSTOM_FONT_ACCEPT}
          aria-label={t("studio.customFonts.importAria")}
          className="sr-only"
          disabled={busy}
          onChange={(event) => void handleImportFile(event)}
        />
      </label>

      <div className="mt-2">
        <div className="flex items-center justify-between gap-2 text-[0.72rem] text-fg-3">
          <span>
            {tText(
              t,
              `${formatCustomFontBytes(usedBytes)} / ${formatCustomFontBytes(MAX_CUSTOM_FONT_TOTAL_BYTES)} 사용`,
              "studio.customFonts.usage",
              {
                used: formatCustomFontBytes(usedBytes),
                max: formatCustomFontBytes(MAX_CUSTOM_FONT_TOTAL_BYTES),
              },
            )}
          </span>
          <span className="tabular-nums">
            {tText(
              t,
              `${fonts.length}/${MAX_CUSTOM_FONTS}개`,
              "studio.customFonts.storageCount",
              { count: fonts.length, max: MAX_CUSTOM_FONTS },
            )}
          </span>
        </div>
        <div
          className="mt-1 h-1.5 overflow-hidden rounded-full bg-raised"
          role="progressbar"
          aria-label={t("studio.customFonts.storageAria")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={usedPercent}
          aria-valuetext={`${formatCustomFontBytes(usedBytes)} / ${formatCustomFontBytes(MAX_CUSTOM_FONT_TOTAL_BYTES)}`}
        >
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${usedPercent}%` }}
          />
        </div>
      </div>

      {error && (
        <p
          role="alert"
          aria-live="assertive"
          className="mt-2 rounded-lg border border-bad/40 bg-bad/10 px-2.5 py-2 text-[0.72rem] leading-relaxed text-bad"
        >
          {error}
        </p>
      )}
      {!error && notice && (
        <p
          role="status"
          aria-live="polite"
          className="mt-2 rounded-lg border border-good/35 bg-good/10 px-2.5 py-2 text-[0.72rem] leading-relaxed text-fg"
        >
          {notice}
        </p>
      )}

      {fonts.length === 0 ? (
        <div className="mt-2">
          <StudioEmptyState
            icon={<Type size={18} aria-hidden />}
            title={t("studio.customFonts.emptyTitle")}
            description={tText(
              t,
              `라이선스를 가진 ${CUSTOM_FONT_FORMAT_HELP} 파일을 담으면 대사·효과음에 바로 쓸 수 있어요.`,
              "studio.customFonts.emptyDescription",
              { format: CUSTOM_FONT_FORMAT_HELP },
            )}
          />
        </div>
      ) : (
        <ul
          className="mt-2 max-h-72 space-y-1.5 overflow-y-auto pr-1"
          aria-label={tText(
            t,
            `담은 글꼴 ${fonts.length}개`,
            "studio.customFonts.listAria",
            { count: fonts.length },
          )}
        >
          {fonts.map((font) => (
            <li key={font.id} className="rounded-lg border border-line bg-card px-2 py-1.5">
              <div className="flex items-center gap-0.5">
                <span className="min-w-0 flex-1">
                  <span
                    className="block truncate text-xs font-medium text-fg"
                    style={{ fontFamily: customFontCssValue(font) }}
                    title={font.family}
                  >
                    {font.family}
                  </span>
                  <span className="block truncate text-[0.7rem] text-fg-3" title={font.fileName}>
                    {font.fileName || t("studio.customFonts.unknownFileName")} · {formatCustomFontBytes(font.byteLength)}
                  </span>
                </span>
                {onApplyFont && (
                  <button
                    type="button"
                    onClick={() => onApplyFont(customFontCssValue(font))}
                    disabled={!canApplyFont || busy}
                    aria-label={tText(t, `${font.family} 글꼴 적용`, "studio.customFonts.applyAria", { fontName: font.family })}
                    title={canApplyFont
                      ? t("studio.customFonts.applyToText")
                      : t("studio.customFonts.selectTextFirst")}
                    className={cn(
                      "min-h-11 shrink-0 rounded-lg border border-line px-2.5 text-[0.72rem] font-semibold text-fg-2",
                      STUDIO_EASE,
                      STUDIO_FOCUS_RING,
                      "hover:bg-raised hover:text-fg disabled:cursor-not-allowed disabled:opacity-45",
                    )}
                  >
                    {t("studio.customFonts.apply")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleDelete(font)}
                  disabled={busy}
                  aria-label={tText(t, `${font.family} 글꼴 삭제`, "studio.customFonts.deleteAria", { fontName: font.family })}
                  title={t("studio.customFonts.delete")}
                  className={cn(
                    "grid size-11 shrink-0 place-items-center rounded-lg text-fg-3",
                    STUDIO_EASE,
                    "hover:bg-bad/10 hover:text-bad focus-visible:outline focus-visible:outline-2 focus-visible:outline-bad disabled:cursor-wait disabled:opacity-45",
                  )}
                >
                  <X size={14} aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
