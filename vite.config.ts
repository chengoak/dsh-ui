import { defineConfig } from 'vite'
import { resolve } from 'node:path'

// Minimal renderer: a tiny shell that just shows the dsh web URL is loading.
// The actual dsh UI is loaded directly into the BrowserWindow via loadURL()
// pointing at the dsh web server. This Vite build only produces a fallback
// "loading" page used when dsh is not running yet or has exited.
//
// We have two static HTML files (missing-dsh.html, dsh-failed.html) and no
// JS entry — Vite needs a "build" with input mapped to the existing files
// so it just copies them to dist/renderer/ without trying to transform code.
export default defineConfig({
  root: 'src/renderer',
  build: {
    outDir: resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        'missing-dsh': resolve(__dirname, 'src/renderer/missing-dsh.html'),
        'dsh-failed': resolve(__dirname, 'src/renderer/dsh-failed.html'),
      },
    },
  },
  server: { port: 5173 },
})
