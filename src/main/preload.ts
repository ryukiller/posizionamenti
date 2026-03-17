import { contextBridge, ipcRenderer } from "electron";

// Type-safe mirror of the existing preload.js bridge.

export interface PosizionamentiBridge {
  runScanOnce(options?: unknown): Promise<unknown>;
  getConfig(): Promise<unknown>;
  onLog(callback: (message: string) => void): void;
  getClientsWithGroups(): Promise<unknown>;
  getResults(options?: unknown): Promise<unknown>;
  chooseBatchZipPath(): Promise<unknown>;
  downloadBatchZip(payload: unknown): Promise<unknown>;
  getUserSettings(): Promise<unknown>;
  updateUserSettings(payload: unknown): Promise<unknown>;
  chooseProfileDir(): Promise<unknown>;
  checkForUpdates(): Promise<unknown>;
  installUpdate(): Promise<unknown>;
  onUpdateStatus(callback: (payload: unknown) => void): void;
  onUpdateAvailable(callback: (payload: unknown) => void): void;
  onUpdateNotAvailable(callback: (payload: unknown) => void): void;
  onUpdateDownloadProgress(callback: (payload: unknown) => void): void;
  onUpdateDownloaded(callback: (payload: unknown) => void): void;
}

declare global {
  interface Window {
    posizionamenti: PosizionamentiBridge;
  }
}

contextBridge.exposeInMainWorld("posizionamenti", {
  runScanOnce(options?: unknown) {
    return ipcRenderer.invoke("scan:run-once", options || {});
  },
  async getConfig() {
    const config = await ipcRenderer.invoke("scan:get-config");
    return config;
  },
  onLog(callback: (message: string) => void) {
    ipcRenderer.on("scan:log", (_event, message: string) => {
      callback(message);
    });
  },
  async getClientsWithGroups() {
    const result = await ipcRenderer.invoke("scan:get-clients-with-groups");
    return result;
  },
  async getResults(options?: unknown) {
    const result = await ipcRenderer.invoke("scan:get-results", options || {});
    return result;
  },
  async chooseBatchZipPath() {
    const result = await ipcRenderer.invoke("scan:choose-zip-path");
    return result;
  },
  async downloadBatchZip(payload: unknown) {
    const result = await ipcRenderer.invoke(
      "scan:create-batch-zip",
      payload || {},
    );
    return result;
  },
  async getUserSettings() {
    const settings = await ipcRenderer.invoke("scan:get-user-settings");
    return settings;
  },
  async updateUserSettings(payload: unknown) {
    const result = await ipcRenderer.invoke(
      "scan:update-user-settings",
      payload || {},
    );
    return result;
  },
  async chooseProfileDir() {
    const result = await ipcRenderer.invoke("scan:choose-profile-dir");
    return result;
  },
  async checkForUpdates() {
    const result = await ipcRenderer.invoke("update:check");
    return result;
  },
  async installUpdate() {
    const result = await ipcRenderer.invoke("update:install");
    return result;
  },
  onUpdateStatus(callback: (payload: unknown) => void) {
    ipcRenderer.on("update:status", (_event, payload: unknown) => {
      callback(payload);
    });
  },
  onUpdateAvailable(callback: (payload: unknown) => void) {
    ipcRenderer.on("update:available", (_event, payload: unknown) => {
      callback(payload);
    });
  },
  onUpdateNotAvailable(callback: (payload: unknown) => void) {
    ipcRenderer.on("update:not-available", (_event, payload: unknown) => {
      callback(payload);
    });
  },
  onUpdateDownloadProgress(callback: (payload: unknown) => void) {
    ipcRenderer.on("update:download-progress", (_event, payload: unknown) => {
      callback(payload);
    });
  },
  onUpdateDownloaded(callback: (payload: unknown) => void) {
    ipcRenderer.on("update:downloaded", (_event, payload: unknown) => {
      callback(payload);
    });
  },
} as PosizionamentiBridge);
