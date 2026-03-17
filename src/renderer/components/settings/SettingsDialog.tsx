import React, { useState } from "react";
import { useSettings } from "../../hooks/useSettings";
import { Button } from "../ui/button";
import { getBridge } from "../../lib/bridge";
import { useTheme } from "../../lib/theme";

export interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { settings, loading, saving, error, save } = useSettings();
  const [local, setLocal] = useState(() => settings);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [updateUrl, setUpdateUrl] = useState<string | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const { theme, toggleTheme } = useTheme();

  React.useEffect(() => {
    setLocal(settings);
  }, [settings]);

  if (!open) return null;

  const current = local ?? settings;

  async function handleChooseProfileDir() {
    try {
      const bridge = getBridge();
      const result: any = await bridge.chooseProfileDir();
      if (!result?.success || result.canceled) return;
      setLocal((prev) =>
        prev ? { ...prev, browserProfileDir: result.path } : prev,
      );
    } catch {
      // errors will be surfaced via main log
    }
  }

  async function handleSave() {
    if (!current) return;
    const ok = await save(current);
    if (ok) {
      onOpenChange(false);
      // Ricarica l'interfaccia così nuovi URL/API key
      // vengono usati subito per caricare clienti e risultati
      window.location.reload();
    }
  }

  async function handleCheckUpdates() {
    setCheckingUpdate(true);
    setUpdateStatus("Controllo aggiornamenti in corso…");
    setUpdateUrl(null);
    try {
      const bridge = getBridge();
      const result: any = await bridge.checkForUpdates();
      if (result?.platform === "darwin" && result.releasesUrl) {
        setUpdateStatus(
          "Aggiornamenti macOS: nuova versione disponibile su GitHub Releases.",
        );
        setUpdateUrl(result.releasesUrl);
      } else if (result?.success) {
        setUpdateStatus(
          "Controllo aggiornamenti avviato. Eventuali dettagli appariranno nel log.",
        );
      } else {
        setUpdateStatus(
          result?.error ?? "Errore durante il controllo aggiornamenti.",
        );
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Errore durante il controllo aggiornamenti.";
      setUpdateStatus(msg);
    } finally {
      setCheckingUpdate(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[420px] max-w-[95vw] rounded-xl border border-slate-800 bg-slate-950 px-5 py-4 shadow-2xl">
        <h2 className="text-sm font-semibold text-slate-100">
          Impostazioni scansione
        </h2>
        <p className="mt-1 text-[11px] text-slate-400">
          Scegli il browser e, se vuoi, usa il tuo profilo per rendere le
          ricerche più simili al tuo uso reale.
        </p>

        {loading && (
          <div className="mt-3 text-xs text-slate-400">
            Caricamento impostazioni…
          </div>
        )}

        {current && (
          <div className="mt-3 space-y-3 text-xs">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-400">
                Browser per le scansioni
              </label>
              <select
                className="h-8 w-full rounded-md border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100"
                value={current.browser ?? "system-default"}
                onChange={(e) =>
                  setLocal((prev) =>
                    prev ? { ...prev, browser: e.target.value } : prev,
                  )
                }
              >
                <option value="system-default">
                  Usa impostazioni predefinite
                </option>
                <option value="chrome">Google Chrome</option>
                <option value="msedge">Microsoft Edge</option>
                <option value="firefox">Mozilla Firefox</option>
                <option value="chromium">Chromium</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-400">
                Cartella profilo browser (facoltativo)
              </label>
              <div className="flex items-center gap-2">
                <input
                  className="h-8 flex-1 rounded-md border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100"
                  readOnly
                  value={
                    current.browserProfileDir ?? "Nessuna cartella selezionata"
                  }
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    void handleChooseProfileDir();
                  }}
                >
                  Scegli…
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="settingsShowBrowser"
                type="checkbox"
                className="h-3 w-3 rounded border-slate-700 bg-slate-900"
                checked={!current.headless}
                onChange={(e) =>
                  setLocal((prev) =>
                    prev ? { ...prev, headless: !e.target.checked } : prev,
                  )
                }
              />
              <label
                htmlFor="settingsShowBrowser"
                className="text-[11px] text-slate-300"
              >
                Mostra il browser durante la scansione
              </label>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-col">
                <span className="mb-1 block text-[11px] font-medium text-slate-400">
                  Tema interfaccia
                </span>
                <span className="text-[11px] text-slate-500">
                  Tema corrente:{" "}
                  <span className="font-medium text-slate-300">
                    {theme === "dark" ? "Scuro" : "Chiaro"}
                  </span>
                </span>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={toggleTheme}
              >
                {theme === "dark"
                  ? "Passa a tema chiaro"
                  : "Passa a tema scuro"}
              </Button>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-400">
                Lingua preferita
              </label>
              <select
                className="h-8 w-full rounded-md border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100"
                value={current.language ?? "auto"}
                onChange={(e) =>
                  setLocal((prev) =>
                    prev ? { ...prev, language: e.target.value } : prev,
                  )
                }
              >
                <option value="auto">Automatico</option>
                <option value="it">Italiano</option>
                <option value="en">Inglese</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-400">
                URL backend SWI (SWI_BASE_URL)
              </label>
              <input
                className="h-8 w-full rounded-md border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100"
                placeholder="Es. https://app.swi.it"
                value={current.backendBaseUrl ?? ""}
                onChange={(e) =>
                  setLocal((prev) =>
                    prev ? { ...prev, backendBaseUrl: e.target.value } : prev,
                  )
                }
              />
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-400">
                API key (SCAN_APP_API_KEY)
              </label>
              <input
                className="h-8 w-full rounded-md border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100"
                placeholder="Incolla qui la chiave API"
                value={current.apiKey ?? ""}
                onChange={(e) =>
                  setLocal((prev) =>
                    prev ? { ...prev, apiKey: e.target.value } : prev,
                  )
                }
              />
            </div>

            <div className="pt-2 mt-2 border-t border-slate-800">
              <label className="mb-1 block text-[11px] font-medium text-slate-400">
                Aggiornamenti applicazione
              </label>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={checkingUpdate}
                  onClick={() => {
                    void handleCheckUpdates();
                  }}
                >
                  {checkingUpdate
                    ? "Controllo in corso…"
                    : "Controlla aggiornamenti"}
                </Button>
                {updateUrl && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      window.open(updateUrl, "_blank");
                    }}
                  >
                    Apri pagina download
                  </Button>
                )}
              </div>
              {updateStatus && (
                <div className="mt-1 text-[11px] text-slate-400">
                  {updateStatus}
                </div>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="mt-3 text-[11px] text-rose-400 min-h-[16px]">
            {error}
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Annulla
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={saving}
            onClick={() => {
              void handleSave();
            }}
          >
            Salva
          </Button>
        </div>
      </div>
    </div>
  );
}
