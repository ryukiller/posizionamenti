import { HttpClient } from "./client";
import { ScanTargetsResponse } from "../domain/types";

export interface ScanTargetsQuery {
  clienteId?: string;
  contrattoId?: string;
  keywordGroupId?: string;
}

export class ScanTargetsApi {
  private readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  async fetchScanTargets(
    query?: ScanTargetsQuery,
  ): Promise<ScanTargetsResponse> {
    const params = new URLSearchParams();
    if (query?.clienteId) {
      params.set("clienteId", query.clienteId);
    }
    if (query?.contrattoId) {
      params.set("contrattoId", query.contrattoId);
    }
    if (query?.keywordGroupId) {
      params.set("keywordGroupId", query.keywordGroupId);
    }

    const queryString = params.toString();
    const url =
      "/api/scan-targets" + (queryString.length > 0 ? `?${queryString}` : "");

    return this.http.get<ScanTargetsResponse>(url);
  }
}
