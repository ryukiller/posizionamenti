import React, { useEffect, useRef, useState } from "react";
import { getBridge } from "../../lib/bridge";

export function LogConsole() {
  const [lines, setLines] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement | null>(null);
  const previewLines = lines.slice(-2);

  useEffect(() => {
    try {
      const bridge = getBridge();
      bridge.onLog((message) => {
        setLines((prev) => [...prev, message]);
      });
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Bridge posizionamenti non disponibile.";
      setLines((prev) => [...prev, `[errore log] ${msg}`]);
    }
  }, []);

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [lines]);

  return (
    <details className="mt-3 rounded-md border border-slate-800/70 bg-slate-950/40">
      <summary className="cursor-pointer select-none px-3 py-2 text-xs text-slate-400 hover:text-slate-300 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium">Log</div>
          {previewLines.length > 0 && (
            <div className="mt-1 font-mono text-[11px] text-slate-500 line-clamp-2 break-all">
              {previewLines.join(" · ")}
            </div>
          )}
        </div>
        <span className="tabular-nums whitespace-nowrap">
          {lines.length === 0 ? "nessun messaggio" : `${lines.length} righe`}
        </span>
      </summary>
      <div
        ref={ref}
        className="max-h-32 overflow-y-auto border-t border-slate-800/60 px-3 py-2 font-mono text-[11px] text-slate-300/90"
      >
        {lines.length === 0 ? (
          <div className="text-slate-500 text-[11px]">
            Log scansioni. I messaggi appariranno qui.
          </div>
        ) : (
          lines.map((line, idx) => <div key={idx}>{line}</div>)
        )}
      </div>
    </details>
  );
}
