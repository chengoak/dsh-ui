import { defineConfig } from 'vite'

// Minimal renderer: a tiny shell that just shows the dsh web URL is loading.
// The actual dsh UI is loaded directly into the BrowserWindow via loadURL()
// pointing at the dsh web server. This Vite build only produces a fallback
// "loading" page used when dsh is not running yet or has exited.
export default defineConfig({
  root: 'src/renderer',
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
  },
  server: { port: 5173 },
})
