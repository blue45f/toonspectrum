import { Route, Routes } from "react-router-dom";
import { AdminPage } from "@/src/pages/AdminPage";
import { AuthorPage } from "@/src/pages/AuthorPage";
import { CalendarPage } from "@/src/pages/CalendarPage";
import { CommunityPage, CommunityScopePage } from "@/src/pages/CommunityPage";
import { ComparePage } from "@/src/pages/ComparePage";
import { ExplorePage } from "@/src/pages/ExplorePage";
import { HomePage } from "@/src/pages/HomePage";
import { InsightsPage } from "@/src/pages/InsightsPage";
import { LibraryPage } from "@/src/pages/LibraryPage";
import { NotFoundPage } from "@/src/pages/NotFoundPage";
import { PencafePage } from "@/src/pages/PencafePage";
import { RankingPage } from "@/src/pages/RankingPage";
import { RecommendPage } from "@/src/pages/RecommendPage";
import { ReviewsPage } from "@/src/pages/ReviewsPage";
import { SearchPage } from "@/src/pages/SearchPage";
import { TitleDetailPage } from "@/src/pages/TitleDetailPage";

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/ranking" element={<RankingPage />} />
      <Route path="/search" element={<SearchPage />} />
      <Route path="/recommend" element={<RecommendPage />} />
      <Route path="/explore" element={<ExplorePage />} />
      <Route path="/calendar" element={<CalendarPage />} />
      <Route path="/reviews" element={<ReviewsPage />} />
      <Route path="/community" element={<CommunityPage />} />
      <Route path="/community/:scope" element={<CommunityScopePage />} />
      <Route path="/library" element={<LibraryPage />} />
      <Route path="/compare" element={<ComparePage />} />
      <Route path="/insights" element={<InsightsPage />} />
      <Route path="/title/:slug" element={<TitleDetailPage />} />
      <Route path="/author/:name" element={<AuthorPage />} />
      <Route path="/pencafe/:name" element={<PencafePage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
