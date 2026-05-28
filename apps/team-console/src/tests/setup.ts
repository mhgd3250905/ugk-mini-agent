import "@testing-library/jest-dom/vitest";

// React 19 emits a known warning when `key` is set on SVG intrinsic elements.
// It uses printf-style format: console.error("%s: `key` is not a prop...", "g").
// Only suppress the SVG <g> element case from renderConnectorSourceSocket;
// any other `key` misuse on different elements must surface.
const originalError = console.error;
console.error = (...args: unknown[]) => {
  if (
    args.length >= 2
    && typeof args[0] === "string" && args[0].startsWith("%s: `key` is not a prop.")
    && args[1] === "g"
  ) return;
  originalError.apply(console, args);
};
