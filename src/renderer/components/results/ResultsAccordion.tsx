import React, { useMemo } from "react";
import type { ScanResult } from "../../hooks/useResults";

export interface ResultsAccordionProps {
  results: ScanResult[];
}

export function ResultsAccordion({ results }: ResultsAccordionProps) {
  const batches = useMemo(() => {
    const map = new Map<string, ScanResult[]>();
    for (const r of results) {
      const key = r.batchId || r.runAt || "unknown";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries()).sort((a, b) => {
      const aDate = new Date(a[1][0]?.runAt ?? 0).getTime();
      const bDate = new Date(b[1][0]?.runAt ?? 0).getTime();
      return bDate - aDate;
    });
  }, [results]);

  if (batches.length === 0) {
    return (
      <div className="mt-3 text-xs text-slate-500">
        Nessun risultato caricato per il gruppo selezionato.
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      {batches.map(([batchId, items]) => (
        <details
          key={batchId}
          className="overflow-hidden rounded-md border border-slate-800 bg-slate-950/80"
        >
          <summary className="flex cursor-pointer items-center justify-between px-3 py-2 text-xs text-slate-100">
            <div>
              <span className="font-semibold">
                Batch {formatBatchTitle(items[0]?.runAt)}
              </span>
              <span className="ml-2 text-[11px] text-slate-400">
                {items.length} risultati
              </span>
            </div>
          </summary>
          <div className="border-t border-slate-800">
            <table className="w-full border-collapse text-[11px]">
              <thead className="bg-slate-950">
                <tr>
                  <Th>Keyword</Th>
                  <Th>Dominio</Th>
                  <Th>Posizione</Th>
                  <Th>URL trovata</Th>
                  <Th>Google</Th>
                  <Th>Screenshot</Th>
                  <Th>Data/ora</Th>
                </tr>
              </thead>
              <tbody className="bg-slate-950">
                {items.map((r, idx) => (
                  <tr key={idx} className="border-t border-slate-900">
                    <Td>{r.keyword}</Td>
                    <Td>{r.searchedDomain}</Td>
                    <Td
                      className={
                        r.position !== null && r.position !== undefined
                          ? "text-emerald-300"
                          : "text-rose-300"
                      }
                    >
                      {r.position ?? "–"}
                    </Td>
                    <Td>{r.foundUrl ?? ""}</Td>
                    <Td>
                      {r.serpUrl ? (
                        <a
                          href={r.serpUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sky-400 underline"
                        >
                          Apri
                        </a>
                      ) : (
                        "-"
                      )}
                    </Td>
                    <Td>
                      {r.screenshotUrl ? (
                        <a
                          href={r.screenshotUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sky-400 underline"
                        >
                          Apri
                        </a>
                      ) : (
                        "-"
                      )}
                    </Td>
                    <Td>{formatDateTime(r.runAt)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ))}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="border-b border-slate-900 px-2 py-1 text-left font-semibold text-slate-300">
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-2 py-1 text-slate-100">{children}</td>;
}

function formatBatchTitle(runAt: string | undefined): string {
  const d = runAt ? new Date(runAt) : new Date(0);
  if (Number.isNaN(d.getTime())) return String(runAt ?? "");
  const pad = (n: number) => String(n).padStart(2, "0");
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hour = pad(d.getHours());
  const minute = pad(d.getMinutes());
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function formatDateTime(value: string | undefined | null): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
}
