const { app, BrowserWindow, shell, Menu, dialog, ipcMain, nativeImage, powerMonitor } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const https = require("https");

const ADMIN_URL = process.env.ABS_ADMIN_URL || "https://www.absmotsauto.co.uk/admin";
const HEALTH_URL = "https://www.absmotsauto.co.uk/api/health";
const ALLOWED_HOSTS = new Set([
  "www.absmotsauto.co.uk",
  "absmotsauto.co.uk",
  "absmotsauto.onrender.com",
]);

function isAdminUrl(target) {
  try {
    const url = new URL(target);
    if (!ALLOWED_HOSTS.has(url.hostname)) return false;
    return url.pathname === "/admin" || url.pathname.startsWith("/admin/");
  } catch {
    return false;
  }
}

function liveAdminUrl() {
  const sep = ADMIN_URL.includes("?") ? "&" : "?";
  return ADMIN_URL + sep + "desk=" + Date.now();
}

const INJECT_CHROME = `(() => {
  if (document.getElementById("abs-desk-bar")) return true;
  const root = document.body || document.documentElement;
  if (!root) return false;
  document.documentElement.classList.add("abs-desk-app");
  const bar = document.createElement("div");
  bar.id = "abs-desk-bar";
  bar.setAttribute(
    "style",
    "position:fixed;top:0;left:0;right:0;height:48px;z-index:2147483647;display:flex;align-items:center;justify-content:space-between;padding:0 16px;background:#111;border-bottom:3px solid #1e6fd9;font-family:Arial,Helvetica,sans-serif;box-sizing:border-box;"
  );
  bar.innerHTML = '<span style="color:#fff;font-weight:800;letter-spacing:.18em;font-size:12px;text-transform:uppercase">ABS MOTS</span><span style="display:flex;gap:8px"><button type="button" id="abs-desk-update-btn" style="height:34px;padding:0 16px;border:1px solid #1e6fd9;border-radius:8px;background:#111;color:#fff;font-weight:800;letter-spacing:.14em;text-transform:uppercase;cursor:pointer;font-size:12px">Update</button><button type="button" id="abs-desk-refresh-btn" style="height:34px;padding:0 18px;border:0;border-radius:8px;background:#1e6fd9;color:#fff;font-weight:800;letter-spacing:.14em;text-transform:uppercase;cursor:pointer;font-size:12px">Refresh</button></span>';
  root.insertBefore(bar, root.firstChild);
  document.documentElement.style.paddingTop = "48px";
  const btn = document.getElementById("abs-desk-refresh-btn");
  if (btn) btn.onclick = () => {
    if (window.absDesktop && window.absDesktop.reload) window.absDesktop.reload();
    else location.reload();
  };
  const updateBtn = document.getElementById("abs-desk-update-btn");
  if (updateBtn) updateBtn.onclick = () => {
    if (window.absDesktop && window.absDesktop.updateDesk) window.absDesktop.updateDesk();
    else if (window.absDesktop && window.absDesktop.reload) window.absDesktop.reload();
    else location.reload();
  };
  return true;
})();`;

function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 700,
    title: "ABS MOTS",
    backgroundColor: "#1c1c1c",
    autoHideMenuBar: false,
    // Windows picks the right size from the .ico (the ABS letters at taskbar size,
    // the whole logo when large); a 1024 px PNG shrinks to an unreadable smudge.
    icon: path.join(__dirname, process.platform === "win32" ? "icon.ico" : "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  const ses = win.webContents.session;
  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === "notifications");
  });
  ses.clearCache().catch(() => {});
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = { ...details.requestHeaders, "Cache-Control": "no-cache", Pragma: "no-cache" };
    callback({ requestHeaders: headers });
  });

  win.loadURL(liveAdminUrl(), {
    extraHeaders: "Cache-Control: no-cache\nPragma: no-cache\n",
  });

  const kickData = () => {
    win.webContents
      .executeJavaScript("window.dispatchEvent(new Event('abs-desktop-refresh')); true;")
      .catch(() => {});
  };

  const paintBar = () => {
    win.webContents.executeJavaScript(INJECT_CHROME).catch(() => {});
    kickData();
  };

  win.webContents.on("dom-ready", paintBar);
  win.webContents.on("did-finish-load", paintBar);
  win.webContents.on("did-navigate-in-page", paintBar);

  win.on("focus", kickData);
  setInterval(() => {
    if (win.isDestroyed() || !win.isVisible()) return;
    paintBar();
  }, 5000);

  let lastBuild = "";
  const checkBuild = () => {
    if (win.isDestroyed()) return;
    https
      .get(HEALTH_URL, (res) => {
        let body = "";
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          try {
            const data = JSON.parse(body);
            const id = String(data.build || "");
            if (!id) return;
            if (lastBuild && lastBuild !== id) {
              // The page reloads itself once nobody is mid-edit (desk.js).
              win.webContents
                .executeJavaScript("window.__absUpdateReady ? (window.__absUpdateReady(), true) : false")
                .then((handled) => { if (!handled) win.webContents.reloadIgnoringCache(); })
                .catch(() => win.webContents.reloadIgnoringCache());
              lastBuild = id;
              return;
            }
            lastBuild = id;
          } catch {
            // Ignore a bad health payload.
          }
        });
      })
      .on("error", () => {});
  };
  setTimeout(checkBuild, 4000);
  setInterval(checkBuild, 30000);

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isAdminUrl(url)) return { action: "allow" };
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    if (isAdminUrl(url)) return;
    event.preventDefault();
    shell.openExternal(url);
  });

  win.webContents.on("did-fail-load", (_event, code, desc, url, isMain) => {
    if (!isMain || code === -3) return;
    dialog.showErrorBox(
      "ABS MOTS",
      "Could not open the admin desk.\n\nCheck the internet connection and try again.\n\n" + desc
    );
  });
}

// The app itself updates from the GitHub release on its own: it downloads a
// new version quietly and installs it once the computer has had no keyboard
// or mouse for 10 minutes (or when the app is closed), then reopens. Nobody
// reinstalls, and nobody loses work to an update.
const UPDATE_WHEN_IDLE_S = 10 * 60;
function startAutoUpdate() {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  let downloaded = false;
  const installIfIdle = () => {
    if (!downloaded) return;
    let idle = 0;
    try { idle = powerMonitor.getSystemIdleTime(); } catch { idle = 0; }
    if (idle >= UPDATE_WHEN_IDLE_S || process.env.ABS_UPDATE_NOW === "1") autoUpdater.quitAndInstall(true, true);
  };
  autoUpdater.on("update-downloaded", () => {
    downloaded = true;
    installIfIdle();
  });
  autoUpdater.on("error", () => {});
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  setTimeout(check, 10 * 1000);
  setInterval(check, 3 * 60 * 60 * 1000);
  setInterval(installIfIdle, 60 * 1000);
}

function badgeImage(count) {
  const label = count > 9 ? "9+" : String(count);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">
    <circle cx="16" cy="16" r="15" fill="#1e6fd9"/>
    <text x="16" y="21" text-anchor="middle" font-size="14" font-family="Arial" font-weight="700" fill="white">${label}</text>
  </svg>`;
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`);
}

ipcMain.on("abs-reload", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) return;
  win.webContents.reloadIgnoringCache();
});

ipcMain.handle("abs-update-desk", async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) return { ok: false };
  try {
    await win.webContents.session.clearCache();
  } catch {
    // Still load the live desk if cache clear fails.
  }
  win.loadURL(liveAdminUrl(), {
    extraHeaders: "Cache-Control: no-cache\nPragma: no-cache\n",
  });
  return { ok: true };
});

ipcMain.on("abs-pending-bookings", (event, raw) => {
  const count = Math.max(0, Number(raw) || 0);
  const win = BrowserWindow.fromWebContents(event.sender);
  try {
    app.setBadgeCount(count);
  } catch {
    // Windows uses overlay instead.
  }
  if (!win || win.isDestroyed()) return;
  win.setTitle(count ? `(${count}) ABS MOTS` : "ABS MOTS");
  if (process.platform === "win32") {
    if (count > 0) win.setOverlayIcon(badgeImage(count), `${count} pending bookings`);
    else win.setOverlayIcon(null, "");
    if (count > 0) win.flashFrame(true);
  }
});

app.setName("ABS MOTS");
app.setAppUserModelId("uk.co.absmotsauto.admin");

app.whenReady().then(() => {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: "ABS MOTS",
      submenu: [
        { role: "reload", label: "Refresh", accelerator: "CmdOrCtrl+R" },
        { role: "forceReload", label: "Force refresh", accelerator: "CmdOrCtrl+Shift+R" },
        {
          label: "Update desk",
          accelerator: "CmdOrCtrl+U",
          click: (_item, win) => {
            const target = win || BrowserWindow.getFocusedWindow();
            if (!target || target.isDestroyed()) return;
            target.webContents.session.clearCache().catch(() => {});
            target.loadURL(liveAdminUrl(), {
              extraHeaders: "Cache-Control: no-cache\nPragma: no-cache\n",
            });
          },
        },
        { type: "separator" },
        { role: "quit", label: "Quit ABS MOTS" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload", label: "Refresh", accelerator: "F5" },
        { role: "forceReload", label: "Force refresh" },
        { role: "togglefullscreen" },
      ],
    },
  ]));
  createWindow();
  startAutoUpdate();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  app.quit();
});
