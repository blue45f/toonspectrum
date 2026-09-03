#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def write(relative: str, content: str) -> None:
    (ROOT / relative).write_text(content, encoding="utf-8")


def replace_once(relative: str, old: str, new: str) -> None:
    source = read(relative)
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"{relative}: expected one match, found {count}: {old[:100]!r}")
    write(relative, source.replace(old, new, 1))


def replace_between(relative: str, start: str, end: str, replacement: str) -> None:
    source = read(relative)
    start_index = source.find(start)
    if start_index < 0:
        raise RuntimeError(f"{relative}: missing start token {start[:100]!r}")
    end_index = source.find(end, start_index + len(start))
    if end_index < 0:
        raise RuntimeError(f"{relative}: missing end token {end[:100]!r}")
    write(relative, source[:start_index] + replacement + source[end_index:])


PREVIEW = "src/domains/creator/vrm/StudioVrmAvatarForgePreview.tsx"
replace_once(
    PREVIEW,
    '''function changedNumericRecord(
  current: Readonly<Record<string, unknown>>,
  baseline: Readonly<Record<string, unknown>>,
): number {
  let count = 0;
  for (const key of new Set([...Object.keys(current), ...Object.keys(baseline)])) {
    const currentValue = current[key];
    const baselineValue = baseline[key];''',
    '''function changedNumericRecord(
  current: object,
  baseline: object,
): number {
  const currentRecord = current as Record<string, unknown>;
  const baselineRecord = baseline as Record<string, unknown>;
  let count = 0;
  for (const key of new Set([...Object.keys(currentRecord), ...Object.keys(baselineRecord)])) {
    const currentValue = currentRecord[key];
    const baselineValue = baselineRecord[key];''',
)
replace_once(
    PREVIEW,
    '''  if (headWidth >= 1.07 && cheekVolume >= 0.55) return "둥근형";''',
    '''  if (headWidth >= 1.07 || cheekVolume >= 0.65) return "둥근형";''',
)

PANEL = "src/domains/creator/vrm/StudioVrmAvatarForgePanel.tsx"
replace_once(
    PANEL,
    '''function formatValue(value: number, unit?: string) {
  return unit === "×" ? `${value.toFixed(2)}×` : `${Math.round(value * 100)}%`;
}

''',
    "",
)
replace_once(
    PANEL,
    '''                <span className="sr-only">{item.hint}</span>''',
    '''                <span aria-hidden="true" className="sr-only">{item.hint}</span>''',
)

VARIANT_DETAILS = '''            <details className="group rounded-xl border border-line bg-card/55 p-3">
              <summary className="flex min-h-9 cursor-pointer list-none items-center text-[0.68rem] font-bold text-fg-2 [&::-webkit-details-marker]:hidden">
                캐릭터 베리언트
                <span className="ml-auto text-[0.6rem] text-fg-3">얼굴 유지 · 실루엣 교체</span>
              </summary>
              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line/60 pt-3">
                {listStudioVrmCharacterVariantSummaries().map((variant) => {
                  const previewState = applyStudioVrmCharacterVariant(state, variant.id);
                  return (
                    <button
                      key={variant.id}
                      type="button"
                      disabled={disabled}
                      aria-label={`${variant.label} 베리언트: ${variant.description}`}
                      title={variant.tags.join(" · ")}
                      onClick={() => emit(previewState)}
                      className="overflow-hidden rounded-xl border border-line bg-card text-left text-fg transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40"
                    >
                      <span className="block h-20 overflow-hidden border-b border-line/60 bg-panel/60 px-1">
                        <StudioVrmAvatarForgePreview state={previewState} variant="compact" label={`${variant.label} 미리보기`} />
                      </span>
                      <span className="block p-2.5">
                        <span className="block truncate text-[0.67rem] font-extrabold">{variant.label}</span>
                        <span className="mt-0.5 line-clamp-2 block text-[0.58rem] leading-relaxed text-fg-3">{variant.description}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </details>

'''

# The first migration deliberately uses a broad details replacement. Restore the style-variant
# disclosure before converting the real hair-detail block below.
source = read(PANEL)
nav_token = '''            <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-accent/25 bg-accent-soft/30 p-2">'''
nav_index = source.find(nav_token)
if nav_index < 0:
    raise RuntimeError("Avatar Forge style navigation token is missing")
misplaced_start = source.rfind('''            {precisionMode ? (''', 0, nav_index)
if misplaced_start < 0:
    raise RuntimeError("misplaced precision block is missing")
source = source[:misplaced_start] + VARIANT_DETAILS + source[nav_index:]
write(PANEL, source)

HAIR_PRECISION = '''            {precisionMode ? (
              <div className="space-y-3 rounded-xl border border-accent/25 bg-accent-soft/20 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[0.68rem] font-bold text-fg-2">정밀 헤어 파라미터</p>
                    <p className="mt-0.5 text-[0.58rem] text-fg-3">가닥 두께·웨이브·광택·묶음 위치를 숫자로 마감합니다.</p>
                  </div>
                  <span className="rounded-full border border-accent/30 bg-card px-2 py-0.5 text-[0.58rem] font-bold text-accent">
                    {HAIR_DETAIL_KEYS.length}개
                  </span>
                </div>
                {HAIR_DETAIL_KEYS.map((key) => {
                  const limit = AVATAR_FORGE_HAIR_LIMITS[key];
                  return (
                    <StudioVrmForgeRangeControl
                      key={key}
                      label={limit.label}
                      value={state.hair[key]}
                      minimum={limit.min}
                      maximum={limit.max}
                      step={limit.step}
                      defaultValue={DEFAULT_AVATAR_FORGE_STATE.hair[key]}
                      unit={limit.unit ?? "%"}
                      disabled={disabled || state.hair.style === "none"}
                      onChange={(value) => updateHair(key, value)}
                    />
                  );
                })}
              </div>
            ) : (
              <button
                type="button"
                className="flex min-h-12 w-full items-center justify-between rounded-xl border border-dashed border-line bg-card/55 px-3 text-left text-[0.66rem] font-bold text-fg-2 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                onClick={() => setPrecisionMode(true)}
              >
                <span>
                  정밀 헤어 조절
                  <span className="mt-0.5 block text-[0.58rem] font-normal text-fg-3">가닥·웨이브·광택 등 {HAIR_DETAIL_KEYS.length}개</span>
                </span>
                <SlidersHorizontal size={15} className="text-accent" aria-hidden />
              </button>
            )}

'''
replace_between(
    PANEL,
    '''            <details className="group rounded-xl border border-line bg-card/55 p-3">
              <summary className="flex min-h-6 cursor-pointer list-none items-center text-[0.68rem] font-bold text-fg-2 [&::-webkit-details-marker]:hidden">
                정밀 헤어 파라미터''',
    '''            <div className="flex min-h-12 items-center gap-2.5 rounded-xl border border-line bg-panel/55 px-3">''',
    HAIR_PRECISION,
)

BOUNDARY = "src/domains/creator/vrm/studio-vrm-character-workshop-boundary.test.ts"
replace_once(
    BOUNDARY,
    '''const preview = readFileSync(new URL("./StudioVrmAvatarForgePreview.tsx", import.meta.url), "utf8");
const pose = readFileSync''',
    '''const preview = readFileSync(new URL("./StudioVrmAvatarForgePreview.tsx", import.meta.url), "utf8");
const range = readFileSync(new URL("./StudioVrmForgeRangeControl.tsx", import.meta.url), "utf8");
const pose = readFileSync''',
)
replace_once(
    BOUNDARY,
    '''    expect(panel).toContain("정확한 값");''',
    '''    expect(range).toContain("정확한 값");''',
)

print("Finalized visual workshop source transforms.")
