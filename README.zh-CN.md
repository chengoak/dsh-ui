# dsh-ui

[English](README.md) · [简体中文](README.zh-CN.md)

[DeepSeek Harness (`dsh`)](https://github.com/deepseek-ai/deepseek-harness) 的跨平台桌面客户端。

`dsh-ui` 是一个轻量的 Electron 壳。它**不**重写 agent —— 只是找到你本地的 `dsh` CLI，把 `dsh web` 拉起来当子进程，等 Web UI 就绪后塞进原生窗口。

## 为什么需要这个

`dsh web` 本身已经提供了完整的 Web UI，监听在 `http://127.0.0.1:3080`。在浏览器里能跑，但浏览器标签页不是桌面应用：没有 dock 图标、没有 `Cmd+Q` 退出、没有正经的窗口菜单、也没有独立的 `dsh` 流量隔离。

`dsh-ui` 把这个 Web UI 包进一个真正的原生窗口，让它像普通的 macOS / Windows / Linux 应用一样工作。**简单说：不开浏览器也能跑 dsh。**

## 环境要求

- Node.js 22.19+（跟 `dsh` 的 engines 字段一致）
- 官方 [`@deepseek-ai/dsh`](https://www.npmjs.com/package/@deepseek-ai/dsh) CLI 装好并能直接调用：

  ```sh
  npm install -g @deepseek-ai/dsh
  dsh --version
  ```

- 环境变量里有 `DEEPSEEK_API_KEY`（或者你用的服务商对应的认证变量，详见 `dsh` 文档）

## 安装

```sh
# macOS / Windows：去
#   https://github.com/chengoak/dsh-ui/releases
# 下载最新版的安装包
# Linux：下载 .AppImage
```

## 本地开发

```sh
git clone https://github.com/chengoak/dsh-ui
cd dsh-ui
npm install
npm run dev
```

`npm run dev` 会跑 [`scripts/dev.mjs`](scripts/dev.mjs)：
1. `tsc --watch` 编译 Electron 主进程
2. Vite dev server 跑 renderer（fallback 页面热更新）
3. 两者就绪后启动 Electron，并把 `DSH_UI_DEV_VITE_URL` 传给它，让主进程从 Vite 加载 fallback 页面而不是 asar 里的版本。

真正显示的 dsh Web UI 还是从你本地装的 `dsh` 来（默认 127.0.0.1:3080，跟打包版一致）。

## 不用 dev wrapper 的开发方式

```sh
npm run build:main    # 单次 tsc
npm run build:renderer  # 单次 vite build
npm start             # build + electron .
```

只测打包后的路径、或者你的平台跑不了 `scripts/dev.mjs` 时用这个。

## 打包发布版

```sh
npm run dist:mac      # macOS .dmg（arm64 + x64）
npm run dist:win      # Windows .exe（NSIS 安装包，x64）
npm run dist:linux    # Linux .AppImage（x64）
npm run dist:all      # 三个一起打（在 macOS 上跑最方便，跨平台编译需要额外配置）
```

产物在 `release/`。

### 代码签名

默认配置打出来的是**未签名**的包。用户装的时候 macOS 会弹 Gatekeeper 警告，Windows 会弹 SmartScreen 警告。要签名的话在 `electron-builder.yml` 里加 `identity`（mac）和 `certificateFile` / `certificatePassword`（win）。

## 怎么工作的

```
dsh-ui (Electron)
├── 主进程
│   ├── resolveDshBin()         ← which dsh / 读 $DSH_BIN
│   ├── startDshWeb()           ← spawn `dsh web`，从 stdout 抓 URL
│   ├── 探测 127.0.0.1:端口     ← 确认服务真的起来了
│   └── BrowserWindow loadURL
└── 退出时 → 给 dsh 发 SIGTERM
```

`dsh` CLI 启动 webServer 后会打印一行类似：

```
[10:23:01] Web UI: http://127.0.0.1:3080
```

`dsh-ui` 用正则把这行的端口抓出来，然后轮询这个 URL，等到返回 200 再把 BrowserWindow 导航过去。窗口关掉（或 `app` 退出，macOS 除外）时给 dsh 子进程发 SIGTERM 清理。

## 自定义 dsh 路径

如果 `dsh` 不在你的 `PATH` 上（比如用 `nvm` 装到了自定义 prefix），启动 `dsh-ui` 之前设个 `DSH_BIN` 环境变量：

```sh
DSH_BIN="$HOME/.nvm/versions/node/v22.19.0/bin/dsh" dsh-ui
```

## 项目结构

```
src/
├── main/
│   ├── main.ts            Electron app + BrowserWindow 生命周期
│   ├── dsh-process.ts     拉 dsh web、等就绪、退出时杀进程
│   └── resolve-dsh.ts     which dsh / 读 DSH_BIN
├── preload/
│   └── preload.ts         context-isolated 桥（现在是占位）
└── renderer/
    ├── missing-dsh.html   dsh 不在 PATH 时显示
    └── dsh-failed.html    dsh 启动失败 / 超时时显示
electron-builder.yml      跨平台打包配置（mac/win/linux）
```

## 商标声明

这是社区第三方 GUI 封装，不是 DeepSeek 官方产品。DeepSeek 名称和海豚/鲸鱼 logo 是 DeepSeek AI 的商标。`build/icon.*` 里的 logo 来自 DeepSeek 公开网站，仅用于产品识别（fair use），不代表 DeepSeek AI 官方背书。

如果你要发正式版，请把 `build/icon.*` 换成你有合法授权的素材。

## 协议

MIT。
