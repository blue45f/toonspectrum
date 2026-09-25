import type { CapacitorConfig } from "@capacitor/cli";

const productionServerUrl = "https://www.toonstudio.cloud/studio";
const configuredServerUrl = process.env.TOONSTUDIO_MOBILE_SERVER_URL?.trim();
const serverUrl = configuredServerUrl || productionServerUrl;

const config: CapacitorConfig = {
  appId: "cloud.toonstudio.app",
  appName: "툰스튜디오",
  webDir: "shell",
  backgroundColor: "#10182d",
  appendUserAgent: " ToonStudioMobile/0.1.0",
  loggingBehavior: process.env.NODE_ENV === "production" ? "none" : "debug",
  zoomEnabled: false,
  initialFocus: true,
  server: {
    url: serverUrl,
    cleartext: false,
    allowNavigation: ["www.toonstudio.cloud", "toonstudio.cloud"],
    errorPath: "offline.html",
    androidScheme: "https",
  },
  android: {
    backgroundColor: "#10182d",
    allowMixedContent: false,
    zoomEnabled: false,
  },
  ios: {
    backgroundColor: "#10182d",
    contentInset: "automatic",
    zoomEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: "#10182d",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: "LIGHT",
      backgroundColor: "#10182d",
      overlaysWebView: false,
    },
    Keyboard: {
      resize: "native",
      style: "DARK",
      resizeOnFullScreen: true,
    },
  },
};

export default config;
