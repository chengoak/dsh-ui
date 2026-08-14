/**
 * Locate the `dsh` binary on the user's system.
 *
 * Resolution order:
 *   1. DSH_BIN env var (escape hatch for testing / custom installs)
 *   2. PATH (via `which` / `where`)
 *
 * Returns null when no `dsh` is found. The caller is responsible for
 * surfacing a clear error to the user (we don't want to throw from a
 * startup helper — the window is what the user sees).
 */
import { execFileSync } from 'node:child_process'

const isWindows = process.platform === 'win32'
const whichCmd = isWindows ? 'where' : 'which'

export function resolveDshBin(): string | null {
  if (process.env.DSH_BIN) return process.env.DSH_BIN

  try {
    const out = execFileSync(whichCmd, ['dsh'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const first = out.split(/\r?\n/).map((s) => s.trim()).find(Boolean)
    return first ?? null
  } catch {
    return null
  }
}
