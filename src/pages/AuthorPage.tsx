import { useParams } from "react-router-dom";
import { FanCafePanel } from "@/components/fan-cafe-panel";
import { Container } from "@/components/section";
import { TitleCard } from "@/components/title-card";
import { GenreChip } from "@/components/ui/chip";
import { Stars } from "@/components/ui/stars";
import { authorWorks } from "@/lib/data";
import { formatCount } from "@/lib/utils";
import { PenLine } from "lucide-react";
import { NotFoundPage } from "./NotFoundPage";

export function AuthorPage() {
  const { name } = useParams();
  const author = decodeURIComponent(name ?? "");
  const works = authorWorks(author);
  if (works.length === 0) return <NotFoundPage />;

  const totalViews = works.reduce((sum, title) => sum + title.stats.views, 0);
  const avg = works.reduce((sum, title) => sum + title.stats.ratingAvg, 0) / works.length;
  const genres = [...new Set(works.flatMap((title) => title.genres))].slice(0, 6);

  return (
    <Container size="wide" className="py-10">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow flex items-center gap-1.5 text-accent">
            <PenLine size={13} /> AUTHOR
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{author}</h1>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {genres.map((genre) => (
              <GenreChip key={genre} genre={genre} size="sm" />
            ))}
          </div>
        </div>
        <dl className="flex flex-wrap items-center gap-6">
          <div>
            <dt className="text-xs text-fg-3">참여작</dt>
            <dd className="numeral text-2xl text-fg">{works.length}</dd>
          </div>
          <div>
            <dt className="text-xs text-fg-3">평균 별점</dt>
            <dd className="flex items-center gap-1.5">
              <span className="numeral text-2xl text-fg">{avg.toFixed(1)}</span>
              <Stars value={avg} size="sm" />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-fg-3">누적 조회</dt>
            <dd className="numeral text-2xl text-fg">{formatCount(totalViews)}</dd>
          </div>
        </dl>
      </header>

      <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">
        {works.map((title) => (
          <TitleCard key={title.id} title={title} />
        ))}
      </div>

      <div className="mt-12">
        <FanCafePanel scope="author" targetId={author} targetLabel={author} compact />
      </div>
    </Container>
  );
}
