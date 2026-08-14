/**
 * Minimal preload — context-isolated bridge.
 *
 * Today this exposes nothing (the dsh web UI talks to dsh over its own HTTP
 * / WS port, not through us). Kept as a placeholder so the webPreferences
 * preload path resolves and future "open file" / "show in folder" / "system
 * tray" features have a typed seam to grow into.
 */
import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('dshUI', {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
})
