import { lazyRetry } from "@/shared/lib/lazy-retry";

export const AboutPage = lazyRetry(
  () => import("@/domains/legal/AboutPage").then((module) => ({
    default: module.AboutPage,
  })),
  "AboutPage",
);
export const WebtoonWorkflowPage = lazyRetry(
  () => import("@/domains/legal/WebtoonWorkflowPage").then((module) => ({
    default: module.WebtoonWorkflowPage,
  })),
  "WebtoonWorkflowPage",
);
export const TechnologyPage = lazyRetry(
  () => import("@/domains/legal/TechnologyPage").then((module) => ({
    default: module.TechnologyPage,
  })),
  "TechnologyPage",
);
export const EngineeringStoryPage = lazyRetry(
  () => import("@/domains/legal/technology/EngineeringStoryPage").then((module) => ({
    default: module.EngineeringStoryPage,
  })),
  "EngineeringStoryPage",
);
export const EngineeringGuidesPage = lazyRetry(
  () => import("@/domains/legal/technology/EngineeringGuidesPage").then((module) => ({
    default: module.EngineeringGuidesPage,
  })),
  "EngineeringGuidesPage",
);
export const EngineeringFieldNotesPage = lazyRetry(
  () => import("@/domains/legal/technology/EngineeringFieldNotesPage").then((module) => ({
    default: module.EngineeringFieldNotesPage,
  })),
  "EngineeringFieldNotesPage",
);
export const EngineeringDeckPage = lazyRetry(
  () => import("@/domains/legal/technology/EngineeringDeckPage").then((module) => ({
    default: module.EngineeringDeckPage,
  })),
  "EngineeringDeckPage",
);
export const EngineeringVideosPage = lazyRetry(
  () => import("@/domains/legal/technology/EngineeringVideosPage").then((module) => ({
    default: module.EngineeringVideosPage,
  })),
  "EngineeringVideosPage",
);
export const EngineeringLicensesPage = lazyRetry(
  () => import("@/domains/legal/technology/EngineeringLicensesPage").then((module) => ({
    default: module.EngineeringLicensesPage,
  })),
  "EngineeringLicensesPage",
);
export const ProductPrinciplesPage = lazyRetry(
  () => import("@/domains/legal/ProductPrinciplesPage").then((module) => ({
    default: module.ProductPrinciplesPage,
  })),
  "ProductPrinciplesPage",
);
export const HelpCenterPage = lazyRetry(
  () => import("@/domains/legal/HelpCenterPage").then((module) => ({
    default: module.HelpCenterPage,
  })),
  "HelpCenterPage",
);
export const AccessibilityPage = lazyRetry(
  () => import("@/domains/legal/AccessibilityPage").then((module) => ({
    default: module.AccessibilityPage,
  })),
  "AccessibilityPage",
);
export const CrawlerPolicyPage = lazyRetry(
  () => import("@/domains/legal/CrawlerPolicyPage").then((module) => ({
    default: module.CrawlerPolicyPage,
  })),
  "CrawlerPolicyPage",
);
export const DataSourcesPage = lazyRetry(
  () => import("@/domains/creator-resources/SourcesPage").then((module) => ({
    default: module.SourcesPage,
  })),
  "DataSourcesPage",
);
export const DesignSystemPage = lazyRetry(
  () => import("@/domains/legal/DesignSystemPage").then((module) => ({
    default: module.DesignSystemPage,
  })),
  "DesignSystemPage",
);
export const SitemapPage = lazyRetry(
  () => import("@/domains/legal/SitemapPage").then((module) => ({
    default: module.SitemapPage,
  })),
  "SitemapPage",
);
export const CopyrightPage = lazyRetry(
  () => import("@/domains/legal/CopyrightPage").then((module) => ({
    default: module.CopyrightPage,
  })),
  "CopyrightPage",
);
export const TermsPage = lazyRetry(
  () => import("@/domains/legal/PolicyPage").then((module) => ({
    default: module.TermsPage,
  })),
  "TermsPage",
);
export const PrivacyPage = lazyRetry(
  () => import("@/domains/legal/PolicyPage").then((module) => ({
    default: module.PrivacyPage,
  })),
  "PrivacyPage",
);
export const ContactPage = lazyRetry(
  () => import("@/domains/legal/ContactPage").then((module) => ({
    default: module.ContactPage,
  })),
  "ContactPage",
);
export const SupportPage = lazyRetry(
  () => import("@/domains/legal/SupportPage").then((module) => ({
    default: module.SupportPage,
  })),
  "SupportPage",
);
export const FeedbackPage = lazyRetry(
  () => import("@/domains/legal/FeedbackPage").then((module) => ({
    default: module.FeedbackPage,
  })),
  "FeedbackPage",
);
