import dotenv from "dotenv";

dotenv.config();

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
}

export interface AppConfig {
  swiBaseUrl: string;
  apiKey: string;
  desktopAppVersion?: string;
  concurrency: number;
  retry: RetryConfig;
}

function getEnv(name: string, required: boolean = true): string | undefined {
  const value = process.env[name];
  if (!value && required) {
    // In packaged desktop builds the environment may be partially missing.
    // Log a clear error instead of throwing so the UI can still start.
    // Downstream callers should handle empty/undefined values gracefully.
    // eslint-disable-next-line no-console
    console.error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadConfig(): AppConfig {
  const swiBaseUrl = getEnv("SWI_BASE_URL") || "http://localhost:3001"; // default for local development

  const apiKey = getEnv("SCAN_APP_API_KEY") || "";

  const desktopAppVersion = getEnv("DESKTOP_APP_VERSION", false);

  const concurrency =
    Number.parseInt(getEnv("SCANNER_CONCURRENCY", false) || "5", 10) || 5;

  const maxAttempts =
    Number.parseInt(getEnv("HTTP_RETRY_MAX_ATTEMPTS", false) || "3", 10) || 3;
  const baseDelayMs =
    Number.parseInt(getEnv("HTTP_RETRY_BASE_DELAY_MS", false) || "1000", 10) ||
    1000;

  return {
    swiBaseUrl,
    apiKey,
    desktopAppVersion,
    concurrency,
    retry: {
      maxAttempts,
      baseDelayMs,
    },
  };
}
