import React, { useEffect, useRef, useState } from "react";
import { getBridge } from "../../lib/bridge";

export function LogConsole() {
  const [lines, setLines] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement | null>(null);

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
    <div
      ref={ref}
      className="mt-3 h-40 overflow-y-auto rounded-md border border-slate-800 bg-slate-950/80 px-3 py-2 font-mono text-[11px]"
    >
      {lines.length === 0 ? (
        <div className="text-slate-500 text-[11px]">
          Log scansioni. I messaggi appariranno qui.
        </div>
      ) : (
        lines.map((line, idx) => (
          <div key={idx} className="text-slate-200">
            {line}
          </div>
        ))
      )}
    </div>
  );
}
