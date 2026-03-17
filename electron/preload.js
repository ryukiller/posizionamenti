const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("posizionamenti", {
  runScanOnce(options) {
    return ipcRenderer.invoke("scan:run-once", options || {});
  },
  async getConfig() {
    const config = await ipcRenderer.invoke("scan:get-config");
    return config;
  },
  onLog(callback) {
    ipcRenderer.on("scan:log", (_event, message) => {
      callback(message);
    });
  },
  async getClientsWithGroups() {
    const result = await ipcRenderer.invoke("scan:get-clients-with-groups");
    return result;
  },
  async getResults(options) {
    const result = await ipcRenderer.invoke("scan:get-results", options || {});
    return result;
  },
  async chooseBatchZipPath() {
    const result = await ipcRenderer.invoke("scan:choose-zip-path");
    return result;
  },
  async downloadBatchZip(payload) {
    const result = await ipcRenderer.invoke("scan:create-batch-zip", payload || {});
    return result;
  },
  async getUserSettings() {
    const settings = await ipcRenderer.invoke("scan:get-user-settings");
    return settings;
  },
  async updateUserSettings(payload) {
    const result = await ipcRenderer.invoke("scan:update-user-settings", payload || {});
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
  onUpdateStatus(callback) {
    ipcRenderer.on("update:status", (_event, payload) => {
      callback(payload);
    });
  },
  onUpdateAvailable(callback) {
    ipcRenderer.on("update:available", (_event, payload) => {
      callback(payload);
    });
  },
  onUpdateNotAvailable(callback) {
    ipcRenderer.on("update:not-available", (_event, payload) => {
      callback(payload);
    });
  },
  onUpdateDownloadProgress(callback) {
    ipcRenderer.on("update:download-progress", (_event, payload) => {
      callback(payload);
    });
  },
  onUpdateDownloaded(callback) {
    ipcRenderer.on("update:downloaded", (_event, payload) => {
      callback(payload);
    });
  },
});

