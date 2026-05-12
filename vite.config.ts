import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Prefer 5180; if something else is bound there (stale dev server, other app),
    // try the next port instead of exiting — use the URL printed in the terminal.
    port: 5180,
    strictPort: false,
    host: true,
  },
});
