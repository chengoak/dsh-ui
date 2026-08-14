/**
 * Electron main entry point.
 *
 * Lifecycle:
 *   1. Resolve the `dsh` binary (PATH or DSH_BIN env).
 *   2. If missing, open the BrowserWindow pointed at a "missing dsh" page
 *      built into dist/renderer and let the user know.
 *   3. Otherwise spawn `dsh web` as a child, wait for the URL to appear,
 *      then load that URL into the BrowserWindow.
 *   4. SIGTERM the child when the window closes.
 */
import { app, BrowserWindow, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { resolveDshBin } from './resolve-dsh.js'
import { startDshWeb } from './dsh-process.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const RENDERER_DIR = join(__dirname, '..', 'renderer')

let mainWindow: BrowserWindow | null = null
let dsh: DshHandle | null = null

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'dsh',
    backgroundColor: '#1e1e1e',
    show: false,
    webPreferences: {
      preload: join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  // Open external links in the user's default browser, not in the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  const dshBin = resolveDshBin()
  if (!dshBin) {
    await mainWindow.loadFile(join(RENDERER_DIR, 'missing-dsh.html'))
    return
  }

  dsh = startDshWeb(dshBin)
  try {
    await dsh.waitReady()
  } catch (err) {
    console.error('dsh failed to start:', err)
    dsh?.kill()
    dsh = null
    await mainWindow.loadFile(join(RENDERER_DIR, 'dsh-failed.html'))
    return
  }

  await mainWindow.loadURL(`http://127.0.0.1:${dsh.port}/`)
}

app.whenReady().then(() => {
  void createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
})

app.on('window-all-closed', () => {
  dsh?.kill()
  dsh = null
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  dsh?.kill()
  dsh = null
})
