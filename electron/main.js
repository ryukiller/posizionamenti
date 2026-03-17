const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const fs = require("fs");
const os = require("os");
const https = require("https");
const http = require("http");
const archiver = require("archiver");
const { loadUserSettings, saveUserSettings } = require("./userSettings");

// Core Posizionamenti (compilato da src/ in dist/)
const { loadConfig } = require("../dist/config");
const { ScanOrchestrator } = require("../dist/services/scanOrchestrator");
const { StubScanner } = require("../dist/services/scanner");
const {
  PlaywrightScanner,
} = require("../dist/services/playwrightScanner");
const { HttpClient } = require("../dist/http/client");
const { ScanTargetsApi } = require("../dist/http/scanTargetsApi");
const {
  ScanResultsViewApi,
} = require("../dist/http/scanResultsViewApi");

let mainWindow;
let orchestrator;
let configCache;
let userSettingsCache;
let updateCheckInProgress = false;

function pathExists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function isChromiumUserDataDirLocked(userDataDir) {
  // Chromium creates a SingletonLock file in the user-data-dir when running.
  // If it exists, attempting to launch another persistent context will fail.
  if (!userDataDir) return false;
  const lockPath = path.join(userDataDir, "SingletonLock");
  return pathExists(lockPath);
}

function copyDirRecursive(srcDir, destDir, shouldSkip) {
  if (!pathExists(srcDir)) return;
  fs.mkdirSync(destDir, { recursive: true });

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (shouldSkip && shouldSkip(srcPath, entry)) {
      continue;
    }

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath, shouldSkip);
    } else if (entry.isFile()) {
      try {
        fs.copyFileSync(srcPath, destPath);
      } catch {
        // Best-effort: ignore files that are locked or fail to copy.
      }
    }
  }
}

function ensureScannerChromiumProfile({ sourceUserDataDir, appProfileRootDir }) {
  // Create an app-managed Chromium user-data-dir that can be used even when
  // the real browser profile is open. We copy the Default profile and Local State
  // best-effort (excluding caches) to retain cookies/logins as much as possible.
  if (!sourceUserDataDir || !appProfileRootDir) return null;
  if (!pathExists(sourceUserDataDir)) return null;

  const destUserDataDir = appProfileRootDir;
  const destDefaultProfileDir = path.join(destUserDataDir, "Default");
  const sourceDefaultProfileDir = path.join(sourceUserDataDir, "Default");

  fs.mkdirSync(destUserDataDir, { recursive: true });

  // Copy "Local State" (important for profile encryption metadata on some platforms)
  try {
    const localStateSrc = path.join(sourceUserDataDir, "Local State");
    const localStateDest = path.join(destUserDataDir, "Local State");
    if (pathExists(localStateSrc) && !pathExists(localStateDest)) {
      fs.copyFileSync(localStateSrc, localStateDest);
    }
  } catch {
    // ignore
  }

  // Copy Default profile folder once (or refresh missing pieces)
  if (pathExists(sourceDefaultProfileDir) && !pathExists(destDefaultProfileDir)) {
    const skip = (srcPath, entry) => {
      const name = entry.name;
      // Skip large volatile caches; keep cookies, preferences, storage.
      const cacheDirs = new Set([
        "Cache",
        "Code Cache",
        "GPUCache",
        "GrShaderCache",
        "ShaderCache",
        "Media Cache",
        "Service Worker",
        "OptimizationGuidePredictionModels",
      ]);
      if (entry.isDirectory() && cacheDirs.has(name)) return true;
      // Skip crash dumps if present
      if (entry.isDirectory() && name === "Crashpad") return true;
      // Some lock/temp files
      if (entry.isFile() && (name === "LOCK" || name === "SingletonLock")) return true;
      // Skip huge history journals if locked; best-effort handled by copyFileSync try/catch
      return false;
    };
    copyDirRecursive(sourceDefaultProfileDir, destDefaultProfileDir, skip);
  }

  return destUserDataDir;
}

function guessBrowserUserDataDir(browser) {
  const home = os.homedir();
  const platform = process.platform;

  if (!browser || browser === "system-default") {
    return null;
  }

  // Chromium-family (Chrome / Edge / Chromium)
  if (browser === "chrome" || browser === "chromium") {
    if (platform === "darwin") {
      // macOS Chrome
      return path.join(
        home,
        "Library",
        "Application Support",
        "Google",
        browser === "chromium" ? "Chromium" : "Chrome",
      );
    }
    if (platform === "win32") {
      // Windows Chrome
      const localAppData =
        process.env.LOCALAPPDATA ||
        path.join(home, "AppData", "Local");
      return path.join(
        localAppData,
        "Google",
        "Chrome",
        "User Data",
      );
    }
    // Linux (best-effort)
    if (platform === "linux") {
      return path.join(
        home,
        ".config",
        browser === "chromium" ? "chromium" : "google-chrome",
      );
    }
  }

  if (browser === "msedge") {
    if (platform === "darwin") {
      return path.join(
        home,
        "Library",
        "Application Support",
        "Microsoft Edge",
      );
    }
    if (platform === "win32") {
      const localAppData =
        process.env.LOCALAPPDATA ||
        path.join(home, "AppData", "Local");
      return path.join(
        localAppData,
        "Microsoft",
        "Edge",
        "User Data",
      );
    }
    if (platform === "linux") {
      return path.join(home, ".config", "microsoft-edge");
    }
  }

  if (browser === "firefox") {
    if (platform === "darwin") {
      return path.join(
        home,
        "Library",
        "Application Support",
        "Firefox",
        "Profiles",
      );
    }
    if (platform === "win32") {
      const appData =
        process.env.APPDATA ||
        path.join(home, "AppData", "Roaming");
      return path.join(appData, "Mozilla", "Firefox", "Profiles");
    }
    if (platform === "linux") {
      return path.join(home, ".mozilla", "firefox");
    }
  }

  return null;
}

// Proxy console output to the renderer log UI as well,
// so that scan steps are visible in the desktop app.
const originalConsoleInfo = console.info.bind(console);
const originalConsoleError = console.error.bind(console);
const originalConsoleWarn = console.warn.bind(console);
const originalConsoleLog = console.log.bind(console);

function forwardToLog(level, args) {
  const message = `[${level}] ${args
    .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
    .join(" ")}`;
  if (mainWindow) {
    mainWindow.webContents.send("scan:log", message);
  }
}

console.info = (...args) => {
  originalConsoleInfo(...args);
  forwardToLog("info", args);
};

console.error = (...args) => {
  originalConsoleError(...args);
  forwardToLog("error", args);
};

console.warn = (...args) => {
  originalConsoleWarn(...args);
  forwardToLog("warn", args);
};

console.log = (...args) => {
  originalConsoleLog(...args);
  forwardToLog("log", args);
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    icon: path.join(__dirname, "assets", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function setupCore() {
  if (!configCache) {
    configCache = loadConfig();
  }
  if (!userSettingsCache) {
    userSettingsCache = loadUserSettings();
  }
  if (userSettingsCache) {
    // Allow overriding backend config from UI settings so the packaged app
    // does not depend on environment variables.
    if (userSettingsCache.backendBaseUrl) {
      configCache.swiBaseUrl = userSettingsCache.backendBaseUrl;
    }
    if (userSettingsCache.apiKey) {
      configCache.apiKey = userSettingsCache.apiKey;
    }
  }
  const usePlaywright =
    process.env.SCANNER_ENGINE === "playwright" ||
    process.env.NODE_ENV === "production";
  const scannerOptions = {};
  if (userSettingsCache) {
    const browser = userSettingsCache.browser;
    const browserKey = browser && browser !== "system-default" ? browser : "chromium";

    // Map user-friendly browser choice to engine + channel
    if (browserKey === "firefox") {
      scannerOptions.browserEngine = "firefox";
    } else if (browserKey === "chromium") {
      scannerOptions.browserEngine = "chromium";
    } else {
      // chrome / msedge -> chromium engine with specific channel
      scannerOptions.browserEngine = "chromium";
      scannerOptions.browserChannel =
        browserKey === "chrome" || browserKey === "msedge" ? browserKey : undefined;
    }

    // Always use an app-owned profile directory; never point directly at the real browser profile
    const appProfilesBase = path.join(app.getPath("userData"), "profiles");
    const appProfileDir = path.join(appProfilesBase, browserKey);
    // Start from a clean profile directory each time we (re)create the scanner
    try {
      if (fs.existsSync(appProfileDir)) {
        fs.rmSync(appProfileDir, { recursive: true, force: true });
      }
    } catch {
      // ignore cleanup errors; directory will be recreated below if needed
    }
    fs.mkdirSync(appProfileDir, { recursive: true });
    scannerOptions.userDataDir = appProfileDir;

    if (browser && browser !== "system-default") {
      // already mapped above
    }
    if (typeof userSettingsCache.headless === "boolean") {
      scannerOptions.headless = !userSettingsCache.headless ? false : true;
    }
  }
  const scanner = usePlaywright
    ? new PlaywrightScanner(scannerOptions)
    : new StubScanner();
  orchestrator = new ScanOrchestrator(configCache, scanner);
}

function setupIpc() {
  ipcMain.handle("scan:get-config", async () => {
    if (!configCache) {
      configCache = loadConfig();
    }
    return {
      swiBaseUrl: configCache.swiBaseUrl,
    };
  });

  ipcMain.handle("scan:get-user-settings", async () => {
    if (!userSettingsCache) {
      userSettingsCache = loadUserSettings();
    }
    return userSettingsCache;
  });

  ipcMain.handle("scan:update-user-settings", async (_event, partial) => {
    try {
      const merged = saveUserSettings(partial || {});
      userSettingsCache = merged;
      // Force re-create scanner/orchestrator on next run with new settings.
      orchestrator = null;
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  ipcMain.handle("scan:choose-profile-dir", async () => {
    const result = await dialog.showOpenDialog({
      title: "Seleziona cartella profilo browser",
      properties: ["openDirectory"],
    });
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { success: false, canceled: true };
    }
    return { success: true, path: result.filePaths[0] };
  });

  ipcMain.handle("scan:run-once", async (_event, options) => {
    if (!orchestrator) {
      setupCore();
    }

    sendLog("Inizio scansione (run-once)...");
    try {
      await orchestrator.runOnce({
        clienteId: options?.clienteId,
        contrattoId: options?.contrattoId,
        keywordGroupId: options?.keywordGroupId,
        maxResultsPerBatch: options?.maxResultsPerBatch,
        dryRun: options?.dryRun,
      });
      sendLog("Scansione completata.");
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sendLog(`Errore durante la scansione: ${message}`);
      return { success: false, error: message };
    }
  });

  ipcMain.handle("scan:get-clients-with-groups", async () => {
    try {
      if (!configCache) {
        configCache = loadConfig();
      }
      const httpClient = new HttpClient({ config: configCache });
      const scanTargetsApi = new ScanTargetsApi(httpClient);
      const response = await scanTargetsApi.fetchScanTargets();

      const clientsById = new Map();

      for (const target of response.targets) {
        try {
          if (!target) continue;
          const cid = target.clienteId ?? target.clientId;
          if (!cid) continue;

          if (!clientsById.has(cid)) {
            clientsById.set(cid, {
              clienteId: cid,
              clientName: target.clientName,
              groups: [],
            });
          }

          const clientEntry = clientsById.get(cid);
          const exists = clientEntry.groups.some(
            (g) => g.keywordGroupId === target.keywordGroupId,
          );
          if (!exists) {
            clientEntry.groups.push({
              keywordGroupId: target.keywordGroupId,
              keywordGroupName: target.keywordGroupName,
              contrattoId: target.contrattoId ?? target.contractId ?? null,
              numeroContrattoInterno: target.numeroContrattoInterno,
              domain: target.domain,
              keywords: Array.isArray(target.keywords) ? target.keywords : [],
            });
          }
        } catch (itemError) {
          // Skip malformed target entries instead of failing the whole list.
          // eslint-disable-next-line no-console
          console.warn(
            "Skipping malformed scan target while building clients list:",
            itemError,
          );
        }
      }

      const result = Array.from(clientsById.values());
      return { success: true, clients: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sendLog(
        `Errore caricando clienti/gruppi da /api/scan-targets: ${message}`,
      );
      return { success: false, error: message };
    }
  });

  ipcMain.handle("scan:get-results", async (_event, options) => {
    try {
      if (!configCache) {
        configCache = loadConfig();
      }
      const httpClient = new HttpClient({ config: configCache });
      const scanResultsApi = new ScanResultsViewApi(httpClient);
      const query = {
        clienteId: options?.clienteId,
        contrattoId: options?.contrattoId ?? null,
        keywordGroupId: options?.keywordGroupId ?? null,
      };
      const response = await scanResultsApi.fetchScanResults(query);
      return { success: true, results: response.results, count: response.count };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sendLog(`Errore caricando risultati da /api/scan-results: ${message}`);
      return { success: false, error: message };
    }
  });

  ipcMain.handle("scan:choose-zip-path", async () => {
    const result = await dialog.showSaveDialog({
      title: "Salva batch come ZIP",
      defaultPath: path.join(
        os.homedir(),
        "scan-batch-" + new Date().toISOString().slice(0, 16).replace(/:/g, "-") + ".zip",
      ),
      filters: [{ name: "File ZIP", extensions: ["zip"] }],
    });
    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true };
    }
    return { success: true, filePath: result.filePath };
  });

  ipcMain.handle("scan:create-batch-zip", async (_event, payload) => {
    const { outputPath, batchId, results } = payload || {};
    if (!outputPath || !Array.isArray(results) || results.length === 0) {
      return { success: false, error: "Parametri ZIP non validi." };
    }

    try {
      await createBatchZip({ outputPath, batchId, results });
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sendLog(`Errore creando ZIP per batch ${batchId || "sconosciuto"}: ${message}`);
      return { success: false, error: message };
    }
  });

  ipcMain.handle("update:check", async () => {
    if (updateCheckInProgress) {
      return { success: false, error: "Controllo aggiornamenti già in corso." };
    }
    try {
      updateCheckInProgress = true;
      await autoUpdater.checkForUpdates();
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sendLog(`Errore controllando aggiornamenti: ${message}`);
      return { success: false, error: message };
    } finally {
      updateCheckInProgress = false;
    }
  });

  ipcMain.handle("update:install", async () => {
    try {
      autoUpdater.quitAndInstall();
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sendLog(`Errore installando aggiornamento: ${message}`);
      return { success: false, error: message };
    }
  });
}

function setupAutoUpdater() {
  try {
    autoUpdater.autoDownload = true;

    autoUpdater.on("checking-for-update", () => {
      if (mainWindow) {
        mainWindow.webContents.send("update:status", {
          status: "checking",
        });
      }
    });

    autoUpdater.on("update-available", (info) => {
      if (mainWindow) {
        mainWindow.webContents.send("update:available", {
          version: info && info.version ? info.version : null,
        });
      }
    });

    autoUpdater.on("update-not-available", (info) => {
      if (mainWindow) {
        mainWindow.webContents.send("update:not-available", {
          version: info && info.version ? info.version : null,
        });
      }
    });

    autoUpdater.on("download-progress", (progress) => {
      if (mainWindow) {
        mainWindow.webContents.send("update:download-progress", {
          percent: progress && typeof progress.percent === "number" ? progress.percent : 0,
        });
      }
    });

    autoUpdater.on("update-downloaded", (info) => {
      if (mainWindow) {
        mainWindow.webContents.send("update:downloaded", {
          version: info && info.version ? info.version : null,
        });
      }
    });
  } catch (error) {
    // Do not crash the app if auto-updater fails to initialize.
    sendLog(
      `Auto-updater non inizializzato: ${error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function downloadToBuffer(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    client
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode} scaricando ${url}`));
          return;
        }
        const data = [];
        res.on("data", (chunk) => data.push(chunk));
        res.on("end", () => resolve(Buffer.concat(data)));
      })
      .on("error", (err) => reject(err));
  });
}

async function createBatchZip({ outputPath, batchId, results }) {
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

  const output = fs.createWriteStream(outputPath);
  const archive = archiver("zip", { zlib: { level: 9 } });

  const archivePromise = new Promise((resolve, reject) => {
    output.on("close", resolve);
    output.on("error", reject);
    archive.on("error", reject);
  });

  archive.pipe(output);

  const headers = [
    "keyword",
    "searchedDomain",
    "position",
    "foundUrl",
    "serpUrl",
    "screenshotUrl",
    "runAt",
  ];

  const csvLines = [headers.join(",")];

  for (let index = 0; index < results.length; index += 1) {
    const r = results[index];
    const screenshotUrlFull =
      r.screenshotUrlResolved || r.screenshotUrl || "";
    const csvRow = [
      r.keyword ?? "",
      r.searchedDomain ?? "",
      r.position ?? "",
      r.foundUrl ?? "",
      r.serpUrl ?? "",
      screenshotUrlFull,
      r.runAt ?? "",
    ]
      .map((value) => {
        const str = String(value);
        if (str.includes('"') || str.includes(",") || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      })
      .join(",");
    csvLines.push(csvRow);

    if (screenshotUrlFull) {
      try {
        const buffer = await downloadToBuffer(screenshotUrlFull);
        const safeKeyword = (r.keyword || "keyword").toString().replace(/[^a-z0-9-_]+/gi, "_");
        const filename = `screenshots/${String(index + 1).padStart(3, "0")}-${safeKeyword}.png`;
        archive.append(buffer, { name: filename });
      } catch (err) {
        sendLog(
          `Impossibile scaricare screenshot per batch ${batchId || "sconosciuto"} (${screenshotUrlFull}): ${err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }

  const csvContent = csvLines.join("\n");
  archive.append(csvContent, { name: "results.csv" });

  await archive.finalize();
  await archivePromise;
}

function sendLog(message) {
  if (mainWindow) {
    mainWindow.webContents.send("scan:log", message);
  }
}

function logStartupError(error) {
  try {
    const userDataDir = app.getPath("userData");
    const logFile = path.join(userDataDir, "startup-error.log");
    const message =
      `[${new Date().toISOString()}] ` +
      (error instanceof Error ? `${error.name}: ${error.message}\n${error.stack || ""}` : String(error));
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.appendFileSync(logFile, message + "\n\n");
  } catch {
    // If logging fails, we can't do much else here
  }
}

app.whenReady().then(() => {
  try {
    setupCore();
    setupIpc();
    setupAutoUpdater();
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  } catch (error) {
    logStartupError(error);
    const message =
      error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    try {
      dialog.showErrorBox(
        "Errore di avvio Posizionamenti",
        `${message}\n\nControlla il file startup-error.log nella cartella dati dell'applicazione per maggiori dettagli.`,
      );
    } finally {
      app.quit();
    }
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

