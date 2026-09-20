/** Original field recordings; independent of the site OST playlist and multiplayer media. */
export const STUDIO_AMBIENT_TRACKS = [
  { id: "gentle-rain", labelKo: "잔잔한 빗소리", labelEn: "Gentle rain", duration: 45,
    src: "/assets/virtual-studio/ambient-audio/gentle-window-rain.ogg", bytes: 913769,
    sha256: "73a0f5ef19ed9f64599c0425b1fb52d857acfc42c0fd5eab85c4577ace18f0ed" },
  { id: "window-rain", labelKo: "창가 빗소리", labelEn: "Window rain", duration: 27,
    src: "/assets/virtual-studio/ambient-audio/window-rain.ogg", bytes: 550049,
    sha256: "4f659f68cf5219007d0bb0969a1862491ceee4057fda4c491c6001e8608fa2cb" },
] as const;
export type StudioAmbientTrackId = typeof STUDIO_AMBIENT_TRACKS[number]["id"];
export const STUDIO_AMBIENT_SOURCE = "https://opengameart.org/content/rain-loopable";
export const STUDIO_AMBIENT_LICENSE = "https://creativecommons.org/publicdomain/zero/1.0/";
