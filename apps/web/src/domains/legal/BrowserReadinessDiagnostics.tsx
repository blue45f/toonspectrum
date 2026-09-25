import {
  CheckCircle2,
  Clipboard,
  CloudOff,
  Cpu,
  Database,
  HardDrive,
  RefreshCw,
  Wifi,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

interface DiagnosticItem {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly ok: boolean;
  readonly icon: typeof Wifi;
}

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

function collectDiagnostics(): DiagnosticItem[] {
  const nav = navigator as Navigator & { gpu?: unknown; deviceMemory?: number };
  const storage = storageAvailable();
  const webgl = webglAvailable();
  const memory = nav.deviceMemory;
  return [
    { id: "network", label: "네트워크", value: navigator.onLine ? "온라인" : "오프라인", ok: navigator.onLine, icon: navigator.onLine ? Wifi : CloudOff },
    { id: "storage", label: "브라우저 저장", value: storage ? "사용 가능" : "차단됨", ok: storage, icon: Database },
    { id: "webgl", label: "3D 기본 가속", value: webgl ? "WebGL 사용 가능" : "지원 확인 필요", ok: webgl, icon: Cpu },
    { id: "webgpu", label: "고급 GPU", value: nav.gpu ? "WebGPU 감지" : "WebGL 경로 사용", ok: true, icon: Cpu },
    { id: "service-worker", label: "오프라인 앱", value: "serviceWorker" in navigator ? "지원됨" : "지원되지 않음", ok: "serviceWorker" in navigator, icon: HardDrive },
    { id: "memory", label: "기기 메모리", value: memory ? `약 ${memory}GB` : "브라우저 비공개", ok: !memory || memory >= 4, icon: HardDrive },
  ];
}

export function BrowserReadinessDiagnostics() {
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

  const refresh = () => setItems(collectDiagnostics());
  useEffect(() => {
    const update = () => setItems(collectDiagnostics());
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="mt-12 rounded-3xl border border-line bg-panel/55 p-5 sm:p-6" aria-labelledby="browser-diagnostics-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow text-accent">SELF DIAGNOSTICS</p>
          <h2 id="browser-diagnostics-title" className="mt-2 text-2xl font-black tracking-tight text-fg">현재 환경 빠른 점검</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-fg-2">
            저장·3D·오프라인 기능의 기본 지원 상태만 기기 안에서 확인합니다. 파일·계정·프로젝트 내용은 읽거나 전송하지 않습니다.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={refresh} className={buttonClass({ variant: "outline", size: "sm", className: "gap-1.5" })}>
            <RefreshCw size={14} aria-hidden="true" /> 다시 검사
          </button>
          <button type="button" onClick={() => void copy()} className={buttonClass({ variant: "outline", size: "sm", className: "gap-1.5" })}>
            <Clipboard size={14} aria-hidden="true" /> {copied ? "복사됨" : "진단 복사"}
          </button>
        </div>
      </div>
      <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {items.map(({ id, label, value, ok, icon: Icon }) => (
          <article key={id} className={cn("rounded-2xl border p-4", ok ? "border-good/25 bg-good/5" : "border-warning/35 bg-warning-soft/50")}>
            <div className="flex items-center gap-2">
              <span className={cn("grid size-9 place-items-center rounded-xl", ok ? "bg-good/10 text-good" : "bg-warning-soft text-warning")}>
                {ok ? <CheckCircle2 size={16} aria-hidden="true" /> : <Icon size={16} aria-hidden="true" />}
              </span>
              <div>
                <p className="text-[0.65rem] font-black uppercase tracking-[0.12em] text-fg-3">{label}</p>
                <strong className="mt-0.5 block text-sm text-fg">{value}</strong>
              </div>
            </div>
          </article>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
        <Link href="/studio/environment" className={buttonClass({ size: "sm" })}>상세 환경 안내</Link>
        <Link href="/studio/recovery" className={buttonClass({ variant: "outline", size: "sm" })}>프로젝트 복구</Link>
        <Link href="/feedback" className={buttonClass({ variant: "ghost", size: "sm" })}>문제 보고</Link>
      </div>
    </section>
  );
}

export default BrowserReadinessDiagnostics;
