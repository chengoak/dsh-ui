/**
 * Minimal preload — context-isolated bridge.
 *
 * Today this exposes the app's `dshUI` info bridge and the `dshFind` bridge
 * used by the injected find-in-page overlay (see src/main/find-bar.ts). The
 * dsh web UI talks to dsh over its own HTTP / WS port, not through us. Kept
 * small so future "open file" / "show in folder" / "system tray" features
 * have a typed seam to grow into.
 */
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('dshUI', {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
})

/** Bridge for the find-in-page overlay injected by the main process. */
contextBridge.exposeInMainWorld('dshFind', {
  search: (text: string) => ipcRenderer.send('dsh-find-search', text),
  next: () => ipcRenderer.send('dsh-find-next'),
  prev: () => ipcRenderer.send('dsh-find-prev'),
  close: () => ipcRenderer.send('dsh-find-close'),
  onResult: (cb: (result: { matches: number; active: number }) => void) => {
    ipcRenderer.removeAllListeners('dsh-find-result')
    ipcRenderer.on('dsh-find-result', (_event, result) => cb(result))
  },
})
