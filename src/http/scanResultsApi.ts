import type { AxiosError } from "axios";
import { HttpClient } from "./client";
import type {
  BulkScanResultsBody,
  BulkScanResultsResponse,
  ScanResultInput,
} from "../domain/types";

export class ValidationError extends Error {
  readonly details?: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = "ValidationError";
    this.details = details;
  }
}

export class ScanResultsApi {
  private readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  async sendBulkScanResults(
    body: BulkScanResultsBody,
  ): Promise<BulkScanResultsResponse> {
    if (!body.results || body.results.length === 0) {
      throw new ValidationError("results must be a non-empty array");
    }
    if (body.results.length > 1000) {
      throw new ValidationError("results length must be <= 1000");
    }

    type ServerScanResultInput = {
      clientId: string;
      contractId: string | null;
      keywordGroupId: string | null;
      keyword: string;
      searchedDomain: string;
      position: number | null;
      foundUrl: string | null;
      serpUrl: string;
      screenshotUrl?: string | null;
      runAt: string;
    };

    type ServerBulkScanResultsBody = {
      results: ServerScanResultInput[];
      desktopAppVersion?: string;
    };

    const mapToServerInput = (
      input: ScanResultInput,
    ): ServerScanResultInput => {
      return {
        clientId: input.clienteId,
        contractId: input.contrattoId ?? null,
        keywordGroupId: input.keywordGroupId ?? null,
        keyword: input.keyword,
        searchedDomain: input.searchedDomain,
        position: input.position ?? null,
        foundUrl: input.foundUrl ?? null,
        serpUrl: input.serpUrl,
        screenshotUrl:
          input.screenshotUrl !== undefined ? input.screenshotUrl : null,
        runAt: input.runAt,
      };
    };

    const serverBody: ServerBulkScanResultsBody = {
      results: body.results.map((r) => mapToServerInput(r)),
      desktopAppVersion: body.desktopAppVersion,
    };

    try {
      return await this.http.post<BulkScanResultsResponse>(
        "/api/scan-results/bulk",
        serverBody,
      );
    } catch (error: unknown) {
      if (this.isAxiosValidationError(error)) {
        const msg =
          (error.response?.data as { error?: string })?.error ||
          "Validation error from server";
        throw new ValidationError(msg, error.response?.data);
      }
      throw error;
    }
  }

  private isAxiosValidationError(
    error: unknown,
  ): error is AxiosError<{ error?: string }> {
    if (!this.isAxiosError(error)) {
      return false;
    }
    return error.response?.status === 400;
  }

  private isAxiosError(error: unknown): error is AxiosError {
    return (
      typeof error === "object" &&
      error !== null &&
      "isAxiosError" in error &&
      (error as AxiosError).isAxiosError === true
    );
  }
}
