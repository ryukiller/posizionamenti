import React from "react";
import type { SelectedGroup } from "../../hooks/useClients";

export interface ShellProps {
  sidebar: React.ReactNode;
  main: React.ReactNode;
}

export function Shell({ sidebar, main }: ShellProps) {
  return (
    <div className="h-screen w-screen bg-slate-950 text-slate-100 p-4">
      <div className="flex h-full gap-3">
        <aside className="w-72 flex-shrink-0 rounded-xl border border-slate-800 bg-slate-950/80 shadow-xl">
          {sidebar}
        </aside>
        <main className="flex-1 min-w-0 rounded-xl border border-slate-800 bg-slate-950/80 shadow-xl flex flex-col">
          {main}
        </main>
      </div>
    </div>
  );
}

export interface HeaderProps {
  selectedGroup: SelectedGroup | null;
  status: string;
  selectionSummary: string;
  themeToggle: React.ReactNode;
}

export function MainHeader({
  selectedGroup,
  status,
  selectionSummary,
  themeToggle,
}: HeaderProps) {
  return (
    <div className="border-b border-slate-800 px-5 py-3 flex items-center justify-between gap-4">
      <div>
        <h1 className="text-base font-semibold">Posizionamenti</h1>
        <p className="mt-0.5 text-xs text-slate-400">
          Seleziona un gruppo di keyword nella sidebar e avvia la scansione. I
          risultati verranno inviati alla webapp SWI tramite API.
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Stato: <span className="font-medium text-slate-100">{status}</span>
        </p>
        <p className="mt-0.5 text-xs text-slate-400">
          {selectionSummary ||
            (selectedGroup
              ? `Gruppo selezionato: ${selectedGroup.clientName} → ${selectedGroup.keywordGroupName}`
              : "Nessun gruppo selezionato.")}
        </p>
      </div>
      <div className="flex items-center gap-2">{themeToggle}</div>
    </div>
  );
}
