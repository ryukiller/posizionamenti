import { useState } from "react";
import { getBridge } from "../lib/bridge";
import type { SelectedGroup } from "./useClients";

export function useScan() {
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<string>("inattivo");

  async function runOnce(group: SelectedGroup | null) {
    if (!group) {
      const errorMessage = "Nessun gruppo selezionato.";
      setStatus("errore");
      return { success: false, error: errorMessage };
    }
    setRunning(true);
    setStatus("in esecuzione...");
    try {
      const bridge = getBridge();
      const result: any = await bridge.runScanOnce({
        clienteId: group.clienteId,
        contrattoId: group.contrattoId,
        keywordGroupId: group.keywordGroupId,
      });
      if (!result?.success) {
        setStatus("errore");
      } else {
        setStatus("completata");
      }
      return result;
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Errore durante l'esecuzione della scansione.";
      setStatus(`errore: ${message}`);
      return { success: false, error: message };
    } finally {
      setRunning(false);
    }
  }

  return { running, status, runOnce, setStatus };
}
