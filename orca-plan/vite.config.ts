import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const devPort = Number(process.env.ORCA_PLAN_DEV_PORT ?? 5173);
/** When set (e.g. by `npm run dev:electron`), fail if the port is taken so Electron and Vite stay in sync. */
const strictDevPort = process.env.ORCA_PLAN_DEV_PORT != null;

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Required so `dist/index.html` works when opened via `file://` from Electron.
  base: './',
  server: { host: '127.0.0.1', port: devPort, strictPort: strictDevPort },
})
