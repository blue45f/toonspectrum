import { defineConfig } from "@apps-in-toss/web-framework/config";

export default defineConfig({
  appName: "toonspectrum",
  brand: {
    displayName: "툰스펙트럼",
    primaryColor: "#F0A868",
    icon: "https://toonspectrum.vercel.app/icon-512.png",
  },
  web: {
    host: "localhost",
    port: 5181,
    commands: {
      dev: "vite --host localhost --port 5181",
      build: "vite build",
    },
  },
  permissions: [
    { name: "clipboard", access: "read" },
    { name: "clipboard", access: "write" },
  ],
  outdir: "dist",
  webViewProps: { type: "partner" },
  navigationBar: { withBackButton: true, withHomeButton: true, theme: "light" },
});
