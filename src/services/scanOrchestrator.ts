import type { AppConfig } from "../config";
import { HttpClient, InvalidApiKeyError } from "../http/client";
import { ScanTargetsApi, type ScanTargetsQuery } from "../http/scanTargetsApi";
import { ScanResultsApi } from "../http/scanResultsApi";
import { UploadScreenshotApi } from "../http/uploadScreenshotApi";
import type { Scanner } from "./scanner";
import { mapSerpResultToScanResultInput } from "../domain/mapping";
import type { BulkScanResultsBody, ScanResultInput } from "../domain/types";
import { withRetry } from "../utils/retry";

export interface RunOptions {
  clienteId?: string;
  contrattoId?: string;
  keywordGroupId?: string;
  maxResultsPerBatch?: number;
  dryRun?: boolean;
}

export class ScanOrchestrator {
  private readonly config: AppConfig;

  private readonly httpClient: HttpClient;

  private readonly scanTargetsApi: ScanTargetsApi;

  private readonly scanResultsApi: ScanResultsApi;

  private readonly uploadScreenshotApi: UploadScreenshotApi;

  private readonly scanner: Scanner;

  constructor(config: AppConfig, scanner: Scanner) {
    this.config = config;
    this.httpClient = new HttpClient({ config: this.config });
    this.scanTargetsApi = new ScanTargetsApi(this.httpClient);
    this.scanResultsApi = new ScanResultsApi(this.httpClient);
    this.uploadScreenshotApi = new UploadScreenshotApi(this.httpClient);
    this.scanner = scanner;
  }

  async runOnce(options: RunOptions = {}): Promise<void> {
    const query: ScanTargetsQuery = {
      clienteId: options.clienteId,
      contrattoId: options.contrattoId,
      keywordGroupId: options.keywordGroupId,
    };

    try {
      const targetsResponse = await this.scanTargetsApi.fetchScanTargets(query);
      // eslint-disable-next-line no-console
      console.info(
        `[orchestrator] Loaded ${targetsResponse.count} scan targets for clienteId=${query.clienteId ?? "all"} contrattoId=${query.contrattoId ?? "all"}`,
      );

      const allResults: ScanResultInput[] = [];

      for (const target of targetsResponse.targets) {
        // eslint-disable-next-line no-console
        console.info(
          `[orchestrator] Target domain="${target.domain}" keywordGroupId=${target.keywordGroupId} keywords=${target.keywords.length}`,
        );

        for (const keyword of target.keywords) {
          // eslint-disable-next-line no-console
          console.info(
            `[scan] START keyword="${keyword}" domain="${target.domain}" clienteId=${target.clienteId} contrattoId=${target.contrattoId ?? "null"}`,
          );
          const serpResult = await this.scanner.scanKeyword(
            target.domain,
            keyword,
          );

          let screenshotUrl: string | undefined;
          if (serpResult.screenshotPath) {
            const rawClienteId =
              (target as any).clienteId ?? (target as any).clientId;
            if (rawClienteId) {
              try {
                const uploadFn = async () =>
                  this.uploadScreenshotApi.uploadScreenshot({
                    filePath: serpResult.screenshotPath as string,
                    clienteId: String(rawClienteId),
                  });
                screenshotUrl = await withRetry(uploadFn, this.config.retry);
              } catch (error) {
                // eslint-disable-next-line no-console
                console.error(
                  `Failed to upload screenshot for keyword "${keyword}": ${
                    (error as Error).message
                  }`,
                );
              }
            }
          }

          // eslint-disable-next-line no-console
          console.info(
            `[scan] RESULT keyword="${keyword}" domain="${target.domain}" position=${serpResult.position ?? "null"} foundUrl=${serpResult.foundUrl ?? "none"}`,
          );

          const input = mapSerpResultToScanResultInput(
            target,
            serpResult,
            screenshotUrl,
          );
          allResults.push(input);
        }
      }

      if (options.dryRun) {
        // eslint-disable-next-line no-console
        console.info(
          `Dry run enabled, would send ${allResults.length} results to backend`,
        );
        return;
      }

      const batchSize = options.maxResultsPerBatch ?? 1000;
      for (let i = 0; i < allResults.length; i += batchSize) {
        const batch = allResults.slice(i, i + batchSize);
        const body: BulkScanResultsBody = {
          results: batch,
          desktopAppVersion: this.config.desktopAppVersion,
        };

        const sendFn = async () =>
          this.scanResultsApi.sendBulkScanResults(body);

        try {
          const response = await withRetry(sendFn, this.config.retry);
          // eslint-disable-next-line no-console
          console.info(
            `Sent batch ${i / batchSize + 1}, batchId=${response.batchId}, insertedCount=${response.insertedCount}`,
          );
        } catch (error) {
          if (error instanceof InvalidApiKeyError) {
            throw error;
          }
          // eslint-disable-next-line no-console
          console.error(
            `Failed to send batch starting at index ${i}: ${
              (error as Error).message
            }`,
          );
          break;
        }
      }
    } catch (error) {
      if (error instanceof InvalidApiKeyError) {
        // eslint-disable-next-line no-console
        console.error(
          "API key non valida o non configurata; controlla SCAN_APP_API_KEY",
        );
      } else {
        // eslint-disable-next-line no-console
        console.error(
          `Error running scan orchestrator: ${(error as Error).message}`,
        );
      }
      throw error;
    }
  }
}
