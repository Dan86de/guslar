import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
    // PixiJS alone is ~650 kB minified, and the map is served from localhost.
    chunkSizeWarningLimit: 1000,
  },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:4747",
      "/ws": { target: "ws://127.0.0.1:4747", ws: true },
    },
  },
})
