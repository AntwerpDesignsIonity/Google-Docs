// IONITY - Desktop wrapper for Google Docs
// Main Electron process.

const { app, BrowserWindow, Menu, shell } = require("electron");
const path = require("path");

const APP_NAME = "IONITY";
const APP_VERSION = require("./package.json").version;
const START_URL = "https://docs.google.com/document/u/0/?pli=1";

// Workarounds for IME issues on some platforms (see upstream issue #48).
app.commandLine.appendSwitch("disable-features", "ImmersiveIme");
app.commandLine.appendSwitch("enable-blink-features", "TextInputIme");

app.setName(APP_NAME);

/** @type {BrowserWindow | null} */
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 640,
    minHeight: 480,
    title: APP_NAME,
    icon: path.join(__dirname, "assets", "icon.png"),
    backgroundColor: "#ffffff",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.loadURL(START_URL);

  // Open external links in the user's default browser instead of a new window.
  const allowedHosts = new Set([
    "docs.google.com",
    "drive.google.com",
    "accounts.google.com",
  ]);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (_) {
      return { action: "deny" };
    }
    if (parsed.protocol === "https:" && allowedHosts.has(parsed.hostname)) {
      return { action: "allow" };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on("activate", () => {
  // On macOS re-create a window when the dock icon is clicked and no windows are open.
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ---------------------------------------------------------------------------
// Application menu
// ---------------------------------------------------------------------------
const isMac = process.platform === "darwin";

const template = [
  ...(isMac
    ? [
        {
          label: APP_NAME,
          submenu: [
            { role: "about" },
            { type: "separator" },
            { role: "services" },
            { type: "separator" },
            { role: "hide" },
            { role: "hideOthers" },
            { role: "unhide" },
            { type: "separator" },
            { role: "quit" },
          ],
        },
      ]
    : []),
  {
    label: "File",
    submenu: [isMac ? { role: "close" } : { role: "quit" }],
  },
  {
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      ...(isMac
        ? [
            { role: "pasteAndMatchStyle" },
            { role: "delete" },
            { role: "selectAll" },
            { type: "separator" },
            {
              label: "Speech",
              submenu: [{ role: "startSpeaking" }, { role: "stopSpeaking" }],
            },
          ]
        : [{ role: "delete" }, { type: "separator" }, { role: "selectAll" }]),
    ],
  },
  {
    label: "View",
    submenu: [
      { role: "reload" },
      { role: "forceReload" },
      { role: "toggleDevTools" },
      { type: "separator" },
      { role: "resetZoom" },
      { role: "zoomIn" },
      { role: "zoomOut" },
      { type: "separator" },
      { role: "togglefullscreen" },
    ],
  },
  {
    label: "Window",
    submenu: [
      { role: "minimize" },
      { role: "zoom" },
      ...(isMac
        ? [
            { type: "separator" },
            { role: "front" },
            { type: "separator" },
            { role: "window" },
          ]
        : [{ role: "close" }]),
    ],
  },
  {
    role: "help",
    submenu: [
      { label: `${APP_NAME} v${APP_VERSION}`, enabled: false },
      {
        label: "Project Repository",
        click: () => shell.openExternal("https://github.com/AntwerpDesignsIonity/Google-Docs"),
      },
      {
        label: "Report an Issue",
        click: () =>
          shell.openExternal(
            "https://github.com/AntwerpDesignsIonity/Google-Docs/issues/new"
          ),
      },
    ],
  },
];

Menu.setApplicationMenu(Menu.buildFromTemplate(template));
