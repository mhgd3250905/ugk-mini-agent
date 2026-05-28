import "@testing-library/jest-dom/vitest";

const originalError = console.error;
console.error = (...args: unknown[]) => {
  if (typeof args[0] === "string" && args[0].includes("`key` is not a prop")) return;
  originalError.apply(console, args);
};
