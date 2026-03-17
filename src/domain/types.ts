export interface ScanTarget {
  clienteId: string;
  clientName: string;
  domain: string;
  contrattoId: string | null;
  contractName: string | null;
  keywordGroupId: string;
  keywordGroupName: string;
  keywords: string[];
}

export interface ScanTargetsResponse {
  targets: ScanTarget[];
  count: number;
}

export interface ScanResultInput {
  clienteId: string;
  contrattoId: string | null;
  keywordGroupId: string | null;
  keyword: string;
  searchedDomain: string;
  position: number | null;
  foundUrl: string | null;
  serpUrl: string;
  screenshotUrl?: string;
  runAt: string;
}

export interface BulkScanResultsBody {
  results: ScanResultInput[];
  desktopAppVersion?: string;
}

export interface BulkScanResultsResponse {
  success: boolean;
  batchId: string;
  insertedCount: number;
}
