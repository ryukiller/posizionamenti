import { HttpClient } from "./client";
import { resolveMaybeRelativeUrl } from "./resolveUrl";

export interface ScanResultsQuery {
  clienteId?: string;
  contrattoId?: string | null;
  keywordGroupId?: string | null;
}

type BackendScanResultSummary = {
  _id: string;
  batchId: string;
  keywordGroupId: string | null;
  keyword: string;
  searchedDomain: string;
  position: number | null;
  foundUrl: string | null;
  serpUrl: string;
  screenshotUrl?: string;
  runAt: string;
};

type BackendScanResultsByGroup = {
  [keywordGroupId: string]: BackendScanResultSummary[];
};

type BackendScanResultsResponse = {
  message: string;
  data: BackendScanResultsByGroup;
  limitPerGroup: number;
};

export interface ScanResult {
  id: string;
  batchId: string;
  clienteId: string | null;
  contrattoId: string | null;
  keywordGroupId: string | null;
  keyword: string;
  searchedDomain: string;
  position: number | null;
  foundUrl: string | null;
  serpUrl: string;
  screenshotUrl?: string | null;
  runAt: string;
}

export interface ScanResultsResponse {
  results: ScanResult[];
  count: number;
}

export class ScanResultsViewApi {
  private readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  async fetchScanResults(
    query: ScanResultsQuery,
  ): Promise<ScanResultsResponse> {
    const params = new URLSearchParams();

    const rawClienteId =
      query.clienteId && String(query.clienteId).trim() !== ""
        ? String(query.clienteId).trim()
        : undefined;
    if (rawClienteId && rawClienteId.toLowerCase() !== "undefined") {
      params.set("clienteId", rawClienteId);
    }

    if (query.contrattoId !== undefined && query.contrattoId !== null) {
      const c = String(query.contrattoId).trim();
      if (c !== "" && c.toLowerCase() !== "undefined") {
        params.set("contrattoId", c);
      }
    }

    if (query.keywordGroupId) {
      params.set("keywordGroupId", query.keywordGroupId);
    }

    const queryString = params.toString();
    const url =
      "/api/scan-results" + (queryString.length > 0 ? `?${queryString}` : "");

    const raw = await this.http.get<BackendScanResultsResponse>(url);

    const flatResults: ScanResult[] = [];
    for (const groupId of Object.keys(raw.data)) {
      const summaries = raw.data[groupId] || [];
      for (const s of summaries) {
        flatResults.push({
          id: s._id,
          batchId: s.batchId,
          clienteId: null,
          contrattoId: null,
          keywordGroupId: s.keywordGroupId,
          keyword: s.keyword,
          searchedDomain: s.searchedDomain,
          position: s.position,
          foundUrl: s.foundUrl,
          serpUrl: s.serpUrl,
          screenshotUrl: s.screenshotUrl
            ? resolveMaybeRelativeUrl(this.http.getBaseUrl(), s.screenshotUrl)
            : null,
          runAt: s.runAt,
        });
      }
    }

    return {
      results: flatResults,
      count: flatResults.length,
    };
  }
}
