import {
  ArrowRight,
  Box,
  Brush,
  Check,
  Clock3,
  Download,
  History,
  Layers,
  LayoutGrid,
  RotateCcw,
  Search,
  Share2,
  Sparkles,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

import { CREATOR_LAUNCHPAD_COPY } from "./creator-launchpad-copy";
import "./creator-launchpad.css";

import Link from "@/compat/router-link";
import {
  clearCreatorLaunchPlan,
  clearCreatorRecentDestinations,
  creatorDestinationDescription,
  creatorDestinationLabel,
  formatCreatorRelativeTime,
  getCreatorContinuityServerSnapshot,
  getCreatorContinuitySnapshot,
  getCreatorLaunchRecommendation,
  recordCreatorDestination,
  saveCreatorLaunchPlan,
  subscribeCreatorContinuity,
  type CreatorContinuityLocale,
  type CreatorLaunchGoal,
  type CreatorLaunchPace,
} from "@/shared/lib/creator-continuity";
import {
  getPwaInstallServerSnapshot,
  getPwaInstallSnapshot,
  requestPwaInstall,
  subscribePwaInstall,
} from "@/shared/lib/pwa-install-store";

const GOALS: readonly CreatorLaunchGoal[] = ["draw", "comic", "character", "materials"];
const PACES: readonly CreatorLaunchPace[] = ["quick", "project"];
const GOAL_ICONS = { draw: Brush, comic: LayoutGrid, character: Box, materials: Search } as const;
const PACE_ICONS = { quick: Clock3, project: Layers } as const;

async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Continue to the selection fallback.
  }
  try {
    const field = document.createElement("textarea");
    field.value = value;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.append(field);
    field.select();
    const copied = document.execCommand("copy");
    field.remove();
    return copied;
  } catch {
    return false;
  }
}

function rememberHref(href: string): void {
  try {
    const url = new URL(href, window.location.origin);
    recordCreatorDestination(url.pathname, url.search);
  } catch {
    // Navigation remains functional when URL parsing is unavailable.
  }
}

export function CreatorLaunchpad({ locale }: { locale: CreatorContinuityLocale }) {
  const copy = CREATOR_LAUNCHPAD_COPY[locale];
  const continuity = useSyncExternalStore(
    subscribeCreatorContinuity,
    getCreatorContinuitySnapshot,
    getCreatorContinuityServerSnapshot,
  );
  const pwa = useSyncExternalStore(
    subscribePwaInstall,
    getPwaInstallSnapshot,
    getPwaInstallServerSnapshot,
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const [now, setNow] = useState(0);

  useEffect(() => {
    const updateNow = () => setNow(Date.now());
    updateNow();
    const timer = window.setInterval(updateNow, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const goal = continuity.plan?.goal ?? "draw";
  const pace = continuity.plan?.pace ?? "quick";
  const recommendation = getCreatorLaunchRecommendation(goal, pace);
  const goalCopy = copy.goals[goal];
  const paceCopy = copy.paces[pace];

  const selectGoal = (nextGoal: CreatorLaunchGoal) => {
    saveCreatorLaunchPlan(nextGoal, pace);
    setNotice(copy.saved);
  };
  const selectPace = (nextPace: CreatorLaunchPace) => {
    saveCreatorLaunchPlan(goal, nextPace);
    setNotice(copy.saved);
  };

  const sharePlan = async () => {
    const url = new URL(recommendation.href, window.location.origin).toString();
    try {
      if (navigator.share) {
        await navigator.share({ title: goalCopy.label, text: goalCopy.result, url });
        setNotice(copy.shareDone);
        return;
      }
      setNotice(await copyText(url) ? copy.shareDone : copy.shareFailed);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setNotice(copy.shareFailed);
    }
  };

  const installApp = async () => {
    const result = await requestPwaInstall();
    if (result === "accepted" || result === "installed") {
      setNotice(copy.installAccepted);
      setShowInstallHelp(false);
      return;
    }
    if (result === "dismissed") {
      setNotice(copy.installDismissed);
      return;
    }
    setShowInstallHelp(true);
    setNotice(copy.installUnavailable);
  };

  const installLabel = pwa.status === "installed"
    ? copy.installed
    : pwa.status === "available"
      ? copy.install
      : copy.installHelp;
  const swReady = pwa.serviceWorkerStatus === "active" || pwa.serviceWorkerStatus === "update-waiting";

  return (
    <section className="clp" aria-labelledby="creator-continuity-title" data-creator-launchpad="v1">
      <div className="clp-heading">
        <div>
          <p className="ce-overline">{copy.eyebrow}</p>
          <h2 id="creator-continuity-title" tabIndex={-1}>{copy.title}</h2>
        </div>
        <p>{copy.body}</p>
      </div>

      <div className="clp-layout">
        <div className="clp-planner">
          <fieldset>
            <legend>{copy.goalLabel}</legend>
            <div className="clp-goals">
              {GOALS.map((item) => {
                const Icon = GOAL_ICONS[item];
                const selected = goal === item;
                return (
                  <button
                    type="button"
                    key={item}
                    aria-pressed={selected}
                    onClick={() => selectGoal(item)}
                  >
                    <span className="clp-option-icon"><Icon size={19} aria-hidden="true" /></span>
                    <span><strong>{copy.goals[item].label}</strong><small>{copy.goals[item].description}</small></span>
                    {selected && <Check size={17} aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend>{copy.paceLabel}</legend>
            <div className="clp-paces">
              {PACES.map((item) => {
                const Icon = PACE_ICONS[item];
                return (
                  <button
                    type="button"
                    key={item}
                    aria-pressed={pace === item}
                    onClick={() => selectPace(item)}
                  >
                    <Icon size={17} aria-hidden="true" />
                    <span><strong>{copy.paces[item].label}</strong><small>{copy.paces[item].description}</small></span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="clp-recommendation" aria-live="polite">
            <div className="clp-recommendation-top">
              <span><Sparkles size={15} aria-hidden="true" />{copy.recommendation}</span>
              <span>{paceCopy.label}</span>
            </div>
            <h3>{goalCopy.result}</h3>
            <ol>
              {goalCopy.steps.map((step, index) => <li key={step}><span>0{index + 1}</span>{step}</li>)}
            </ol>
            <div className="clp-actions">
              <Link href={recommendation.href} onClick={() => rememberHref(recommendation.href)}>
                {copy.start}<ArrowRight size={17} aria-hidden="true" />
              </Link>
              <button type="button" onClick={() => void sharePlan()}><Share2 size={16} aria-hidden="true" />{copy.share}</button>
              <button type="button" onClick={() => { clearCreatorLaunchPlan(); setNotice(null); }}><RotateCcw size={15} aria-hidden="true" />{copy.reset}</button>
            </div>
            <p className="clp-privacy"><Check size={14} aria-hidden="true" />{copy.privacy}</p>
          </div>
        </div>

        <aside className="clp-side">
          <section className="clp-recent" aria-labelledby="creator-recent-title">
            <div className="clp-side-title">
              <span><History size={17} aria-hidden="true" />{copy.recentEyebrow}</span>
              <h3 id="creator-recent-title">{copy.recentTitle}</h3>
            </div>
            {continuity.recent.length > 0 ? (
              <>
                <ul>
                  {continuity.recent.slice(0, 3).map((item) => (
                    <li key={item.id}>
                      <Link href={item.href} onClick={() => rememberHref(item.href)}>
                        <span><strong>{creatorDestinationLabel(item.id, locale)}</strong><small>{creatorDestinationDescription(item.id, locale)}</small></span>
                        <span className="clp-recent-meta">{now > 0 ? formatCreatorRelativeTime(item.visitedAt, locale, now) : ""}<ArrowRight size={15} aria-hidden="true" /></span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <button type="button" className="clp-clear" onClick={() => clearCreatorRecentDestinations()}>{copy.recentClear}</button>
              </>
            ) : <p className="clp-empty">{copy.recentEmpty}</p>}
          </section>

          <section className="clp-install" aria-labelledby="creator-install-title">
            <div className="clp-side-title">
              <span><Download size={17} aria-hidden="true" />{copy.installEyebrow}</span>
              <h3 id="creator-install-title">{copy.installTitle}</h3>
            </div>
            <p>{copy.installBody}</p>
            <div className="clp-statuses">
              <span className={pwa.online ? "is-ready" : "is-warning"}>{pwa.online ? <Wifi size={14} aria-hidden="true" /> : <WifiOff size={14} aria-hidden="true" />}{pwa.online ? copy.online : copy.offline}</span>
              {swReady && <span className="is-ready"><Check size={14} aria-hidden="true" />{pwa.serviceWorkerStatus === "update-waiting" ? copy.updateReady : copy.offlineReady}</span>}
              {pwa.status === "available" && <span className="is-ready"><Download size={14} aria-hidden="true" />{copy.installReady}</span>}
            </div>
            <button type="button" className="clp-install-button" disabled={pwa.status === "installed"} onClick={() => void installApp()}>
              <Download size={17} aria-hidden="true" />{installLabel}
            </button>
            {showInstallHelp && <p className="clp-install-help" role="status">{copy.installUnavailable}</p>}
          </section>
        </aside>
      </div>

      {notice && <p className="clp-notice" role="status">{notice}</p>}
    </section>
  );
}
