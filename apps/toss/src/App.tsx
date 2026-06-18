import { TitleListPage } from './pages/TitleListPage.tsx';
import { TitleDetailPage } from './pages/TitleDetailPage.tsx';
import { useHashPath } from './router';

export function App() {
  const path = useHashPath();
  const m = path.match(/^\/title\/(.+)$/);
  if (m) return <TitleDetailPage id={decodeURIComponent(m[1])} />;
  return <TitleListPage />;
}
