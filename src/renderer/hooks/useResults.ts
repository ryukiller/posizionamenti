import { useCallback, useState } from "react";
import { getBridge } from "../lib/bridge";
import type { SelectedGroup } from "./useClients";

export interface ScanResult {
  keyword: string;
  searchedDomain: string;
  position: number | null;
  foundUrl: string | null;
  serpUrl: string | null;
  screenshotUrl: string | null;
  runAt: string;
  batchId?: string;
}

export function useResults() {
  const [results, setResults] = useState<ScanResult[]>([]);
  const [loading, setLoading] = useState(false);

  const loadForGroup = useCallback(async (group: SelectedGroup | null) => {
    if (!group) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const bridge = getBridge();
      const query = {
        clienteId: group.clienteId ?? null,
        contrattoId: group.contrattoId ?? null,
        keywordGroupId: group.keywordGroupId ?? null,
      };
      const resp: any = await bridge.getResults(query);
      if (!resp?.success) {
        // keep previous results, errors will be surfaced in log via main
        return;
      }
      setResults(resp.results ?? []);
    } catch (err) {
      // keep previous results, but avoid propagating bridge errors
      // details will already be in the main log if applicable
    } finally {
      setLoading(false);
    }
  }, []);

  return { results, loading, loadForGroup };
}
