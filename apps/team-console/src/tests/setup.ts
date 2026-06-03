import "@testing-library/jest-dom/vitest";

if (typeof window !== "undefined" && typeof window.localStorage?.clear !== "function") {
  const store = new Map<string, string>();
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: storage,
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
} else if (typeof window !== "undefined") {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: window.localStorage,
  });
}

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
