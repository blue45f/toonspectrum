import { CHARACTER_SHAPER_GESTURES } from "../character-shaper-gestures";
import { SHORTCUTS } from "./character-shaper-landing-copy";

import { useBilingual, useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";

/**
 * 조작법: 터치·마우스 제스처(참조 아트의 "모바일 조작 가이드")와 키보드 단축키.
 * 표 대신 키-동작 쌍으로 두어 좁은 화면에서도 가로 스크롤 없이 읽힌다.
 */
export function CharacterShaperLandingShortcuts() {
  const bt = useBilingual("CharacterShaperLandingPage");
  const localize = useBilingualLocalizer("CharacterShaperLandingPage");
  const shortcuts = localize(SHORTCUTS.ko, SHORTCUTS.en);

  return (
    <div data-character-shaper-shortcuts="true" className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <section aria-labelledby="shaper-controls-touch" data-character-shaper-gestures="true">
        <h3 id="shaper-controls-touch" className="text-base font-bold text-fg">
          {bt("터치·마우스", "Touch and mouse")}
        </h3>
        <p className="mb-3 mt-1 text-sm leading-relaxed text-fg-2 [word-break:keep-all]">
          {bt(
            "휴대폰·태블릿에서는 이 네 가지만 알면 됩니다. 마우스는 끌기·휠로 같은 동작을 합니다.",
            "On a phone or tablet, these four are all you need. With a mouse, drag and the wheel do the same.",
          )}
        </p>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
          {CHARACTER_SHAPER_GESTURES.map((row) => {
            const Icon = row.icon;
            return (
              <li key={row.id} className="flex items-start gap-3 rounded-xl border border-line bg-card/30 p-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
                  <Icon size={18} aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-fg [word-break:keep-all]">
                    {bt(row.gesture[0], row.gesture[1])}
                  </span>
                  <span className="mt-0.5 block text-sm text-fg-2 [word-break:keep-all]">
                    {bt(row.result[0], row.result[1])}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="shaper-controls-keys">
        <h3 id="shaper-controls-keys" className="text-base font-bold text-fg">
          {bt("키보드 단축키", "Keyboard shortcuts")}
        </h3>
        <p className="mb-3 mt-1 text-sm leading-relaxed text-fg-2 [word-break:keep-all]">
          {bt(
            "마우스 없이도 슬롯을 오가고 되돌릴 수 있습니다. ⌘ 표기는 macOS 기준입니다.",
            "Move between slots and undo without a mouse. ⌘ notation follows macOS.",
          )}
        </p>
        <dl className="grid gap-2 md:grid-cols-2">
          {shortcuts.map((row) => (
            <div key={row.action} className="flex items-start gap-3 rounded-xl border border-line bg-card/30 p-3">
              <dt className="flex min-w-[4.5rem] shrink-0 flex-wrap items-center gap-1.5 pt-0.5">
                <span className="sr-only">{bt("키", "Key")}</span>
                {row.keys.map((key, keyIndex) => (
                  <span key={key} className="inline-flex items-center gap-1.5">
                    {keyIndex > 0 ? <span aria-hidden className="text-fg-3">–</span> : null}
                    <kbd className="inline-flex min-w-8 items-center justify-center rounded-md border border-line bg-card px-1.5 py-1 font-display text-[0.8125rem] text-fg">
                      {key}
                    </kbd>
                  </span>
                ))}
              </dt>
              <dd className="min-w-0">
                <span className="block text-sm font-semibold text-fg">{row.action}</span>
                {row.note ? (
                  <span className="mt-0.5 block text-sm leading-relaxed text-fg-2 [word-break:keep-all]">{row.note}</span>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
