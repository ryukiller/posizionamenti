import type { ScanResultInput, ScanTarget } from "./types";
import type { SerpScanResult } from "../services/scanner";

export function mapSerpResultToScanResultInput(
  target: ScanTarget,
  serp: SerpScanResult,
  screenshotUrl?: string,
): ScanResultInput {
  const clienteId =
    // prefer explicit clienteId if it exists
    (target as any).clienteId ??
    // fall back to clientId from backend API
    (target as any).clientId;
  const input: ScanResultInput = {
    clienteId,
    contrattoId:
      (target as any).contrattoId ?? (target as any).contractId ?? null,
    keywordGroupId: target.keywordGroupId,
    keyword: serp.keyword,
    searchedDomain: serp.searchedDomain,
    position: serp.position,
    foundUrl: serp.foundUrl,
    serpUrl: serp.serpUrl,
    runAt: serp.runAt.toISOString(),
  };
  if (screenshotUrl) {
    input.screenshotUrl = screenshotUrl;
  }
  return input;
}
