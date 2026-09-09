export {};

declare global {
  interface NumberConstructor {
    /** Runtime-safe integer validation also proves the checked value is a number. */
    isSafeInteger(value: unknown): value is number;
  }
}
