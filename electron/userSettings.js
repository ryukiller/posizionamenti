const { app } = require("electron");
const fs = require("fs");
const path = require("path");

const USER_SETTINGS_FILE_NAME = "user-settings.json";

function getUserSettingsPath() {
  const userDataDir = app.getPath("userData");
  return path.join(userDataDir, USER_SETTINGS_FILE_NAME);
}

function getDefaultUserSettings() {
  return {
    browser: "system-default", // 'system-default' | 'chromium' | 'chrome' | 'msedge' | 'firefox'
    browserProfileDir: null,
    headless: false,
    language: "auto", // 'auto' | 'it' | 'en'
  };
}

function loadUserSettings() {
  const defaults = getDefaultUserSettings();
  try {
    const filePath = getUserSettingsPath();
    if (!fs.existsSync(filePath)) {
      return defaults;
    }
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      ...defaults,
      ...parsed,
    };
  } catch {
    return defaults;
  }
}

function validateUserSettings(partial) {
  const result = {};

  if (Object.prototype.hasOwnProperty.call(partial, "browser")) {
    const allowedBrowsers = [
      "system-default",
      "chromium",
      "chrome",
      "msedge",
      "firefox",
    ];
    if (!allowedBrowsers.includes(partial.browser)) {
      throw new Error("Browser non valido.");
    }
    result.browser = partial.browser;
  }

  if (Object.prototype.hasOwnProperty.call(partial, "browserProfileDir")) {
    const dir = partial.browserProfileDir;
    if (dir === null || dir === "" || dir === undefined) {
      result.browserProfileDir = null;
    } else if (typeof dir === "string" && fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
      result.browserProfileDir = dir;
    } else {
      throw new Error("La cartella profilo selezionata non esiste o non è una cartella.");
    }
  }

  if (Object.prototype.hasOwnProperty.call(partial, "headless")) {
    result.headless = !!partial.headless;
  }

  if (Object.prototype.hasOwnProperty.call(partial, "language")) {
    const allowedLanguages = ["auto", "it", "en"];
    if (!allowedLanguages.includes(partial.language)) {
      throw new Error("Lingua non valida.");
    }
    result.language = partial.language;
  }

  return result;
}

function saveUserSettings(partial) {
  const current = loadUserSettings();
  const validated = validateUserSettings(partial);
  const merged = {
    ...current,
    ...validated,
  };
  const filePath = getUserSettingsPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(merged, null, 2), "utf8");
  return merged;
}

module.exports = {
  getUserSettingsPath,
  getDefaultUserSettings,
  loadUserSettings,
  saveUserSettings,
};

