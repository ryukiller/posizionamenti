import path from "path";
import fs from "fs";
import { app } from "electron";
import {
  chromium,
  firefox,
  webkit,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";
import type { Scanner, SerpScanResult } from "./scanner";

interface PlaywrightScannerOptions {
  screenshotsDir?: string;
  googleCountry?: string;
  googleLang?: string;
  delayBetweenQueriesMs?: number;
  maxSerpPages?: number;
  /**
   * When true, the scanner will wait longer on each SERP
   * so that CAPTCHAs can be solved manually before scraping.
   */
  manualCaptchaMode?: boolean;
  /**
   * Maximum time to wait (in ms) for manual CAPTCHA solving
   * after the SERP has loaded, when manualCaptchaMode is enabled.
   */
  manualCaptchaWaitMs?: number;
  /**
   * Optional user data directory for a persistent Chrome/Chromium profile.
   * When provided, Playwright will launch a persistent context instead of
   * a fresh browser for every keyword.
   */
  userDataDir?: string;
  /**
   * Optional browser channel to use when launching Chrome/Chromium,
   * e.g. "chrome" or "chromium". Only used when userDataDir is set.
   */
  browserChannel?: string;
  /**
   * Browser engine to use: "chromium" | "firefox" | "webkit".
   * Defaults to "chromium".
   */
  browserEngine?: "chromium" | "firefox" | "webkit";
  /**
   * Whether to run the browser in headless mode.
   * Defaults to false (browser window visible).
   */
  headless?: boolean;
}

type BrowserLike = Browser | BrowserContext;

export class PlaywrightScanner implements Scanner {
  private readonly screenshotsDir: string;
  private readonly googleCountry: string;
  private readonly googleLang: string;
  private readonly delayBetweenQueriesMs: number;
  private readonly maxSerpPages: number;
  private readonly manualCaptchaMode: boolean;
  private readonly manualCaptchaWaitMs: number;
  private readonly userDataDir?: string;
  private readonly browserChannel?: string;
  private readonly browserEngine: "chromium" | "firefox" | "webkit";
  private readonly headless: boolean;

  constructor(options: PlaywrightScannerOptions = {}) {
    const defaultScreenshotsBase =
      (app && app.getPath("userData")) || process.cwd();
    this.screenshotsDir =
      options.screenshotsDir ||
      process.env.SCREENSHOTS_DIR ||
      path.join(defaultScreenshotsBase, "screenshots");
    this.googleCountry =
      options.googleCountry || process.env.GOOGLE_COUNTRY || "it";
    this.googleLang = options.googleLang || process.env.GOOGLE_LANG || "it";
    this.delayBetweenQueriesMs =
      options.delayBetweenQueriesMs ??
      (process.env.DELAY_BETWEEN_QUERIES_MS
        ? Number.parseInt(process.env.DELAY_BETWEEN_QUERIES_MS, 10)
        : 1500);
    this.maxSerpPages =
      options.maxSerpPages ??
      (process.env.MAX_SERP_PAGES
        ? Number.parseInt(process.env.MAX_SERP_PAGES, 10)
        : 5);

    const manualCaptchaEnv =
      process.env.PLAYWRIGHT_MANUAL_CAPTCHA_MODE ||
      process.env.MANUAL_CAPTCHA_MODE;
    this.manualCaptchaMode =
      options.manualCaptchaMode ??
      (manualCaptchaEnv ? manualCaptchaEnv.toLowerCase() === "true" : true);

    const manualCaptchaWaitEnv = process.env.MANUAL_CAPTCHA_WAIT_MS;
    this.manualCaptchaWaitMs =
      options.manualCaptchaWaitMs ??
      (manualCaptchaWaitEnv
        ? Number.parseInt(manualCaptchaWaitEnv, 10)
        : 5_000);

    this.userDataDir =
      options.userDataDir || process.env.PLAYWRIGHT_PROFILE_DIR || undefined;
    this.browserChannel =
      options.browserChannel || process.env.PLAYWRIGHT_BROWSER_CHANNEL;

    this.browserEngine = options.browserEngine ?? "chromium";
    this.headless = options.headless ?? false;

    if (!fs.existsSync(this.screenshotsDir)) {
      fs.mkdirSync(this.screenshotsDir, { recursive: true });
    }
  }

  async scanKeyword(domain: string, keyword: string): Promise<SerpScanResult> {
    const runAt = new Date();

    const browser: BrowserLike = await this.launchBrowser();
    const page: Page = await browser.newPage();

    try {
      const normalizedDomain = this.normalizeDomain(domain);
      // eslint-disable-next-line no-console
      console.info(
        `[scanner] Scanning keyword="${keyword}" for domain="${domain}" (normalized="${normalizedDomain}")`,
      );

      const q = encodeURIComponent(keyword);
      const hl = encodeURIComponent(this.googleLang);
      const gl = encodeURIComponent(this.googleCountry.toLowerCase());
      const serpUrl = `https://www.google.com/search?q=${q}&hl=${hl}&gl=${gl}`;

      await page.goto(serpUrl, {
        waitUntil: "networkidle",
        timeout: 60000,
      });

      // Handle Google consent / terms modal and give the user a chance
      // to solve any CAPTCHA or additional checks before we start scraping.
      await this.handleConsentAndCaptcha(page, serpUrl);

      let position: number | null = null;
      let foundUrl: string | null = null;
      let organicIndex = 1;

      outer: for (
        let pageIndex = 0;
        pageIndex < this.maxSerpPages;
        pageIndex += 1
      ) {
        type OrganicCandidate = {
          url: string;
          host: string;
          skippedReason?: string;
        };

        const organicResults = await page.$$eval(
          "div.notranslate",
          (blocks: Element[]): OrganicCandidate[] => {
            const candidates: OrganicCandidate[] = [];
            const seenLinks = new Set<HTMLAnchorElement>();

            const isAdOrNonOrganicBlock = (el: Element): string | null => {
              if (
                el.closest(
                  "#tads, #tadsb, [data-text-ad], g-scrolling-carousel, [data-merchant-id]",
                )
              ) {
                return "ad_or_carousel";
              }
              if (el.closest("#rhs")) {
                return "right_hand_panel";
              }
              return null;
            };

            const isInsideAdsRegion = (el: Element): boolean => {
              return !!el.closest(
                '[aria-label="Annunci"], [aria-label="Ads"], [aria-label="Annuncio"], [data-text-ad]',
              );
            };

            const isHiddenByDisplayNone = (el: Element | null): boolean => {
              let current: Element | null = el;
              while (current) {
                const style = window.getComputedStyle(current);
                if (style && style.display === "none") {
                  return true;
                }
                current = current.parentElement;
              }
              return false;
            };

            for (const block of blocks) {
              if (isHiddenByDisplayNone(block)) {
                continue;
              }

              const primaryLink = block.closest(
                "a.zReHs[href^='http']",
              ) as HTMLAnchorElement | null;

              if (!primaryLink) {
                continue;
              }

              if (seenLinks.has(primaryLink)) {
                continue;
              }
              seenLinks.add(primaryLink);

              if (isHiddenByDisplayNone(primaryLink)) {
                continue;
              }

              if (isInsideAdsRegion(primaryLink)) {
                candidates.push({
                  url: primaryLink.href,
                  host: "",
                  skippedReason: "ad_region",
                });
                continue;
              }

              const nonOrganicReason = isAdOrNonOrganicBlock(primaryLink);

              const href = primaryLink.href;

              let host: string;
              try {
                host = new URL(href).hostname.replace(/^www\./, "");
              } catch {
                continue;
              }

              // Skip obvious Google / ad / shopping hosts from organic count.
              if (
                host === "google.com" ||
                host === "google.it" ||
                host.endsWith(".google.com") ||
                host.endsWith(".google.it") ||
                host.endsWith(".gstatic.com") ||
                host.endsWith(".googleusercontent.com") ||
                host === "googleadservices.com" ||
                host.endsWith(".googleadservices.com") ||
                host === "shopping.google.com"
              ) {
                candidates.push({
                  url: href,
                  host,
                  skippedReason: "google_or_ads_host",
                });
                continue;
              }

              if (nonOrganicReason) {
                candidates.push({
                  url: href,
                  host,
                  skippedReason: nonOrganicReason,
                });
                continue;
              }

              candidates.push({ url: href, host });
            }

            return candidates;
          },
        );

        const organicBlocksCount = organicResults.filter(
          (c) => !c.skippedReason,
        ).length;
        // eslint-disable-next-line no-console
        console.info(
          `[scanner] Page ${pageIndex + 1}: ${organicBlocksCount} organic blocks after skips (total candidates=${organicResults.length})`,
        );

        for (const candidate of organicResults) {
          if (candidate.skippedReason) {
            // eslint-disable-next-line no-console
            console.info(
              `[scanner] SKIP_BLOCK reason=${candidate.skippedReason} host=${candidate.host} url=${candidate.url}`,
            );
            continue;
          }

          const currentOrganicPos = organicIndex;
          organicIndex += 1;

          if (
            candidate.host === normalizedDomain ||
            candidate.host.endsWith(`.${normalizedDomain}`)
          ) {
            position = currentOrganicPos;
            foundUrl = candidate.url;
            // eslint-disable-next-line no-console
            console.info(
              `[scanner] ORGANIC_MATCH keyword="${keyword}" page=${pageIndex + 1} organicPosition=${position} host=${candidate.host} url=${candidate.url}`,
            );
            break outer;
          }

          // eslint-disable-next-line no-console
          console.info(
            `[scanner] ORGANIC_NO_MATCH keyword="${keyword}" page=${pageIndex + 1} organicPosition=${currentOrganicPos} candidateHost=${candidate.host} expectedDomain=${normalizedDomain}`,
          );
        }

        if (pageIndex < this.maxSerpPages - 1) {
          const nextLink = await page.$("a#pnnext");
          if (!nextLink) {
            break;
          }
          await Promise.all([page.waitForNavigation(), nextLink.click()]);
          await this.sleep(this.delayBetweenQueriesMs);
        }
      }

      let screenshotPath: string | undefined;
      if (foundUrl && position != null) {
        // Highlight the found result on the SERP before taking the screenshot.
        try {
          await page.evaluate(
            ({
              targetUrl,
              organicPosition,
            }: {
              targetUrl: string;
              organicPosition: number;
            }) => {
              const links = Array.from(
                document.querySelectorAll("a.zReHs[href^='http']"),
              ) as HTMLAnchorElement[];

              for (const link of links) {
                if (link.href !== targetUrl) continue;

                const container =
                  (link.closest("div.MjjYud") as HTMLElement | null) ||
                  (link.closest("div.g") as HTMLElement | null) ||
                  (link as unknown as HTMLElement);

                if (!container) continue;

                container.scrollIntoView({
                  block: "center",
                  behavior: "instant",
                });

                container.style.outline = "3px solid #ef4444";
                container.style.boxShadow = "0 0 0 3px rgba(239,68,68,0.4)";
                container.style.backgroundColor = "#fef2f2";
                if (!container.style.position) {
                  container.style.position = "relative";
                }

                const existingBadge = container.querySelector(
                  "[data-serp-position-badge='true']",
                );
                if (!existingBadge) {
                  const badge = document.createElement("div");
                  badge.textContent = `#${organicPosition}`;
                  badge.setAttribute("data-serp-position-badge", "true");
                  badge.style.position = "absolute";
                  badge.style.top = "8px";
                  badge.style.left = "-40px";
                  badge.style.padding = "2px 6px";
                  badge.style.borderRadius = "9999px";
                  badge.style.backgroundColor = "#ef4444";
                  badge.style.color = "#ffffff";
                  badge.style.fontSize = "12px";
                  badge.style.fontWeight = "600";
                  badge.style.zIndex = "2147483647";
                  badge.style.boxShadow = "0 2px 4px rgba(0,0,0,0.3)";
                  container.appendChild(badge);
                }

                break;
              }
            },
            { targetUrl: foundUrl, organicPosition: position },
          );
        } catch {
          // Best-effort highlighting; ignore errors and still capture screenshot.
        }

        // Try to hide sticky/fixed top bars that would overlap the highlighted result.
        try {
          await page.evaluate(() => {
            const allElements = Array.from(document.body.querySelectorAll("*"));
            for (const el of allElements) {
              const style = window.getComputedStyle(el);
              if (
                (style.position === "fixed" || style.position === "sticky") &&
                style.top &&
                (style.top === "0px" ||
                  style.top === "0" ||
                  parseInt(style.top, 10) < 120) &&
                el.getBoundingClientRect().height > 40 &&
                el.getBoundingClientRect().width >= window.innerWidth * 0.7
              ) {
                (el as HTMLElement).style.opacity = "0";
                (el as HTMLElement).style.pointerEvents = "none";
              }
            }
          });
        } catch {
          // Ignore failures; screenshot can still proceed.
        }

        // Scroll the page to help lazy-loaded images render before the full-page screenshot.
        try {
          for (let i = 0; i < 4; i += 1) {
            // Scroll down by one viewport height.
            // eslint-disable-next-line no-await-in-loop
            await page.evaluate(() => {
              window.scrollBy(0, window.innerHeight);
            });
            // eslint-disable-next-line no-await-in-loop
            await page.waitForTimeout(400);
          }
          // Scroll back to the highlighted result so it remains centered.
          await page.evaluate(() => {
            const highlighted = document.querySelector(
              "[data-serp-position-badge='true']",
            );
            if (highlighted && highlighted.parentElement) {
              highlighted.parentElement.scrollIntoView({
                block: "center",
                behavior: "instant",
              });
            }
          });
        } catch {
          // Best-effort only; if scrolling fails we still capture whatever is visible.
        }

        const safeKeyword = keyword
          .toLowerCase()
          .replace(/[^a-z0-9]+/gi, "-")
          .replace(/^-+|-+$/g, "");
        const timestamp = runAt.toISOString().replace(/[:.]/g, "-");
        const fileName = `${safeKeyword || "keyword"}-${timestamp}.png`;
        const fullPath = path.join(this.screenshotsDir, fileName);

        await page.screenshot({
          path: fullPath,
          fullPage: true,
        });
        screenshotPath = fullPath;
      }

      return {
        keyword,
        searchedDomain: domain,
        position,
        foundUrl,
        serpUrl,
        screenshotPath,
        runAt,
      };
    } finally {
      await browser.close();
    }
  }

  private async launchBrowser(): Promise<BrowserLike> {
    const headless = this.headless;

    if (this.userDataDir) {
      if (this.browserEngine === "firefox") {
        return firefox.launchPersistentContext(this.userDataDir, {
          headless,
        });
      }
      if (this.browserEngine === "webkit") {
        return webkit.launchPersistentContext(this.userDataDir, {
          headless,
        });
      }
      // Default: chromium (optionally with a channel)
      return chromium.launchPersistentContext(this.userDataDir, {
        headless,
      });
    }

    if (this.browserEngine === "firefox") {
      return firefox.launch({ headless });
    }
    if (this.browserEngine === "webkit") {
      return webkit.launch({ headless });
    }

    return chromium.launch({ headless });
  }

  private normalizeDomain(rawDomain: string): string {
    const trimmed = rawDomain.trim();
    if (!trimmed) {
      throw new Error("Domain must be a non-empty string");
    }

    // Accept both plain hostnames (example.com) and full URLs.
    const candidate =
      trimmed.startsWith("http://") || trimmed.startsWith("https://")
        ? trimmed
        : `http://${trimmed}`;

    try {
      const hostname = new URL(candidate).hostname;
      return hostname.replace(/^www\./, "");
    } catch {
      // Fallback: very simple sanitization, last part after space and slash.
      const withoutProtocol = trimmed.replace(/^https?:\/\//i, "");
      const firstPart = withoutProtocol.split(/[\/\s]/)[0] ?? "";
      return firstPart.replace(/^www\./, "");
    }
  }

  private async handleConsentAndCaptcha(
    page: Page,
    expectedSerpUrl: string,
  ): Promise<void> {
    // Short initial delay to let overlays render.
    await this.sleep(this.delayBetweenQueriesMs);

    const maxWaitMs = this.manualCaptchaMode
      ? this.manualCaptchaWaitMs
      : this.delayBetweenQueriesMs;
    const start = Date.now();

    while (Date.now() - start < maxWaitMs) {
      const url = page.url();
      let pathname = "";
      try {
        pathname = new URL(url).pathname;
      } catch {
        // Ignore malformed URLs and keep waiting.
      }

      // If we are on the normal search results page, try to accept consent
      // and then start scraping.
      if (pathname === "/search") {
        await this.tryAcceptConsent(page);
        return;
      }

      // For non-/search pages (CAPTCHA, "sorry" pages, etc.), in manual mode
      // we simply wait so the user can interact with the page.
      if (!this.manualCaptchaMode) {
        // In automatic mode, do not wait indefinitely on CAPTCHA pages.
        return;
      }

      await this.sleep(2000);
    }
  }

  private async tryAcceptConsent(page: Page): Promise<void> {
    try {
      // Try a few common selectors for the Google consent dialog.
      // These may vary by locale; failures are ignored.
      const selectors = [
        "button#L2AGLb", // "Accept all" button (common id)
        'button[aria-label="Accept all"]',
        'button[aria-label="Accetta tutto"]',
      ];

      for (const selector of selectors) {
        const button = await page.$(selector);
        if (button) {
          await button.click({ delay: 50 });
          await this.sleep(1000);
          return;
        }
      }
    } catch {
      // Best-effort only; ignore errors.
    }
  }

  private async sleep(ms: number): Promise<void> {
    if (ms <= 0) return;
    await new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
