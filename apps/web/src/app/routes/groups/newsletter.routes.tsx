import { defineAppRoutes } from "../app-route-definition";

import { lazyRetry } from "@/shared/lib/lazy-retry";

const MyNewslettersPage = lazyRetry(
  () => import("@/domains/newsletter/MyNewslettersPage").then((module) => ({ default: module.MyNewslettersPage })),
  "MyNewslettersPage",
);
const NewsletterComposePage = lazyRetry(
  () =>
    import("@/domains/newsletter/NewsletterComposePage").then((module) => ({
      default: module.NewsletterComposePage,
    })),
  "NewsletterComposePage",
);

export const newsletterRoutes = defineAppRoutes([
  { id: "newsletter", path: "/newsletter", element: <MyNewslettersPage /> },
  { id: "newsletter-compose", path: "/newsletter/compose", element: <NewsletterComposePage /> },
]);
