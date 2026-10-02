import {
  CheckCircle2,
  ChevronDown,
  Clipboard,
  CloudOff,
  Cpu,
  Database,
  HardDrive,
  RefreshCw,
  Stethoscope,
  Wifi,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { formatI18nTemplate, useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

type Translate = (ko: string, en: string) => string;

interface DiagnosticItem {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly ok: boolean;
  readonly icon: LucideIcon;
}

/** 기기 메모리가 이보다 작으면 3D·대형 캔버스 작업에서 주의가 필요하다고 안내한다. */
const MIN_COMFORTABLE_MEMORY_GB = 4;
const COPIED_RESET_MS = 2_000;

function storageAvailable(): boolean {
  try {
    const key = "__toonstudio_help_probe__";
    window.localStorage.setItem(key, "1");
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function webglAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

function collectDiagnostics(bt: Translate): DiagnosticItem[] {
  const nav = navigator as Navigator & { gpu?: unknown; deviceMemory?: number };
  const storage = storageAvailable();
  const webgl = webglAvailable();
  const memory = nav.deviceMemory;
  const serviceWorker = "serviceWorker" in navigator;
  return [
    {
      id: "network",
      label: bt("네트워크", "Network"),
      value: navigator.onLine ? bt("온라인", "Online") : bt("오프라인", "Offline"),
      ok: navigator.onLine,
      icon: navigator.onLine ? Wifi : CloudOff,
    },
    {
      id: "storage",
      label: bt("브라우저 저장", "Browser storage"),
      value: storage ? bt("사용 가능", "Available") : bt("차단됨", "Blocked"),
      ok: storage,
      icon: Database,
    },
    {
      id: "webgl",
      label: bt("3D 기본 가속", "3D acceleration"),
      value: webgl ? bt("WebGL 사용 가능", "WebGL available") : bt("지원 확인 필요", "Support unconfirmed"),
      ok: webgl,
      icon: Cpu,
    },
    {
      id: "webgpu",
      label: bt("고급 GPU", "Advanced GPU"),
      value: nav.gpu ? bt("WebGPU 감지", "WebGPU detected") : bt("WebGL 경로 사용", "Using the WebGL path"),
      ok: true,
      icon: Cpu,
    },
    {
      id: "service-worker",
      label: bt("오프라인 앱", "Offline app"),
      value: serviceWorker ? bt("지원됨", "Supported") : bt("지원되지 않음", "Not supported"),
      ok: serviceWorker,
      icon: HardDrive,
    },
    {
      id: "memory",
      label: bt("기기 메모리", "Device memory"),
      value: memory ? formatI18nTemplate(bt("약 {v0}GB", "About {v0} GB"), { v0: memory }) : bt("브라우저 비공개", "Not exposed by the browser"),
      ok: !memory || memory >= MIN_COMFORTABLE_MEMORY_GB,
      icon: HardDrive,
    },
  ];
}

/**
 * 현재 브라우저가 저장·3D·오프라인 기능을 쓸 수 있는지 기기 안에서만 확인하는 빠른 점검.
 * 도움말을 읽는 데 방해가 되지 않도록 접어 두고, 접힌 제목 줄에 "정상 N/M"을 한눈에 보여 준다.
 */
export function BrowserReadinessDiagnostics() {
  const bt = useBilingual("BrowserReadinessDiagnostics");
  const [items, setItems] = useState<DiagnosticItem[]>([]);
  const [copied, setCopied] = useState(false);
  const report = useMemo(() => {
    const language = typeof navigator === "undefined" ? "unknown" : navigator.language;
    const platform = typeof navigator === "undefined" ? "unknown" : navigator.platform;
    return [
      "ToonStudio browser diagnostics",
      `time=${new Date().toISOString()}`,
      ...items.map((item) => `${item.id}=${item.value}`),
      `language=${language}`,
      `platform=${platform}`,
    ].join("\n");
  }, [items]);

  const refresh = () => setItems(collectDiagnostics(bt));
  useEffect(() => {
    const update = () => setItems(collectDiagnostics(bt));
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [bt]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      window.setTimeout(() => setCopied(false), COPIED_RESET_MS);
    } catch {
      setCopied(false);
    }
  };

  const okCount = items.filter((item) => item.ok).length;
  const allOk = items.length > 0 && okCount === items.length;

  return (
    <section className="mt-12 sm:mt-14" aria-labelledby="browser-diagnostics-title">
      <details className="group rounded-3xl border border-line bg-panel/55">
        <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 rounded-3xl px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 sm:px-6 [&::-webkit-details-marker]:hidden">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-line bg-card text-accent">
            <Stethoscope size={18} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="eyebrow block text-accent">SELF DIAGNOSTICS</span>
            <h2 id="browser-diagnostics-title" className="text-base font-bold tracking-tight text-fg sm:text-lg">{bt("현재 환경 빠른 점검", "Quick check of this browser")}</h2>
          </span>
          {items.length > 0 ? (
            <span className={cn("shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold", allOk ? "border-good/40 text-good" : "border-warning/50 text-warning")}>
              {formatI18nTemplate(bt("정상 {v0}/{v1}", "OK {v0}/{v1}"), { v0: okCount, v1: items.length })}
            </span>
          ) : null}
          <ChevronDown size={18} aria-hidden="true" className="shrink-0 text-accent transition-transform group-open:rotate-180 motion-reduce:transition-none" />
        </summary>
        <div className="border-t border-line p-4 sm:p-6">
          <p className="max-w-3xl text-sm leading-6 text-fg-2">
            {bt(
              "저장·3D·오프라인 기능의 기본 지원 상태만 기기 안에서 확인합니다. 파일·계정·프로젝트 내용은 읽거나 전송하지 않습니다.",
              "Only the basic support for saving, 3D and offline features is checked on this device. Files, accounts and project content are never read or sent.",
            )}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2 xl:grid-cols-3">
            {items.map(({ id, label, value, ok, icon: Icon }) => (
              <article key={id} className={cn("min-w-0 rounded-2xl border p-3 sm:p-4", ok ? "border-good/25 bg-good/5" : "border-warning/35 bg-warning-soft/50")}>
                <div className="flex items-center gap-2.5">
                  <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", ok ? "bg-good/10 text-good" : "bg-warning-soft text-warning")}>
                    {ok ? <CheckCircle2 size={16} aria-hidden="true" /> : <Icon size={16} aria-hidden="true" />}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-fg-2">{label}</p>
                    <strong className="mt-0.5 block break-keep text-sm text-fg">{value}</strong>
                  </div>
                </div>
              </article>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
            <button type="button" onClick={refresh} className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11 gap-1.5" })}>
              <RefreshCw size={14} aria-hidden="true" /> {bt("다시 검사", "Check again")}
            </button>
            <button type="button" onClick={() => void copy()} className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11 gap-1.5" })}>
              <Clipboard size={14} aria-hidden="true" /> {copied ? bt("복사됨", "Copied") : bt("진단 복사", "Copy report")}
            </button>
            <Link href="/studio/environment" className={buttonClass({ size: "sm", className: "min-h-11" })}>{bt("상세 환경 안내", "Environment guide")}</Link>
            <Link href="/studio/recovery" className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11" })}>{bt("프로젝트 복구", "Recover a project")}</Link>
            <Link href="/feedback" className={buttonClass({ variant: "ghost", size: "sm", className: "min-h-11" })}>{bt("문제 보고", "Report a problem")}</Link>
          </div>
        </div>
      </details>
    </section>
  );
}

export default BrowserReadinessDiagnostics;
