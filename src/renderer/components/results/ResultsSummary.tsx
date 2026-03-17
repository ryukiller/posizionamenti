import React, { useMemo } from "react";
import type { ScanResult } from "../../hooks/useResults";

export interface ResultsSummaryProps {
  results: ScanResult[];
}

export function ResultsSummary({ results }: ResultsSummaryProps) {
  const { total, found, notFound, rangeText } = useMemo(() => {
    const total = results.length;
    let found = 0;
    let notFound = 0;
    let minDate: Date | null = null;
    let maxDate: Date | null = null;

    for (const r of results) {
      if (r.position !== null && r.position !== undefined) {
        found += 1;
      } else {
        notFound += 1;
      }
      const d = new Date(r.runAt);
      if (!Number.isNaN(d.getTime())) {
        if (!minDate || d < minDate) minDate = d;
        if (!maxDate || d > maxDate) maxDate = d;
      }
    }
    let rangeText = "-";
    if (minDate && maxDate) {
      rangeText = `${minDate.toLocaleDateString()} → ${maxDate.toLocaleDateString()}`;
    }
    return { total, found, notFound, rangeText };
  }, [results]);

  return (
    <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-slate-400">
      <div>
        Totale: <span className="font-medium text-slate-100">{total}</span>
      </div>
      <div>
        Trovati: <span className="font-medium text-emerald-300">{found}</span>
      </div>
      <div>
        Non trovati:{" "}
        <span className="font-medium text-rose-300">{notFound}</span>
      </div>
      <div>
        Intervallo:{" "}
        <span className="font-medium text-slate-100">{rangeText}</span>
      </div>
    </div>
  );
}
