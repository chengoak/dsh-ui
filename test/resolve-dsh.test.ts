/**
 * Regression tests for Windows dsh resolution.
 *
 * The bug being locked down: `where dsh` searches the current working
 * directory first, and the app is normally launched with its CWD set to its
 * own install directory — so it resolved to its own `dsh.exe` and spawned
 * infinite copies of itself (hundreds of dsh.exe processes, verified live).
 * The resolver must walk PATH only, skip its own executable, and accept only
 * files Windows can actually spawn.
 *
 * Run with:  npm test   (node --experimental-strip-types --test ...)
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { findDshInPath } from '../src/main/resolve-dsh.ts'

const isWindows = process.platform === 'win32'

function makeDir(name: string, files: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), `dsh-ui-${name}-`))
  for (const f of files) writeFileSync(join(dir, f), '')
  return dir
}

test('skips the app\'s own executable (self-spawn regression)', { skip: !isWindows }, () => {
  // The app's install dir contains dsh.exe — exactly the self-resolution
  // that used to cause the infinite spawn chain.
  const appDir = makeDir('self', ['dsh.exe'])
  try {
    assert.equal(findDshInPath(appDir, join(appDir, 'dsh.exe')), null)
  } finally {
    rmSync(appDir, { recursive: true, force: true })
  }
})

test('picks dsh.cmd and ignores the extensionless POSIX shim', { skip: !isWindows }, () => {
  // npm installs `dsh` (POSIX script, unspawnable on Windows) + `dsh.cmd`.
  const npmDir = makeDir('npm', ['dsh', 'dsh.cmd', 'dsh.ps1'])
  try {
    assert.equal(findDshInPath(npmDir, 'C:\\irrelevant\\dsh.exe'), join(npmDir, 'dsh.cmd'))
  } finally {
    rmSync(npmDir, { recursive: true, force: true })
  }
})

test('prefers dsh.exe over dsh.cmd when both exist', { skip: !isWindows }, () => {
  const dir = makeDir('exe', ['dsh.exe', 'dsh.cmd'])
  try {
    assert.equal(findDshInPath(dir, 'C:\\irrelevant\\dsh.exe'), join(dir, 'dsh.exe'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('returns null when only the extensionless shim exists', { skip: !isWindows }, () => {
  const dir = makeDir('shim', ['dsh'])
  try {
    assert.equal(findDshInPath(dir, 'C:\\irrelevant\\dsh.exe'), null)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('returns null on empty or separator-only PATH', { skip: !isWindows }, () => {
  assert.equal(findDshInPath('', 'C:\\irrelevant\\dsh.exe'), null)
  assert.equal(findDshInPath(';;;', 'C:\\irrelevant\\dsh.exe'), null)
})

test('multi-dir PATH searches in order and skips self', { skip: !isWindows }, () => {
  // Install dir (self) first, npm dir second: must skip self and find dsh.cmd.
  const selfDir = makeDir('self2', ['dsh.exe'])
  const npmDir = makeDir('npm2', ['dsh.cmd'])
  try {
    const path = [selfDir, npmDir].join(';')
    assert.equal(findDshInPath(path, join(selfDir, 'dsh.exe')), join(npmDir, 'dsh.cmd'))
  } finally {
    rmSync(selfDir, { recursive: true, force: true })
    rmSync(npmDir, { recursive: true, force: true })
  }
})
