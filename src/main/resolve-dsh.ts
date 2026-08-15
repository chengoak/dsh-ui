/**
 * Locate the `dsh` CLI executable on the user's system.
 *
 * Resolution order:
 *   1. DSH_BIN env var (escape hatch for testing / custom installs)
 *   2. PATH
 *
 * Windows gotcha: we must NOT use `where dsh` naively. `where` searches the
 * current working directory *first*, and this app is normally launched with
 * its CWD set to its own install directory (both the Start Menu shortcut and
 * Explorer set it there). On Windows that makes `where dsh` resolve to the
 * app's own `dsh.exe`, so the app would spawn copies of itself — an infinite
 * dsh.exe process chain. We therefore walk PATH manually, never look at the
 * CWD, skip our own executable, and only accept files Windows can actually
 * spawn (dsh.exe / dsh.cmd / dsh.bat). The extensionless `dsh` shim that npm
 * installs on Windows is a POSIX shell script and cannot be spawned directly
 * (spawn fails with ENOENT), so it is intentionally not a candidate.
 *
 * Returns null when no `dsh` is found. The caller is responsible for
 * surfacing a clear error to the user (we don't want to throw from a
 * startup helper — the window is what the user sees).
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const isWindows = process.platform === 'win32'

/** Windows-spawnable `dsh` file names, in PATHEXT preference order. */
const WINDOWS_CANDIDATES = ['.exe', '.cmd', '.bat'].map((ext) => `dsh${ext}`)

/**
 * Pure PATH search for a spawnable `dsh` executable.
 *
 * `pathEnv` is a PATH-style string (`;`-separated on Windows, `:` elsewhere),
 * `selfPath` is the current executable path (`process.execPath`) and is
 * skipped so the app can never resolve to — and then spawn — itself.
 *
 * Exported separately so the regression tests can exercise it directly.
 */
export function findDshInPath(pathEnv: string, selfPath: string): string | null {
  const sep = isWindows ? ';' : ':'
  const selfNorm = isWindows ? selfPath.toLowerCase() : selfPath
  for (const dir of pathEnv.split(sep)) {
    if (!dir) continue
    const names = isWindows ? WINDOWS_CANDIDATES : ['dsh']
    for (const name of names) {
      const candidate = join(dir, name)
      const candidateNorm = isWindows ? candidate.toLowerCase() : candidate
      if (candidateNorm === selfNorm) continue
      if (existsSync(candidate)) return candidate
    }
  }
  return null
}

export function resolveDshBin(): string | null {
  if (process.env.DSH_BIN) return process.env.DSH_BIN

  if (isWindows) {
    return findDshInPath(process.env.PATH ?? '', process.execPath)
  }

  try {
    const out = execFileSync('which', ['dsh'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const first = out.split(/\r?\n/).map((s) => s.trim()).find(Boolean)
    return first ?? null
  } catch {
    return null
  }
}
