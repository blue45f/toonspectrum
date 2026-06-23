import { TitleListPage } from "./pages/TitleListPage.tsx";
import { TitleDetailPage } from "./pages/TitleDetailPage.tsx";
import { useHashPath } from "./router";
import IntroSplashScreen from "./components/IntroSplashScreen.tsx";

export function App() {
  const path = useHashPath();
  const m = path.match(/^\/title\/(.+)$/);
  const content = m ? (
    <TitleDetailPage id={decodeURIComponent(m[1])} />
  ) : (
    <TitleListPage />
  );

  return (
    <>
      <IntroSplashScreen />
      {content}
    </>
  );
}
