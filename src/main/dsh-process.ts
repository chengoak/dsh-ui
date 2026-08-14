/**
 * Spawn the `dsh web` subprocess and report when its HTTP server is ready.
 *
 * The dsh CLI does not expose a `--print-port` flag today, so we read the
 * loopback URL out of stdout (it always logs `Web UI: http://127.0.0.1:<port>`
 * once the webServer is up). We use a one-shot poll on the URL rather than
 * fragile stdout parsing alone — both signals are combined to be robust.
 *
 * Lifecycle:
 *   - Returns a handle with the child process, the resolved port, and a
 *     `waitReady()` promise.
 *   - On Electron quit, call `handle.kill()` to SIGTERM the dsh child.
 *   - All stdout/stderr from dsh is forwarded to the parent console (so
 *     `dsh` errors still show up in the user's terminal / Electron logs).
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import http from 'node:http'

const READY_TIMEOUT_MS = 30_000
const READY_POLL_MS = 250

/** Match `http://127.0.0.1:1234` or `http://localhost:1234` in dsh stdout. */
const URL_RE = /https?:\/\/(?:127\.0\.0\.1|localhost)(?::(\d+))?\b/

export interface DshHandle {
  child: ChildProcess
  readonly port: number
  waitReady(): Promise<void>
  kill(): void
}

export function startDshWeb(dshBin: string): DshHandle {
  // `--port 0` would be ideal (let OS pick a free port), but dsh web
  // currently picks its own port from config / defaults. We do NOT pass
  // --port; we read whatever port dsh chose from its boot log.
  const child = spawn(dshBin, ['web'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  })

  let port: number | null = null
  let readyResolve: () => void = () => {}
  let readyReject: (err: Error) => void = () => {}
  const readyPromise = new Promise<void>((resolve, reject) => {
    readyResolve = resolve
    readyReject = reject
  })

  const onChunk = (buf: Buffer): void => {
    const text = buf.toString('utf8')
    process.stdout.write(`[dsh] ${text}`)
    if (port === null) {
      const m = URL_RE.exec(text)
      if (m && m[1]) {
        port = Number.parseInt(m[1], 10)
        readyResolve()
      }
    }
  }

  child.stdout?.on('data', onChunk)
  child.stderr?.on('data', (b: Buffer) => process.stderr.write(`[dsh!] ${b.toString('utf8')}`))

  child.on('exit', (code, signal) => {
    process.stdout.write(`[dsh] exited code=${code} signal=${signal}\n`)
    if (port === null) {
      readyReject(new Error(`dsh exited (code=${code} signal=${signal}) before printing its URL`))
    }
  })

  /** Poll the resolved URL until dsh actually answers 200 on `/`. */
  const waitReady = async (): Promise<void> => {
    // First, wait for the URL to appear in stdout (or for dsh to exit).
    await readyPromise

    const target = port
    if (target === null) {
      throw new Error('dsh did not print a port')
    }

    // Then, confirm the server is actually serving (the URL line can appear
    // a hair before bind() completes).
    const deadline = Date.now() + READY_TIMEOUT_MS
    while (Date.now() < deadline) {
      if (await probe(target)) return
      await delay(READY_POLL_MS)
    }
    throw new Error(`dsh web did not respond on http://127.0.0.1:${target}/ within ${READY_TIMEOUT_MS}ms`)
  }

  return {
    child,
    get port(): number {
      if (port === null) throw new Error('dsh has not yet printed its port')
      return port
    },
    waitReady,
    kill(): void {
      if (!child.killed) child.kill('SIGTERM')
    },
  }
}

function probe(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/', timeout: 1000 }, (res) => {
      res.resume()
      resolve(res.statusCode === 200)
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => {
      req.destroy()
      resolve(false)
    })
  })
}
