import { app } from "electron";
import fs from "fs";
import path from "path";

export interface UserSettings {
  backendBaseUrl?: string;
  apiKey?: string;
  browser?: string | null;
  headless?: boolean;
  language?: string;
  profileDir?: string | null;
}

const SETTINGS_FILE_NAME = "user-settings.json";

function getSettingsFilePath(): string {
  const userDataDir = app.getPath("userData");
  return path.join(userDataDir, SETTINGS_FILE_NAME);
}

export function loadUserSettings(): UserSettings | null {
  try {
    const filePath = getSettingsFilePath();
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UserSettings;
    return parsed ?? null;
  } catch {
    return null;
  }
}

export function saveUserSettings(partial: Partial<UserSettings>): UserSettings {
  const filePath = getSettingsFilePath();

  let current: UserSettings = {};
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf8");
      if (raw) {
        current = { ...(JSON.parse(raw) as UserSettings) };
      }
    }
  } catch {
    current = {};
  }

  const merged: UserSettings = {
    ...current,
    ...partial,
  };

  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(merged, null, 2), "utf8");
  } catch {
    // ignore write errors; caller will still get merged object in memory
  }

  return merged;
}
