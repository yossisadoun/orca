import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub project Pages: https://<user>.github.io/<repo>/
const pagesBase = "/orca/";

export default defineConfig(({ command }) => ({
  base: command === "serve" ? "/" : pagesBase,
  plugins: [react()],
  server: {
    // Prefer 5180; if something else is bound there (stale dev server, other app),
    // try the next port instead of exiting — use the URL printed in the terminal.
    port: 5180,
    strictPort: false,
    host: true,
  },
}));
