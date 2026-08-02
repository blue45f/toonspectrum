import { Activity, ShieldAlert, Flag, DollarSign } from "lucide-react";
import { useState, useEffect } from "react";

import { adminFetch } from "./admin-client";

import { useT } from "@/lib/i18n";

interface SystemHealthRes {
  status: string;
  database: { latencyMs: number };
  counts: { users: number; reviews: number; fanPosts: number; revenueEvents: number };
  maintenance: { enabled: boolean };
}
interface AdminHeaderStatsProps {
  userId: string;
}

export function AdminHeaderStats({ userId }: AdminHeaderStatsProps) {
  const [health, setHealth] = useState<SystemHealthRes | null>(null);
  const t = useT();

  useEffect(() => {
    let unmounted = false;
    const fetchHealth = async () => {
      try {
        const res = await adminFetch<SystemHealthRes>("/system/health", userId);
        if (!unmounted) setHealth(res);
      } catch {
        // Silent
      }
    };
    void fetchHealth();
    const interval = setInterval(() => void fetchHealth(), 15000);
    return () => {
      unmounted = true;
      clearInterval(interval);
    };
  }, [userId]);

  if (!health) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-900/40 border border-slate-800/80 p-4 rounded-2xl backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
          <Activity className="w-4 h-4" />
        </div>
        <div>
          <p className="text-[11px] font-medium text-slate-400">{t("admin.stats.health")}</p>
          <p className="text-xs font-bold text-white flex items-center gap-1.5 pt-0.5">
            <span className={`w-2 h-2 rounded-full ${health.status === "healthy" ? "bg-emerald-400 animate-pulse" : "bg-rose-400"}`} />
            {health.status === "healthy" ? t("admin.stats.healthy") : t("admin.stats.degraded")}
            <span className="text-[10px] text-slate-500 font-mono">({health.database.latencyMs}ms)</span>
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400">
          <DollarSign className="w-4 h-4" />
        </div>
        <div>
          <p className="text-[11px] font-medium text-slate-400">{t("admin.stats.revenueEvents")}</p>
          <p className="text-xs font-bold text-white pt-0.5">
            {health.counts.revenueEvents.toLocaleString()}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-cyan-500/10 border border-cyan-500/20 rounded-xl text-cyan-400">
          <Flag className="w-4 h-4" />
        </div>
        <div>
          <p className="text-[11px] font-medium text-slate-400">{t("admin.stats.usersCommunity")}</p>
          <p className="text-xs font-bold text-white pt-0.5">
            {health.counts.users.toLocaleString()} / {health.counts.fanPosts.toLocaleString()}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
          <ShieldAlert className="w-4 h-4" />
        </div>
        <div>
          <p className="text-[11px] font-medium text-slate-400">{t("admin.stats.maintenance")}</p>
          <p className="text-xs font-bold text-white pt-0.5">
            {health.maintenance.enabled ? (
              <span className="text-rose-400 font-bold">{t("admin.stats.maintenanceOn")}</span>
            ) : (
              <span className="text-slate-300">{t("admin.stats.maintenanceOff")}</span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
