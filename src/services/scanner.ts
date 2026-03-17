export interface SerpScanResult {
  keyword: string;
  searchedDomain: string;
  position: number | null;
  foundUrl: string | null;
  serpUrl: string;
  screenshotPath?: string;
  runAt: Date;
}

export interface Scanner {
  scanKeyword(domain: string, keyword: string): Promise<SerpScanResult>;
}

// Basic stub implementation to be replaced with real Google scanning logic.
export class StubScanner implements Scanner {
  async scanKeyword(domain: string, keyword: string): Promise<SerpScanResult> {
    const now = new Date();
    return {
      keyword,
      searchedDomain: domain,
      position: null,
      foundUrl: null,
      serpUrl: "https://www.google.com/search?q=" + encodeURIComponent(keyword),
      runAt: now,
    };
  }
}
