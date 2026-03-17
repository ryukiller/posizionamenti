import { useEffect, useState } from "react";
import { getBridge } from "../lib/bridge";

export interface UserSettings {
  browser: string | null;
  browserProfileDir: string | null;
  headless: boolean;
  language: string | null;
  backendBaseUrl: string | null;
  apiKey: string | null;
}

const defaultSettings: UserSettings = {
  browser: "system-default",
  browserProfileDir: null,
  headless: false,
  language: "auto",
  backendBaseUrl: null,
  apiKey: null,
};

export function useSettings() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const bridge = getBridge();
        const s: any = await bridge.getUserSettings();
        if (!cancelled) {
          setSettings({ ...defaultSettings, ...(s ?? {}) });
        }
      } catch (err) {
        if (!cancelled) {
          const msg =
            err instanceof Error
              ? err.message
              : "Errore caricando impostazioni.";
          setError(msg);
          // Fallback a impostazioni di default così la UI non resta vuota
          setSettings(defaultSettings);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(partial: Partial<UserSettings>) {
    setSaving(true);
    setError(null);
    try {
      const bridge = getBridge();
      const payload: any = {
        ...partial,
      };
      const result: any = await bridge.updateUserSettings(payload);
      if (!result?.success) {
        const msg = result?.error ?? "Impossibile salvare le impostazioni.";
        setError(msg);
        return false;
      }
      setSettings((prev) => ({ ...(prev ?? defaultSettings), ...partial }));
      return true;
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Errore salvando impostazioni.";
      setError(msg);
      return false;
    } finally {
      setSaving(false);
    }
  }

  return { settings, loading, saving, error, save };
}
