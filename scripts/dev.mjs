#!/usr/bin/env node
// Dev mode: tsc --watch + Vite dev server + Electron, all wired together.
// Press Ctrl-C to stop everything cleanly.
//
// This is what the README has been promising since v0.1.0 but never
// shipped. Run with `npm run dev`.

import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

const procs = []

function start(name, cmd, args, opts = {}) {
  const p = spawn(cmd, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...opts,
  })
  procs.push({ name, p })
  p.on('exit', (code, signal) => {
    console.log(`[${name}] exited code=${code} signal=${signal}`)
    if (!opts.keepAlive) {
      shutdown(code ?? (signal ? 1 : 0))
    }
  })
  return p
}

function shutdown(code = 0) {
  for (const { name, p } of procs) {
    if (!p.killed) {
      console.log(`[${name}] stopping...`)
      try { p.kill('SIGTERM') } catch { /* ignore */ }
    }
  }
  // Hard-kill anything that ignored SIGTERM after 2s.
  setTimeout(() => {
    for (const { p } of procs) {
      if (!p.killed) {
        try { p.kill('SIGKILL') } catch { /* ignore */ }
      }
    }
    process.exit(code)
  }, 2000).unref()
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

console.log('==> Starting dsh-ui dev mode')

// 1. tsc --watch for the main process
start('tsc', 'npx', ['tsc', '-p', 'tsconfig.main.json', '--watch', '--preserveWatchOutput'])

// 2. Vite dev server for the renderer (fallback pages hot-reload here)
const vite = start('vite', 'npx', ['vite'], { keepAlive: true })

// 3. Wait for tsc to emit at least once (it logs "Found 0 errors" or similar)
//    and for vite to be ready, then start Electron.
const VITE_URL = 'http://localhost:5173'
const TSC_OUT_DIR = 'dist/main/main.js'

async function waitFor(predicate, label, { timeoutMs = 30_000, intervalMs = 200 } = {}) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try { if (await predicate()) return true } catch { /* ignore */ }
    await delay(intervalMs)
  }
  throw new Error(`Timed out waiting for: ${label}`)
}

async function main() {
  await waitFor(
    async () => {
      const { existsSync } = await import('node:fs')
      return existsSync(TSC_OUT_DIR)
    },
    'tsc to emit dist/main/main.js',
  )
  console.log('==> tsc ready, vite up — starting Electron')

  // Tell the main process to load the Vite dev server instead of the
  // bundled renderer/ so the missing-dsh / dsh-failed pages hot-reload.
  start('electron', 'npx', ['electron', '.'], {
    env: { ...process.env, DSH_UI_DEV_VITE_URL: VITE_URL },
  })
}

main().catch((err) => {
  console.error(err)
  shutdown(1)
})
