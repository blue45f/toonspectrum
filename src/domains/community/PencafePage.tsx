import { PenLine } from "lucide-react";
import { useParams } from "react-router-dom";

import { FanCafePanel } from "@/components/fan-cafe-panel";
import { Container } from "@/components/section";

export function PencafePage() {
  const { name } = useParams();
  const targetLabel = decodeURIComponent(name ?? "");

  return (
    <Container size="wide" className="relative py-10">
      <header className="mb-8 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow flex items-center gap-1.5 text-accent">
            <PenLine size={13} />
            PENCAFE
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{targetLabel} 펜카페</h1>
          <p className="mt-2 max-w-xl text-sm text-fg-3">
            펜카페/번역자/편집자 커뮤니티를 중심으로 대화, 정리, 번역 소식, 창작 노하우를 공유합니다.
          </p>
        </div>
      </header>

      <FanCafePanel scope="pencafe" targetId={targetLabel} targetLabel={targetLabel} compact />
    </Container>
  );
}
