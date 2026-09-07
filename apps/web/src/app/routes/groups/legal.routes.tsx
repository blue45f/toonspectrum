import { defineAppRoutes } from "../app-route-definition";

import { lazyRetry } from "@/shared/lib/lazy-retry";

const AboutPage = lazyRetry(
  () => import("@/src/domains/legal/AboutPage").then((module) => ({
    default: module.AboutPage,
  })),
  "AboutPage",
);
const CrawlerPolicyPage = lazyRetry(
  () => import("@/src/domains/legal/CrawlerPolicyPage").then((module) => ({
    default: module.CrawlerPolicyPage,
  })),
  "CrawlerPolicyPage",
);
const DataSourcesPage = lazyRetry(
  () => import("@/src/domains/creator-resources/SourcesPage").then((module) => ({
    default: module.SourcesPage,
  })),
  "DataSourcesPage",
);
const DesignSystemPage = lazyRetry(
  () => import("@/src/domains/legal/DesignSystemPage").then((module) => ({
    default: module.DesignSystemPage,
  })),
  "DesignSystemPage",
);
const SitemapPage = lazyRetry(
  () => import("@/src/domains/legal/SitemapPage").then((module) => ({
    default: module.SitemapPage,
  })),
  "SitemapPage",
);
const CopyrightPage = lazyRetry(
  () => import("@/src/domains/legal/CopyrightPage").then((module) => ({
    default: module.CopyrightPage,
  })),
  "CopyrightPage",
);
const TermsPage = lazyRetry(
  () => import("@/src/domains/legal/PolicyPage").then((module) => ({
    default: module.TermsPage,
  })),
  "TermsPage",
);
const PrivacyPage = lazyRetry(
  () => import("@/src/domains/legal/PolicyPage").then((module) => ({
    default: module.PrivacyPage,
  })),
  "PrivacyPage",
);
const ContactPage = lazyRetry(
  () => import("@/src/domains/legal/ContactPage").then((module) => ({
    default: module.ContactPage,
  })),
  "ContactPage",
);
const SupportPage = lazyRetry(
  () => import("@/src/domains/legal/SupportPage").then((module) => ({
    default: module.SupportPage,
  })),
  "SupportPage",
);
const FeedbackPage = lazyRetry(
  () => import("@/src/domains/legal/FeedbackPage").then((module) => ({
    default: module.FeedbackPage,
  })),
  "FeedbackPage",
);

export const legalRoutes = defineAppRoutes([
  { id: "legal-about", path: "/about", element: <AboutPage /> },
  { id: "legal-data-sources", path: "/about/data", element: <DataSourcesPage /> },
  { id: "legal-crawler-policy", path: "/about/crawler", element: <CrawlerPolicyPage /> },
  { id: "legal-design", path: "/design", element: <DesignSystemPage /> },
  { id: "legal-sitemap", path: "/sitemap", element: <SitemapPage /> },
  { id: "legal-terms", path: "/terms", element: <TermsPage /> },
  { id: "legal-privacy", path: "/privacy", element: <PrivacyPage /> },
  { id: "legal-copyright", path: "/copyright", element: <CopyrightPage /> },
  { id: "legal-contact", path: "/contact", element: <ContactPage /> },
  { id: "legal-support", path: "/support", element: <SupportPage /> },
  { id: "legal-feedback", path: "/feedback", element: <FeedbackPage /> },
]);
