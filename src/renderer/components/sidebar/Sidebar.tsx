import React, { useMemo, useState } from "react";
import { useClients, type SelectedGroup } from "../../hooks/useClients";
import { Button } from "../ui/button";

export interface SidebarProps {
  selectedGroup: SelectedGroup | null;
  onSelectGroup: (g: SelectedGroup | null) => void;
  onOpenSettings: () => void;
  hasUpdateAvailable?: boolean;
}

export function Sidebar({
  selectedGroup,
  onSelectGroup,
  onOpenSettings,
  hasUpdateAvailable,
}: SidebarProps) {
  const { clients, loading, error } = useClients();
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return clients;
    return clients
      .map((client) => ({
        ...client,
        groups: client.groups.filter((g) => {
          if (client.clientName.toLowerCase().includes(f)) return true;
          if (g.domain.toLowerCase().includes(f)) return true;
          return (g.keywords ?? []).some((kw) =>
            String(kw).toLowerCase().includes(f),
          );
        }),
      }))
      .filter((c) => c.groups.length > 0);
  }, [clients, filter]);

  return (
    <div className="flex h-full flex-col px-3 py-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        Clienti e gruppi di keyword
      </div>
      {error && <div className="mb-2 text-xs text-rose-400">{error}</div>}
      <div className="mb-2">
        <label className="mb-1 block text-[11px] font-medium text-slate-400">
          Cerca clienti/gruppi
        </label>
        <input
          className="h-7 w-full rounded-md border border-slate-700 bg-slate-900 px-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-500"
          placeholder="Filtra per nome, dominio o keyword"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      <div className="mt-1 flex-1 overflow-y-auto pr-1 text-xs">
        {loading && (
          <div className="text-slate-500 text-xs">Caricamento clienti…</div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="text-slate-500 text-xs">
            Nessun cliente con gruppi di keyword disponibile.
          </div>
        )}
        {filtered.map((client) => (
          <div key={client.clienteId} className="mb-2">
            <div className="mb-1 text-[11px] font-semibold text-slate-200">
              {client.clientName}
            </div>
            <div className="space-y-1">
              {client.groups.map((group) => {
                const isSelected =
                  selectedGroup &&
                  selectedGroup.clienteId === client.clienteId &&
                  selectedGroup.keywordGroupId === String(group.keywordGroupId);
                const keywords = group.keywords ?? [];
                const maxPreview = 5;
                const visible = keywords.slice(0, maxPreview);
                const rest = keywords.length - visible.length;
                const preview =
                  keywords.length === 0
                    ? "Nessuna keyword"
                    : `${visible.join(", ")}${rest > 0 ? ` … (+${rest})` : ""}`;
                return (
                  <button
                    key={group.keywordGroupId}
                    type="button"
                    onClick={() =>
                      onSelectGroup({
                        clienteId: client.clienteId,
                        clientName: client.clientName,
                        keywordGroupId: String(group.keywordGroupId),
                        keywordGroupName: group.keywordGroupName,
                        contrattoId: group.contrattoId ?? undefined,
                        numeroContrattoInterno:
                          group.numeroContrattoInterno ?? undefined,
                        domain: group.domain,
                      })
                    }
                    className={`w-full rounded-md border px-2 py-1 text-left text-[11px] transition-colors ${
                      isSelected
                        ? "border-blue-500 bg-blue-600/80 text-slate-50"
                        : "border-transparent bg-slate-900/60 text-slate-300 hover:border-slate-700 hover:bg-slate-900"
                    }`}
                  >
                    <div className="font-medium">{group.keywordGroupName}</div>
                    <div className="text-[10px] text-slate-400">
                      Dominio: {group.domain}
                      {group.numeroContrattoInterno
                        ? ` · Contratto interno: ${group.numeroContrattoInterno}`
                        : ""}
                    </div>
                    <div className="mt-0.5 line-clamp-1 text-[10px] text-slate-500">
                      {preview}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 border-t border-slate-800 pt-2 flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onOpenSettings}
          className="relative"
        >
          <span className="mr-1">⚙</span>
          <span>Impostazioni</span>
          {hasUpdateAvailable && (
            <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_0_2px_rgba(15,23,42,1)]" />
          )}
        </Button>
      </div>
    </div>
  );
}
