import React from "react";
import { Button } from "../ui/button";
import type { SelectedGroup } from "../../hooks/useClients";

export interface ScanControlsProps {
  onRunScan: () => Promise<void>;
  running: boolean;
  selectedGroup: SelectedGroup | null;
}

export function ScanControls({
  onRunScan,
  running,
  selectedGroup,
}: ScanControlsProps) {
  return (
    <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <Button
          type="button"
          size="lg"
          disabled={running}
          onClick={() => {
            void onRunScan();
          }}
        >
          <span>Avvia scansione</span>
        </Button>
        <div className="text-xs text-slate-400">
          {selectedGroup ? (
            <>
              Gruppo selezionato:{" "}
              <span className="font-medium text-slate-100">
                {selectedGroup.clientName}
              </span>{" "}
              →{" "}
              <span className="font-medium text-slate-100">
                {selectedGroup.keywordGroupName}
              </span>{" "}
              (dominio:{" "}
              <span className="font-medium text-slate-100">
                {selectedGroup.domain}
              </span>
              )
            </>
          ) : (
            "Seleziona prima un gruppo di keyword nella sidebar."
          )}
        </div>
      </div>
    </div>
  );
}
