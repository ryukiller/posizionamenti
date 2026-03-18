import { useEffect, useState } from "react";
import { getBridge } from "../lib/bridge";

export interface KeywordGroup {
  keywordGroupId: string;
  keywordGroupName: string;
  contrattoId: string | null;
  numeroContrattoInterno?: string | null;
  domain: string;
  keywords: string[];
}

export interface ClientWithGroups {
  clienteId: string;
  clientName: string;
  groups: KeywordGroup[];
}

export interface SelectedGroup {
  clienteId: string;
  clientName: string;
  keywordGroupId: string;
  keywordGroupName: string;
  contrattoId?: string;
  numeroContrattoInterno?: string;
  domain: string;
  keywords?: string[];
}

export function useClients() {
  const [clients, setClients] = useState<ClientWithGroups[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const bridge = getBridge();
        const result: any = await bridge.getClientsWithGroups();
        if (!result?.success) {
          if (!cancelled) {
            setError(result?.error ?? "Impossibile caricare clienti/gruppi.");
          }
          return;
        }
        if (!cancelled) {
          setClients(result.clients ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          const msg =
            err instanceof Error
              ? err.message
              : "Errore caricando clienti/gruppi.";
          setError(msg);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { clients, loading, error };
}
