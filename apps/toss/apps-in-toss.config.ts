import { defineConfig } from "@apps-in-toss/web-framework/config";

export default defineConfig({
  appName: "toonspectrum",
  brand: {
    primaryColor: "#F0A868",
  },
  permissions: [
    { name: 'clipboard', access: 'read' },
    { name: 'clipboard', access: 'write' },
  ],
  webView: {},
  webBundleDir: "dist",
  navigationBar: { withBackButton: true, withHomeButton: true, theme: 'dark' },
});
