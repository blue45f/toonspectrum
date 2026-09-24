import { Clock3, Eye, History, TriangleAlert } from "lucide-react";
import { useEffect, useMemo } from "react";

import { availabilitySnapshotFingerprint, availabilitySnapshotOf } from "./engagement-model";
import { useEngagement } from "./engagement-store";

import type { Title } from "@/shared/lib/types";

const DATE_TIME = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function formatObservedAt(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? DATE_TIME.format(date) : value;
}

export function AvailabilityHistoryPanel({ title }: { readonly title: Title }) {
  const observeAvailability = useEngagement((state) => state.observeAvailability);
  const record = useEngagement((state) => state.availabilityHistory[title.id]);
  const fingerprint = useMemo(
    () => availabilitySnapshotFingerprint(availabilitySnapshotOf(title)),
    [title],
  );

  useEffect(() => {
    observeAvailability(title);
  }, [fingerprint, observeAvailability, title]);

  const events = record?.events ?? [];
  return (
    <section className="rounded-2xl border border-line bg-panel/50 p-4">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
          <History size={15} aria-hidden="true" />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-fg">이 기기에서 본 변화</h3>
          <p className="mt-1 text-[0.68rem] leading-5 text-fg-3">
            방문할 때 확인된 공개 메타데이터만 비교합니다. 플랫폼 공식 가격 이력이나 실제 새 회차 공개를 보증하지 않습니다.
          </p>
        </div>
      </div>

      {events.length <= 1 ? (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-dashed border-line bg-card/60 p-3 text-xs leading-5 text-fg-3">
          <Eye className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>
            {record
              ? `${formatObservedAt(record.firstObservedAt)}에 첫 기준점을 저장했습니다. 다음 방문부터 제공처·가격 방식·연재 상태 변화가 있으면 여기에 표시됩니다.`
              : "첫 기준점을 저장하는 중입니다."}
          </p>
        </div>
      ) : (
        <ol className="mt-4 space-y-3">
          {events.slice(0, 6).map((event) => (
            <li key={event.id} className="rounded-xl border border-line bg-card p-3">
              <div className="flex items-center gap-1.5 text-[0.65rem] text-fg-3">
                <Clock3 size={12} aria-hidden="true" />
                <time dateTime={event.observedAt}>{formatObservedAt(event.observedAt)}</time>
              </div>
              {event.changes.length === 0 ? (
                <p className="mt-2 text-xs text-fg-2">첫 관찰 기준점</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {event.changes.map((change, index) => (
                    <li key={`${change.kind}-${index}`} className="text-xs leading-5 text-fg-2">
                      <strong className="font-semibold text-fg">{change.label}</strong>
                      {(change.before || change.after) ? (
                        <span className="ml-1 text-fg-3">{change.before ?? "없음"} → {change.after ?? "없음"}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}

      <div className="mt-3 flex items-start gap-2 text-[0.65rem] leading-5 text-fg-3">
        <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warn" aria-hidden="true" />
        <p>브라우저 데이터 삭제·기기 변경 시 이 관찰 기록도 사라질 수 있습니다.</p>
      </div>
    </section>
  );
}
