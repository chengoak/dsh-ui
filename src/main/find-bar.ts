/**
 * Custom find-in-page bar.
 *
 * Electron's `webContents.findInPage()` performs the search and highlights
 * matches, but it does NOT render Chromium's find bar UI (that bar is part
 * of Chrome's browser chrome and is not shipped by Electron). So we build a
 * small overlay bar ourselves and inject it into the page.
 *
 * Flow:
 *   - Menu "Find" (Ctrl+F) -> showFindBar() injects the overlay via
 *     webContents.executeJavaScript() and focuses its input.
 *   - The overlay calls the `window.dshFind` bridge (exposed by the preload)
 *     to send the query / next / prev / close over IPC.
 *   - The main process drives webContents.findInPage() and forwards
 *     found-in-page results back to the overlay for the match counter.
 */
import { ipcMain, type BrowserWindow } from 'electron'

let findQuery = ''

/** Inject (or recreate) the find bar overlay into the given window. */
export function showFindBar(win: BrowserWindow): void {
  win.show()
  win.focus()
  win.webContents.executeJavaScript(FIND_BAR_JS, true).catch((err: Error) => {
    console.error('[find] failed to inject find bar:', err)
  })
}

/** Forward found-in-page results from the window's webContents to the overlay. */
export function attachFindBar(win: BrowserWindow): void {
  const wc = win.webContents
  wc.on('found-in-page', (_event, result) => {
    if (!wc.isDestroyed()) {
      wc.send('dsh-find-result', { matches: result.matches, active: result.activeMatchOrdinal })
    }
  })
}

/** Wire the IPC channels the overlay uses to drive findInPage. */
export function wireFindIpc(): void {
  ipcMain.on('dsh-find-search', (event, text: unknown) => {
    findQuery = String(text ?? '')
    if (findQuery) event.sender.findInPage(findQuery)
  })
  ipcMain.on('dsh-find-next', (event) => {
    if (findQuery) event.sender.findInPage(findQuery, { forward: true, findNext: true })
  })
  ipcMain.on('dsh-find-prev', (event) => {
    if (findQuery) event.sender.findInPage(findQuery, { forward: false, findNext: true })
  })
  ipcMain.on('dsh-find-close', (event) => {
    event.sender.stopFindInPage('clearSelection')
  })
}

/**
 * Overlay markup/logic injected into the page. Written defensively against
 * the page's CSP: the DOM is built with createElement + element.style (CSP
 * does not block programmatic style assignment) and no <style> tags or
 * inline HTML styles are introduced.
 */
const FIND_BAR_JS = `(() => {
  const ROOT_ID = 'dsh-ui-findbar'
  const old = document.getElementById(ROOT_ID)
  if (old) old.remove()

  const bar = document.createElement('div')
  bar.id = ROOT_ID
  const st = bar.style
  st.position = 'fixed'; st.top = '8px'; st.right = '8px'; st.zIndex = '2147483647'
  st.display = 'flex'; st.alignItems = 'center'; st.gap = '6px'
  st.background = '#2a2a2a'; st.border = '1px solid #555'; st.borderRadius = '8px'
  st.padding = '6px 8px'; st.boxShadow = '0 4px 16px rgba(0,0,0,0.5)'
  st.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  st.fontSize = '13px'

  const input = document.createElement('input')
  input.placeholder = 'Find in page'
  input.spellcheck = false
  const is = input.style
  is.width = '200px'; is.background = '#1e1e1e'; is.color = '#e0e0e0'
  is.border = '1px solid #555'; is.borderRadius = '4px'; is.padding = '4px 6px'
  is.outline = 'none'; is.fontSize = '13px'

  const count = document.createElement('span')
  count.textContent = '0/0'
  count.style.color = '#9e9e9e'; count.style.minWidth = '36px'; count.style.textAlign = 'center'

  const mkBtn = (label, title) => {
    const b = document.createElement('button')
    b.textContent = label; b.title = title
    const bs = b.style
    bs.background = 'transparent'; bs.color = '#e0e0e0'; bs.border = 'none'
    bs.cursor = 'pointer'; bs.fontSize = '13px'; bs.padding = '2px 6px'; bs.borderRadius = '4px'
    return b
  }
  const prevBtn = mkBtn('↑', 'Previous (Shift+Enter)')
  const nextBtn = mkBtn('↓', 'Next (Enter)')
  const closeBtn = mkBtn('✕', 'Close (Esc)')

  bar.append(input, count, prevBtn, nextBtn, closeBtn)
  document.body.appendChild(bar)

  const updateCount = (r) => {
    count.textContent = r && r.matches > 0 ? r.active + '/' + r.matches : '0/0'
  }
  if (window.dshFind && window.dshFind.onResult) window.dshFind.onResult(updateCount)

  let timer = null
  input.addEventListener('input', () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      if (window.dshFind) window.dshFind.search(input.value)
    }, 200)
  })
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); if (window.dshFind) window.dshFind.next() }
    else if (e.key === 'Escape') { close() }
  })
  prevBtn.addEventListener('click', () => { if (window.dshFind) window.dshFind.prev() })
  nextBtn.addEventListener('click', () => { if (window.dshFind) window.dshFind.next() })
  closeBtn.addEventListener('click', close)
  function close() {
    if (window.dshFind) window.dshFind.close()
    bar.remove()
  }
  input.focus()
})()
`
