# dsh-ui

[English](README.md) · [简体中文](README.zh-CN.md)

Cross-platform desktop GUI for [DeepSeek Harness (`dsh`)](https://github.com/deepseek-ai/deepseek-harness).

`dsh-ui` is a thin Electron shell. It does **not** reimplement the agent — it
locates the official `dsh` CLI, spawns `dsh web` as a child process, waits for
the Web UI to be ready, and loads that URL into a native window.

## Why

`dsh web` already ships a full Web UI served at `http://127.0.0.1:3080`. That
works in a browser, but a browser tab is not a desktop app: no dock icon, no
`Cmd+Q` quit, no proper window menu, no per-app `dsh` traffic isolation.
`dsh-ui` wraps it in a real native shell so the Web UI behaves like a first-
class macOS / Windows / Linux application.

## Requirements

- Node.js 22.19+ (matches the `dsh` engines)
- The official [`@deepseek-ai/dsh`](https://www.npmjs.com/package/@deepseek-ai/dsh)
  CLI installed and on your `PATH`:

  ```sh
  npm install -g @deepseek-ai/dsh
  dsh --version
  ```

- A `DEEPSEEK_API_KEY` in your environment (or your provider's equivalent
  auth — see the `dsh` docs).

## Install

```sh
# macOS / Windows: download the latest release from
#   https://github.com/chengoak/dsh-ui/releases
# Linux: download the .AppImage
```

## Develop

```sh
git clone https://github.com/chengoak/dsh-ui
cd dsh-ui
npm install
npm run dev
```

`npm run dev` runs the Electron main in `tsc --watch` and the Vite renderer
in dev mode. The Electron window opens against the renderer dev server (a
loading page) for hot-reload of the fallback pages; the real dsh web UI is
still loaded from your locally-installed `dsh`.

## Build a release artifact

```sh
npm run dist:mac      # macOS .dmg (arm64 + x64)
npm run dist:win      # Windows .exe (NSIS installer, x64)
npm run dist:linux    # Linux .AppImage (x64)
npm run dist:all      # all three (only meaningful on macOS — cross-build needs extra setup)
```

Output goes to `release/`.

### Code signing

The default config produces **unsigned** artifacts. End-users will see a
Gatekeeper warning on macOS and a SmartScreen warning on Windows. To sign,
add `identity` (mac) and `certificateFile` / `certificatePassword` (win) to
`electron-builder.yml`.

## How it works

```
dsh-ui (Electron)
├── main process
│   ├── probe 127.0.0.1:3080    ← already-running dsh web? reuse it (loadURL, no child)
│   ├── resolveDshBin()         ← which dsh / $DSH_BIN
│   ├── startDshWeb()           ← spawn `dsh web`, parse URL from stdout
│   ├── probe 127.0.0.1:port    ← confirm server actually answers
│   └── BrowserWindow loadURL
└── on quit → SIGTERM dsh (only when this app spawned it)
```

The dsh CLI prints a line like

```
[10:23:01] Web UI: http://127.0.0.1:3080
```

once its webServer is bound. `dsh-ui` regex-matches that line for the port,
then polls the URL until it returns 200, then navigates the BrowserWindow to
it. The dsh child receives SIGTERM when the window closes (or `app` quits
on non-macOS).

## Custom `dsh` path

If `dsh` is not on your `PATH` (e.g. installed via `nvm` to a custom prefix),
set the `DSH_BIN` environment variable to the absolute path before launching
`dsh-ui`:

```sh
DSH_BIN="$HOME/.nvm/versions/node/v22.19.0/bin/dsh" dsh-ui
```

## Project layout

```
src/
├── main/
│   ├── main.ts            Electron app + BrowserWindow lifecycle
│   ├── dsh-process.ts     spawn dsh web, wait for ready, kill on quit
│   └── resolve-dsh.ts     which dsh / DSH_BIN
├── preload/
│   └── preload.ts         context-isolated bridge (currently a placeholder)
└── renderer/
    ├── missing-dsh.html   shown when dsh is not on PATH
    └── dsh-failed.html    shown when dsh exited / timed out
electron-builder.yml      cross-platform packaging (mac/win/linux)
```

## Acknowledgements / Trademarks

This project is an unofficial community GUI wrapper. The DeepSeek name and
dolphin/whale logo are trademarks of DeepSeek AI. The logo in `build/icon.*`
is sourced from DeepSeek's public website and is used here for product
identification under fair use; it is not an endorsement by DeepSeek AI.
For official builds, swap `build/icon.*` for assets you have the right to
ship.

## License

MIT.
