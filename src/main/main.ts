/**
 * Electron main entry point.
 *
 * Lifecycle:
 *   1. If a dsh web is already serving on 127.0.0.1:3080 (started manually or
 *      by another dsh-ui), reuse it — load that URL directly, no child spawned,
 *      nothing killed on quit.
 *   2. Otherwise resolve the `dsh` binary (PATH or DSH_BIN env).
 *   3. If missing, open the BrowserWindow pointed at a "missing dsh" page
 *      built into dist/renderer and let the user know.
 *   4. Otherwise spawn `dsh web` as a child, wait for the URL to appear,
 *      then load that URL into the BrowserWindow.
 *   5. SIGTERM the child when the window closes.
 */
import { app, BrowserWindow, Menu, shell, type MenuItemConstructorOptions } from 'electron'
import { join } from 'node:path'
import { resolveDshBin } from './resolve-dsh'
import { startDshWeb, probe, DEFAULT_DSH_PORT, type DshHandle } from './dsh-process'

const RENDERER_DIR = join(__dirname, '..', 'renderer')

const GITHUB_URL = 'https://github.com/chengoak/dsh-ui'

let mainWindow: BrowserWindow | null = null
let dsh: DshHandle | null = null

/** Standard application menu with a Help → GitHub item. */
function installAppMenu(): void {
  const template: MenuItemConstructorOptions[] = []
  if (process.platform === 'darwin') template.push({ role: 'appMenu' })
  template.push(
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        {
          label: 'GitHub Repository',
          click: () => {
            void shell.openExternal(GITHUB_URL)
          },
        },
      ],
    },
  )
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'dsh-ui',
    backgroundColor: '#1e1e1e',
    show: true,
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

  // Reuse an already-running dsh web (started manually, or by another dsh-ui)
  // instead of spawning a duplicate: probe the default port first. A reused
  // server is NOT owned by this app — we never kill it on quit.
  if (await probe(DEFAULT_DSH_PORT)) {
    await mainWindow.loadURL(`http://127.0.0.1:${DEFAULT_DSH_PORT}/`)
    return
  }

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

// Single-instance lock. Defense in depth: even if dsh resolution ever
// regressed and pointed back at this app's own executable, a spawned second
// instance would immediately quit instead of starting another chain.
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(() => {
    installAppMenu()
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
}
