import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import { autoUpdater } from "electron-updater";
import path from "path";
import fs from "fs";
import os from "os";
import https from "https";
import http from "http";
import archiver from "archiver";

// Core Posizionamenti (compilato da src/ in dist/)
// Il bundle main è in out/main/, quindi puntiamo a ../../dist/**
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { loadConfig } = require("../../dist/config");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ScanOrchestrator } = require("../../dist/services/scanOrchestrator");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { StubScanner } = require("../../dist/services/scanner");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PlaywrightScanner } = require("../../dist/services/playwrightScanner");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { HttpClient } = require("../../dist/http/client");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ScanTargetsApi } = require("../../dist/http/scanTargetsApi");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ScanResultsViewApi } = require("../../dist/http/scanResultsViewApi");
// Impostazioni utente (compilate da src/main/ in dist/main/)
// Il bundle main è in out/main/, quindi puntiamo a ../../dist/main/**
// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  loadUserSettings,
  saveUserSettings,
} = require("../../dist/main/userSettings");

let mainWindow: BrowserWindow | null = null;
let orchestrator: any;
let configCache: any;
let userSettingsCache: any;
let updateCheckInProgress = false;

function pathExists(p: string): boolean {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function copyDirRecursive(
  srcDir: string,
  destDir: string,
  shouldSkip?: (srcPath: string, entry: fs.Dirent) => boolean,
): void {
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

function ensureScannerChromiumProfile(params: {
  sourceUserDataDir: string | null;
  appProfileRootDir: string | null;
}): string | null {
  const { sourceUserDataDir, appProfileRootDir } = params;
  if (!sourceUserDataDir || !appProfileRootDir) return null;
  if (!pathExists(sourceUserDataDir)) return null;

  const destUserDataDir = appProfileRootDir;
  const destDefaultProfileDir = path.join(destUserDataDir, "Default");
  const sourceDefaultProfileDir = path.join(sourceUserDataDir, "Default");

  fs.mkdirSync(destUserDataDir, { recursive: true });

  try {
    const localStateSrc = path.join(sourceUserDataDir, "Local State");
    const localStateDest = path.join(destUserDataDir, "Local State");
    if (pathExists(localStateSrc) && !pathExists(localStateDest)) {
      fs.copyFileSync(localStateSrc, localStateDest);
    }
  } catch {
    // ignore
  }

  if (
    pathExists(sourceDefaultProfileDir) &&
    !pathExists(destDefaultProfileDir)
  ) {
    const skip = (_srcPath: string, entry: fs.Dirent) => {
      const name = entry.name;
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
      if (entry.isDirectory() && name === "Crashpad") return true;
      if (entry.isFile() && (name === "LOCK" || name === "SingletonLock"))
        return true;
      return false;
    };
    copyDirRecursive(sourceDefaultProfileDir, destDefaultProfileDir, skip);
  }

  return destUserDataDir;
}

function guessBrowserUserDataDir(
  browser: string | null | undefined,
): string | null {
  const home = os.homedir();
  const platform = process.platform;

  if (!browser || browser === "system-default") {
    return null;
  }

  if (browser === "chrome" || browser === "chromium") {
    if (platform === "darwin") {
      return path.join(
        home,
        "Library",
        "Application Support",
        "Google",
        browser === "chromium" ? "Chromium" : "Chrome",
      );
    }
    if (platform === "win32") {
      const localAppData =
        process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
      return path.join(localAppData, "Google", "Chrome", "User Data");
    }
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
        process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
      return path.join(localAppData, "Microsoft", "Edge", "User Data");
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
        process.env.APPDATA || path.join(home, "AppData", "Roaming");
      return path.join(appData, "Mozilla", "Firefox", "Profiles");
    }
    if (platform === "linux") {
      return path.join(home, ".mozilla", "firefox");
    }
  }

  return null;
}

const originalConsoleInfo = console.info.bind(console);
const originalConsoleError = console.error.bind(console);
const originalConsoleWarn = console.warn.bind(console);
const originalConsoleLog = console.log.bind(console);

function forwardToLog(level: string, args: unknown[]): void {
  const message = `[${level}] ${args
    .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
    .join(" ")}`;
  if (mainWindow) {
    mainWindow.webContents.send("scan:log", message);
  }
}

console.info = (...args: unknown[]) => {
  originalConsoleInfo(...args);
  forwardToLog("info", args);
};

console.error = (...args: unknown[]) => {
  originalConsoleError(...args);
  forwardToLog("error", args);
};

console.warn = (...args: unknown[]) => {
  originalConsoleWarn(...args);
  forwardToLog("warn", args);
};

console.log = (...args: unknown[]) => {
  originalConsoleLog(...args);
  forwardToLog("log", args);
};

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    icon: path.join(__dirname, "assets", "icon.png"),
    webPreferences: {
      // In dev/build, electron-vite outputs the preload bundle to out/preload/preload.js
      // __dirname here is out/main, so we need to go up one level.
      preload: path.join(__dirname, "..", "preload", "preload.js"),
    },
  });

  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
  } else {
    const fileUrl = new URL(
      "../renderer/index.html",
      `file://${path.join(__dirname, "..", "renderer")}/`,
    ).toString();
    void mainWindow.loadURL(fileUrl);
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function applyUserSettingsToConfig(): void {
  if (!configCache) {
    configCache = loadConfig();
  }
  if (!userSettingsCache) {
    userSettingsCache = loadUserSettings();
  }
  if (userSettingsCache) {
    if (userSettingsCache.backendBaseUrl) {
      configCache.swiBaseUrl = userSettingsCache.backendBaseUrl;
    }
    if (userSettingsCache.apiKey) {
      configCache.apiKey = userSettingsCache.apiKey;
    }
  }
}

function setupCore(): void {
  applyUserSettingsToConfig();
  // Di default usiamo sempre Playwright nello scanner desktop.
  // Lo StubScanner viene usato solo se SCANNER_ENGINE è impostato esplicitamente a "stub".
  const engine = process.env.SCANNER_ENGINE || "playwright";
  const usePlaywright = engine !== "stub";
  const scannerOptions: any = {};
  if (userSettingsCache) {
    const browser = userSettingsCache.browser as string | null | undefined;
    const browserKey =
      browser && browser !== "system-default" ? browser : "chromium";

    if (browserKey === "firefox") {
      scannerOptions.browserEngine = "firefox";
    } else if (browserKey === "chromium") {
      scannerOptions.browserEngine = "chromium";
    } else {
      scannerOptions.browserEngine = "chromium";
      scannerOptions.browserChannel =
        browserKey === "chrome" || browserKey === "msedge"
          ? browserKey
          : undefined;
    }

    const appProfilesBase = path.join(app.getPath("userData"), "profiles");
    const appProfileDir = path.join(appProfilesBase, browserKey);
    try {
      if (fs.existsSync(appProfileDir)) {
        fs.rmSync(appProfileDir, { recursive: true, force: true });
      }
    } catch {
      // ignore cleanup errors
    }
    fs.mkdirSync(appProfileDir, { recursive: true });
    scannerOptions.userDataDir = appProfileDir;

    if (typeof userSettingsCache.headless === "boolean") {
      scannerOptions.headless = !userSettingsCache.headless ? false : true;
    }
  }
  const scanner = usePlaywright
    ? new PlaywrightScanner(scannerOptions)
    : new StubScanner();
  orchestrator = new ScanOrchestrator(configCache, scanner);
}

function sendLog(message: string): void {
  if (mainWindow) {
    mainWindow.webContents.send("scan:log", message);
  }
}

function setupIpc(): void {
  ipcMain.handle("scan:get-config", async () => {
    applyUserSettingsToConfig();
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
      // aggiorna anche la config corrente così il nuovo backend/API key
      // vengono usati immediatamente senza riavviare l'app
      applyUserSettingsToConfig();
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
      applyUserSettingsToConfig();
      const httpClient = new HttpClient({ config: configCache });
      const scanTargetsApi = new ScanTargetsApi(httpClient);
      const response = await scanTargetsApi.fetchScanTargets();

      const clientsById = new Map<string, any>();

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
            (g: any) => g.keywordGroupId === target.keywordGroupId,
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
      applyUserSettingsToConfig();
      const httpClient = new HttpClient({ config: configCache });
      const scanResultsApi = new ScanResultsViewApi(httpClient);
      const query = {
        clienteId: options?.clienteId,
        contrattoId: options?.contrattoId ?? null,
        keywordGroupId: options?.keywordGroupId ?? null,
      };
      const response = await scanResultsApi.fetchScanResults(query);
      return {
        success: true,
        results: response.results,
        count: response.count,
      };
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
        `scan-batch-${new Date().toISOString().slice(0, 16).replace(/:/g, "-")}.zip`,
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
      sendLog(
        `Errore creando ZIP per batch ${batchId || "sconosciuto"}: ${message}`,
      );
      return { success: false, error: message };
    }
  });

  ipcMain.handle("update:check", async () => {
    if (process.platform === "darwin") {
      try {
        const releasesUrl =
          "https://github.com/ryukiller/posizionamenti/releases/latest";
        sendLog(
          "Aggiornamenti macOS: link GitHub Releases disponibile per scaricare la nuova versione.",
        );
        return {
          success: true,
          platform: "darwin",
          releasesUrl,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        sendLog(
          `Errore preparando il link GitHub Releases per aggiornamento macOS: ${message}`,
        );
        return { success: false, error: message };
      }
    }

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

function downloadToBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    client
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode} scaricando ${url}`));
          return;
        }
        const data: Buffer[] = [];
        res.on("data", (chunk) => data.push(chunk));
        res.on("end", () => resolve(Buffer.concat(data)));
      })
      .on("error", (err) => reject(err));
  });
}

async function createBatchZip(params: {
  outputPath: string;
  batchId?: string;
  results: any[];
}): Promise<void> {
  const { outputPath, batchId, results } = params;
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

  const output = fs.createWriteStream(outputPath);
  const archive = archiver("zip", { zlib: { level: 9 } });

  const archivePromise = new Promise<void>((resolve, reject) => {
    output.on("close", () => resolve());
    output.on("error", (err) => reject(err));
    archive.on("error", (err) => reject(err));
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

  const csvLines: string[] = [headers.join(",")];

  for (let index = 0; index < results.length; index += 1) {
    const r = results[index];
    const screenshotUrlFull = r.screenshotUrlResolved || r.screenshotUrl || "";
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
        const safeKeyword = (r.keyword || "keyword")
          .toString()
          .replace(/[^a-z0-9-_]+/gi, "_");
        const filename = `screenshots/${String(index + 1).padStart(
          3,
          "0",
        )}-${safeKeyword}.png`;
        archive.append(buffer, { name: filename });
      } catch (err) {
        sendLog(
          `Impossibile scaricare screenshot per batch ${
            batchId || "sconosciuto"
          } (${screenshotUrlFull}): ${
            err instanceof Error ? err.message : String(err)
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

function logStartupError(error: unknown): void {
  try {
    const userDataDir = app.getPath("userData");
    const logFile = path.join(userDataDir, "startup-error.log");
    const message =
      `[${new Date().toISOString()}] ` +
      (error instanceof Error
        ? `${error.name}: ${error.message}\n${error.stack || ""}`
        : String(error));
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.appendFileSync(logFile, message + "\n\n");
  } catch {
    // ignore
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
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error);
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

function setupAutoUpdater(): void {
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
          percent:
            progress && typeof progress.percent === "number"
              ? progress.percent
              : 0,
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

    autoUpdater.on("error", (error) => {
      const message = error instanceof Error ? error.message : String(error);
      sendLog(`Errore auto-updater: ${message}`);
    });
  } catch (error) {
    sendLog(
      `Auto-updater non inizializzato: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
