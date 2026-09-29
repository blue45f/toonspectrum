import { useState } from "react";
import { ArrowLeft, Check, Download, HelpCircle, LayoutTemplate, PersonStanding, Store, Trash2 } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import {
  STUDIO_VIRTUAL_SPACE_APP_CATEGORY_LABELS,
  findStoreApp,
  installApp,
  listStoreApps,
  uninstallApp,
  type StudioVirtualSpaceApp,
} from "./studio-virtual-space-app-store";

const APP_ICONS = {
  conte: LayoutTemplate,
  quiz: HelpCircle,
  pose: PersonStanding,
} as const;

interface StudioVirtualSpaceAppStoreProps {
  readonly installedAppIds?: readonly string[];
  readonly onInstalledChange?: (installedAppIds: readonly string[]) => void;
}

function AppIcon({ app, size = 22 }: { readonly app: StudioVirtualSpaceApp; readonly size?: number }) {
  const Icon = APP_ICONS[app.icon];
  return <Icon size={size} aria-hidden />;
}

/**
 * 가상공간 앱 스토어(D-5). 앱 목록 → 상세 → 설치/제거 흐름을 제공한다.
 * 설치 상태는 기본적으로 로컬(useState)에 두며, props로 제어할 수도 있다.
 */
export function StudioVirtualSpaceAppStore({ installedAppIds, onInstalledChange }: StudioVirtualSpaceAppStoreProps) {
  const bt = useBilingual("StudioVirtualSpaceAppStore");
  const [internalInstalled, setInternalInstalled] = useState<readonly string[]>([]);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);

  const installed = installedAppIds ?? internalInstalled;
  const applyInstalled = (next: readonly string[]) => {
    if (installedAppIds === undefined) setInternalInstalled(next);
    onInstalledChange?.(next);
  };

  const apps = listStoreApps();
  const selected = selectedAppId ? findStoreApp(selectedAppId) : null;

  const handleInstall = (app: StudioVirtualSpaceApp) => {
    const result = installApp(installed, app.id);
    if (result.ok) applyInstalled(result.installedAppIds);
  };

  const handleUninstall = (app: StudioVirtualSpaceApp) => {
    const result = uninstallApp(installed, app.id);
    if (result.ok) applyInstalled(result.installedAppIds);
  };

  return (
    <section className="studio-vspace-app-store" aria-label={bt("가상공간 앱 스토어", "Virtual space app store")}>
      <header>
        <h2><Store size={18} aria-hidden />{bt("앱 스토어", "App Store")}</h2>
        <p>{bt("공간에 설치해서 함께 쓰는 미니 앱을 고르세요.", "Pick mini apps to install and use together in the space.")}</p>
      </header>

      {selected ? (
        <div className="studio-vspace-app-store-detail">
          <button type="button" onClick={() => setSelectedAppId(null)}>
            <ArrowLeft size={16} aria-hidden />{bt("목록으로", "Back to list")}
          </button>
          <div className="studio-vspace-app-store-detail-body">
            <AppIcon app={selected} size={32} />
            <h3>{bt(...selected.name)}</h3>
            <p>{bt(...STUDIO_VIRTUAL_SPACE_APP_CATEGORY_LABELS[selected.category])}</p>
            <p>{bt(...selected.description)}</p>
            {installed.includes(selected.id) ? (
              <div>
                <p role="status"><Check size={16} aria-hidden />{bt("설치됨", "Installed")}</p>
                <button type="button" onClick={() => handleUninstall(selected)}>
                  <Trash2 size={16} aria-hidden />{bt("제거", "Uninstall")}
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => handleInstall(selected)}>
                <Download size={16} aria-hidden />{bt("설치", "Install")}
              </button>
            )}
          </div>
        </div>
      ) : (
        <ul className="studio-vspace-app-store-list">
          {apps.map((app) => (
            <li key={app.id}>
              <button type="button" onClick={() => setSelectedAppId(app.id)} aria-describedby={`app-store-desc-${app.id}`}>
                <AppIcon app={app} />
                <span>
                  <strong>{bt(...app.name)}</strong>
                  <small id={`app-store-desc-${app.id}`}>{bt(...app.description)}</small>
                  <em>{bt(...STUDIO_VIRTUAL_SPACE_APP_CATEGORY_LABELS[app.category])}</em>
                </span>
                {installed.includes(app.id)
                  ? <span><Check size={16} aria-hidden />{bt("설치됨", "Installed")}</span>
                  : <Download size={16} aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
