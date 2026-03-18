import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
} from "axios";
import type { AppConfig } from "../config";

export class InvalidApiKeyError extends Error {}

export interface HttpClientOptions {
  config: AppConfig;
}

export class HttpClient {
  private readonly instance: AxiosInstance;

  private readonly config: AppConfig;

  constructor(options: HttpClientOptions) {
    this.config = options.config;
    this.instance = axios.create({
      baseURL: this.config.swiBaseUrl,
      timeout: 30000,
    });

    this.instance.interceptors.request.use((request) => {
      const existingHeaders = request.headers || {};
      // eslint-disable-next-line no-param-reassign, @typescript-eslint/no-explicit-any
      (request.headers as any) = {
        ...existingHeaders,
        "x-api-key": this.config.apiKey,
      };
      return request;
    });
  }

  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response: AxiosResponse<T> = await this.instance.get(url, config);
      return response.data;
    } catch (error: unknown) {
      this.handleError(error);
      throw error;
    }
  }

  async post<T>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    try {
      const response: AxiosResponse<T> = await this.instance.post(
        url,
        data,
        config,
      );
      return response.data;
    } catch (error: unknown) {
      this.handleError(error);
      throw error;
    }
  }

  getBaseUrl(): string {
    return this.config.swiBaseUrl;
  }

  private handleError(error: unknown): void {
    if (!axios.isAxiosError(error) || !error.response) {
      return;
    }

    const { status, data } = error.response;
    if (
      status === 401 &&
      data &&
      typeof data === "object" &&
      (data as { error?: string }).error === "API key non valida"
    ) {
      throw new InvalidApiKeyError("API key non valida o non configurata");
    }
  }
}
