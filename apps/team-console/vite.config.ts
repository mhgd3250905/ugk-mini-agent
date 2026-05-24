import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const teamApiTarget = process.env.TEAM_CONSOLE_API_TARGET ?? "http://127.0.0.1:3000";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/v1/team": {
        target: teamApiTarget,
        changeOrigin: true,
      },
      "/v1/agents": {
        target: teamApiTarget,
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
