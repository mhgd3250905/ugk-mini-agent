import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const teamApiTarget = process.env.TEAM_CONSOLE_API_TARGET ?? "http://127.0.0.1:3000";
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
});
