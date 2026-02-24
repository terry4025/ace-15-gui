import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  define: {
    __STUDIO_UI_VERSION__: JSON.stringify(process.env.npm_package_version || "0.0.0"),
    __STUDIO_BUILD_TIME__: JSON.stringify(new Date().toISOString())
  },
  server: {
    port: 5173,
    strictPort: true
  }
});
