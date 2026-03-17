import React, { useEffect, useState } from "react";
import { Shell, MainHeader } from "./components/layout/Shell";
import { Sidebar } from "./components/sidebar/Sidebar";
import { ScanControls } from "./components/scan/ScanControls";
import { LogConsole } from "./components/log/LogConsole";
import { ResultsSummary } from "./components/results/ResultsSummary";
import { ResultsAccordion } from "./components/results/ResultsAccordion";
import { SettingsDialog } from "./components/settings/SettingsDialog";
import type { SelectedGroup } from "./hooks/useClients";
import { useResults } from "./hooks/useResults";
import { useScan } from "./hooks/useScan";
import { ThemeProvider } from "./lib/theme";
import { getBridge } from "./lib/bridge";

function AppInner() {
  const [selectedGroup, setSelectedGroup] = useState<SelectedGroup | null>(
    null,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hasUpdateAvailable, setHasUpdateAvailable] = useState(false);
  const { results, loadForGroup } = useResults();
  const { running, status, runOnce, setStatus } = useScan();

  const selectionSummary =
    selectedGroup != null
      ? `Gruppo selezionato: ${selectedGroup.clientName} → ${selectedGroup.keywordGroupName} (dominio: ${selectedGroup.domain})`
      : "Nessun gruppo selezionato.";

  async function handleRunScan() {
    if (!selectedGroup) {
      setStatus("errore");
      return;
    }
    const res = await runOnce(selectedGroup);
    if (res?.success) {
      await loadForGroup(selectedGroup);
    }
  }

  async function handleSelectGroup(group: SelectedGroup | null) {
    setSelectedGroup(group);
    await loadForGroup(group);
  }

  useEffect(() => {
    // listen for update:available events to show a green dot on settings
    try {
      const bridge = getBridge();
      bridge.onUpdateAvailable((_payload: unknown) => {
        setHasUpdateAvailable(true);
      });
      bridge.onUpdateDownloaded((_payload: unknown) => {
        setHasUpdateAvailable(true);
      });
      bridge.onUpdateNotAvailable((_payload: unknown) => {
        setHasUpdateAvailable(false);
      });
      bridge.onUpdateStatus((payload: unknown) => {
        const status = (payload as any)?.status;
        if (status === "checking") {
          setHasUpdateAvailable(false);
        }
      });
    } catch {
      // if bridge is not available, just ignore
    }
  }, []);

  return (
    <>
      <Shell
        sidebar={
          <Sidebar
            selectedGroup={selectedGroup}
            onSelectGroup={(g) => {
              void handleSelectGroup(g);
            }}
            onOpenSettings={() => setSettingsOpen(true)}
            hasUpdateAvailable={hasUpdateAvailable}
          />
        }
        main={
          <>
            <MainHeader
              selectedGroup={selectedGroup}
              status={status}
              selectionSummary={selectionSummary}
              themeToggle={null}
            />
            <ScanControls
              running={running}
              selectedGroup={selectedGroup}
              onRunScan={handleRunScan}
            />
            <div className="flex-1 overflow-hidden px-5 py-3 flex flex-col">
              <LogConsole />
              <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
                <div>Risultati ultimi scan per il gruppo selezionato</div>
              </div>
              <ResultsSummary results={results} />
              <div className="flex-1 overflow-auto">
                <ResultsAccordion results={results} />
              </div>
            </div>
          </>
        }
      />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AppInner />
    </ThemeProvider>
  );
}

export default App;
