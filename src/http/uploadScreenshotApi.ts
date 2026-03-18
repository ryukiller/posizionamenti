import fs from "fs";
import path from "path";
import FormData from "form-data";
import { HttpClient } from "./client";
import { resolveMaybeRelativeUrl } from "./resolveUrl";

interface UploadScreenshotResponse {
  success: boolean;
  url: string;
}

export interface UploadScreenshotParams {
  filePath: string;
  clienteId: string;
}

export class UploadScreenshotApi {
  private readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }

  async uploadScreenshot(params: UploadScreenshotParams): Promise<string> {
    const { filePath, clienteId } = params;

    const resolvedPath = path.resolve(filePath);
    const fileStream = fs.createReadStream(resolvedPath);

    const formData = new FormData();
    formData.append("file", fileStream);
    formData.append("clientId", clienteId);

    const headers = formData.getHeaders();

    const response = await this.http.post<UploadScreenshotResponse>(
      "/api/scan-results/upload-screenshot",
      formData,
      {
        headers,
        maxBodyLength: 5 * 1024 * 1024,
      },
    );

    if (!response.success || !response.url) {
      throw new Error("Invalid response from upload-screenshot endpoint");
    }

    return resolveMaybeRelativeUrl(this.http.getBaseUrl(), response.url);
  }
}
