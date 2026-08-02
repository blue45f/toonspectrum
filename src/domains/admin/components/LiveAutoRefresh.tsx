import { RefreshCw } from "lucide-react";
import { useState, useEffect } from "react";

interface LiveAutoRefreshProps {
  onRefresh: () => void;
  loading?: boolean;
}

export function LiveAutoRefresh({ onRefresh, loading = false }: LiveAutoRefreshProps) {
  const [intervalSec, setIntervalSec] = useState<number>(0); // 0 = off
  const [countdown, setCountdown] = useState<number>(0);

  useEffect(() => {
    if (intervalSec <= 0) {
      setCountdown(0);
      return;
    }

    setCountdown(intervalSec);
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          onRefresh();
          return intervalSec;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [intervalSec, onRefresh]);

  return (
    <div className="inline-flex items-center gap-2 bg-slate-900/60 border border-slate-800 p-1.5 rounded-xl backdrop-blur-xl text-xs">
      <button
        onClick={onRefresh}
        disabled={loading}
        title="지금 새로고침"
        className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors flex items-center gap-1 font-medium"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-indigo-400" : ""}`} />
        <span>새로고침</span>
      </button>

      <span className="w-px h-4 bg-slate-800" />

      <div className="flex items-center gap-1">
        <span className="text-slate-400 font-medium pl-1">자동:</span>
        {([0, 5, 15, 30] as const).map((sec) => (
          <button
            key={sec}
            onClick={() => setIntervalSec(sec)}
            className={`px-2 py-0.5 rounded-md font-semibold transition-all ${
              intervalSec === sec
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            }`}
          >
            {sec === 0 ? "Off" : `${sec}초`}
          </button>
        ))}
      </div>

      {intervalSec > 0 && (
        <span className="text-[10px] font-mono text-indigo-400 bg-indigo-950/60 border border-indigo-800/40 px-1.5 py-0.5 rounded-md">
          {countdown}s
        </span>
      )}
    </div>
  );
}
