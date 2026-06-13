import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const teamApiTarget = process.env.TEAM_CONSOLE_API_TARGET ?? "http://127.0.0.1:8888";
const backendProxy = () => ({
  target: teamApiTarget,
  changeOrigin: true,
});

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/v1": backendProxy(),
      "/playground": backendProxy(),
      "/assets": backendProxy(),
      "/runtime": backendProxy(),
      "/vendor": backendProxy(),
      "/ugk-claw-logo.svg": backendProxy(),
      "/ugk-claw-logo-light.svg": backendProxy(),
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replaceAll("\\", "/");
          if (normalizedId.includes("/node_modules/react/") || normalizedId.includes("/node_modules/react-dom/") || normalizedId.includes("/node_modules/scheduler/")) {
            return "vendor-react";
          }
          if (normalizedId.includes("/node_modules/marked/")) {
            return "vendor-markdown";
          }
        },
      },
    },
  },
});
