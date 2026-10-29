import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Dev: Vite su :5173. La SPA parla al BFF Console via `/api/*`: in produzione
// Caddy fa da reverse proxy sulla stessa origine, in sviluppo Vite inoltra
// `/api` al BFF locale (:3000) preservando i cookie di sessione.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_DEV_API_TARGET ?? "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    rollupOptions: {
      output: {
        // Le pagine sono gia' caricate in lazy (chunk per route). Qui separiamo
        // anche le librerie di terze parti in chunk vendor stabili, cosi'
        // nessun chunk supera la soglia di 500 kB e la cache del browser resta
        // efficace fra deploy.
        manualChunks: {
          "react-vendor": ["react", "react-dom", "react-router-dom"],
          "query-vendor": ["@tanstack/react-query"],
          "motion-vendor": ["framer-motion"],
          "ui-vendor": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-dropdown-menu",
            "@radix-ui/react-switch",
            "@radix-ui/react-tabs",
            "@radix-ui/react-tooltip",
            "@headlessui/react",
          ],
        },
      },
    },
  },
});
