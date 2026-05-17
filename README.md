# IONITY

**IONITY** is a lightweight, cross-platform Electron desktop wrapper around
Google Docs. It opens Google Docs in a clean, native-feeling window with a
sensible application menu - no extra telemetry, no auto-updater pings, no
third-party analytics.

## Features

- Native window for Google Docs, Sheets, and Slides.
- Hardened Electron defaults: `contextIsolation: true`, `sandbox: true`,
  `nodeIntegration: false`.
- External links open in your default browser instead of inside the app.
- No auto-updater, no embedded promotional links, no tracking.
- One-click cross-platform **GUI installer** that handles dependencies and
  building.

## Quick Start - GUI Installer

The repository ships with a launchable installer that opens a small local
web page to guide you through installation and building.

| Platform        | Double-click this file |
| --------------- | ---------------------- |
| Windows         | `install.bat`          |
| macOS           | `install.command`      |
| Linux / Unix    | `install.sh`           |

Or from a terminal:

```sh
node installer.js
```

The installer starts a local web server bound to `127.0.0.1`, opens your
default browser, and lets you:

1. **Install dependencies** - runs `npm install`.
2. **Start IONITY** - launches the desktop app via `npm start`.
3. **Build installers** - produces native installer packages in `./out` via
   `npm run make`.

Nothing is sent over the network: the installer only talks to itself on
`127.0.0.1` and all action endpoints are protected by a per-launch random
token.

## Manual Install

If you'd rather skip the GUI:

```sh
npm install
npm start             # launch IONITY in development
npm run make          # build native installers for your platform
```

## Requirements

- Node.js 18 or newer (Node 20+ recommended)
- npm
- Standard Electron build prerequisites for your platform
  (see [Electron Forge documentation](https://www.electronforge.io/)).

## Project Layout

```
.
├── main.js          # Electron main process
├── preload.js       # Sandboxed preload (uses contextBridge)
├── installer.js     # Zero-dependency GUI installer (Node HTTP server)
├── install.sh       # Linux / macOS launcher
├── install.command  # macOS Finder-friendly launcher
├── install.bat      # Windows launcher
├── forge.config.js  # Electron Forge build configuration
└── assets/          # Icons and graphics
```

## License

[MIT](LICENSE)
