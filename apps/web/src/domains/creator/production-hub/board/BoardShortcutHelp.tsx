import { Keyboard } from "lucide-react";

import { ProductionWorkspaceDialog } from "../ProductionWorkspaceDialog";

import { BOARD_SHORTCUT_GROUPS, BOARD_SHORTCUTS, type BoardShortcutGroup } from "./board-shortcuts";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

const GROUP_ORDER: readonly BoardShortcutGroup[] = ["navigate", "edit", "move", "general"];

/** 단축키 안내. 실제 키 처리와 같은 목록(`BOARD_SHORTCUTS`)에서 그리므로 안내와 동작이 어긋나지 않는다. */
export function BoardShortcutHelp({ onClose }: { readonly onClose: () => void }) {
  const bt = useBilingual("ProductionBoardShortcutHelp");
  return (
    <ProductionWorkspaceDialog
      title={bt("키보드 단축키", "Keyboard shortcuts")}
      description={bt(
        "글자를 입력하는 칸에서는 동작하지 않습니다. 카드에 초점이 있을 때는 화살표로도 카드 사이를 옮겨 다닐 수 있습니다.",
        "Shortcuts are off while you type in a field. With a card focused, arrow keys also move between cards.",
      )}
      onClose={onClose}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {GROUP_ORDER.map((group) => (
          <section key={group} aria-label={bt(BOARD_SHORTCUT_GROUPS[group].ko, BOARD_SHORTCUT_GROUPS[group].en)} className="rounded-2xl border border-line bg-canvas p-3">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-fg">
              <Keyboard className="size-4 text-accent" aria-hidden="true" />
              {bt(BOARD_SHORTCUT_GROUPS[group].ko, BOARD_SHORTCUT_GROUPS[group].en)}
            </h3>
            <dl className="space-y-1.5">
              {BOARD_SHORTCUTS.filter((shortcut) => shortcut.group === group).map((shortcut) => (
                <div key={shortcut.action} className="flex items-center justify-between gap-3">
                  <dt className="min-w-0 text-sm text-fg-2">{bt(shortcut.label.ko, shortcut.label.en)}</dt>
                  <dd className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                    {shortcut.keys.map((combo, index) => (
                      <span key={combo.join("+")} className="inline-flex items-center gap-1">
                        {index > 0 ? <span className="text-xs text-fg-3">{bt("또는", "or")}</span> : null}
                        {combo.map((key) => (
                          <kbd key={key} className="min-w-7 rounded-md border border-line bg-raised px-1.5 py-0.5 text-center text-xs font-semibold text-fg">
                            {key}
                          </kbd>
                        ))}
                      </span>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      <p className="mt-4 text-xs leading-5 text-fg-3">
        {bt(
          "마우스: 카드를 끌어 다른 열이나 위치에 놓을 수 있습니다. 터치: 카드 오른쪽 위 손잡이를 끌거나 '이동' 메뉴를 쓰세요.",
          "Mouse: drag a card to another column or position. Touch: drag the handle at the top right, or use the Move menu.",
        )}
      </p>
    </ProductionWorkspaceDialog>
  );
}
