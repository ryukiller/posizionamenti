/* global window, document */

const runOnceBtn = document.getElementById("runOnceBtn");
const statusEl = document.getElementById("status").querySelector("span");
const logEl = document.getElementById("log");
const sidebarEl = document.getElementById("clientsSidebar");
const sidebarErrorEl = document.getElementById("sidebarError");
const selectionSummaryEl = document.getElementById("selectionSummary");

const refreshResultsBtn = document.getElementById("refreshResultsBtn");
const exportCsvBtn = document.getElementById("exportCsvBtn");
const resultsTotalEl = document.getElementById("resultsTotal");
const resultsFoundEl = document.getElementById("resultsFound");
const resultsNotFoundEl = document.getElementById("resultsNotFound");
const resultsRangeEl = document.getElementById("resultsRange");
const resultsTableBody = document.getElementById("resultsTableBody");
const resultsMainTable = document.getElementById("resultsMainTable");
const resultsBatchesContainer = document.getElementById(
  "resultsBatchesContainer",
);
const clientSearchInput = document.getElementById("clientSearchInput");
const openSettingsBtn = document.getElementById("openSettingsBtn");
const settingsBackdrop = document.getElementById("settingsBackdrop");
const settingsBrowserSelect = document.getElementById("settingsBrowserSelect");
const settingsProfileDirInput = document.getElementById("settingsProfileDirInput");
const settingsChooseProfileBtn = document.getElementById("settingsChooseProfileBtn");
const settingsShowBrowserCheckbox = document.getElementById(
  "settingsShowBrowserCheckbox",
);
const settingsLanguageSelect = document.getElementById("settingsLanguageSelect");
const settingsBackendBaseUrlInput = document.getElementById(
  "settingsBackendBaseUrlInput",
);
const settingsApiKeyInput = document.getElementById("settingsApiKeyInput");
const settingsErrorEl = document.getElementById("settingsError");
const settingsCancelBtn = document.getElementById("settingsCancelBtn");
const settingsSaveBtn = document.getElementById("settingsSaveBtn");

let clientsData = [];
let sidebarLoadFailedOnce = false;
let clientFilter = "";
let selectedGroup = null;
let apiBaseUrl = null;
let userSettings = null;

async function loadConfig() {
  if (!window.posizionamenti || !window.posizionamenti.getConfig) return;
  try {
    const config = await window.posizionamenti.getConfig();
    if (config && typeof config.swiBaseUrl === "string") {
      apiBaseUrl = config.swiBaseUrl;
    }
  } catch {
    // Ignore config load errors; screenshot URLs will be used as-is.
  }
}
async function loadUserSettings() {
  if (!window.posizionamenti || !window.posizionamenti.getUserSettings) return;
  try {
    userSettings = await window.posizionamenti.getUserSettings();
  } catch {
    // ignore settings load errors
  }
}

function openSettingsModal() {
  if (!settingsBackdrop) return;
  if (!userSettings) {
    userSettings = {
      browser: "system-default",
      browserProfileDir: null,
      headless: false,
      language: "auto",
      backendBaseUrl: null,
      apiKey: null,
    };
  }
  if (settingsBrowserSelect) {
    settingsBrowserSelect.value = userSettings.browser || "system-default";
  }
  if (settingsProfileDirInput) {
    settingsProfileDirInput.value =
      userSettings.browserProfileDir || "Nessuna cartella selezionata";
  }
  if (settingsShowBrowserCheckbox) {
    settingsShowBrowserCheckbox.checked = !userSettings.headless;
  }
  if (settingsLanguageSelect) {
    settingsLanguageSelect.value = userSettings.language || "auto";
  }
  if (settingsBackendBaseUrlInput) {
    settingsBackendBaseUrlInput.value = userSettings.backendBaseUrl || "";
  }
  if (settingsApiKeyInput) {
    settingsApiKeyInput.value = userSettings.apiKey || "";
  }
  if (settingsErrorEl) {
    settingsErrorEl.textContent = "";
  }
  settingsBackdrop.classList.add("open");
}

function closeSettingsModal() {
  if (!settingsBackdrop) return;
  settingsBackdrop.classList.remove("open");
}

async function handleSaveSettings() {
  if (!window.posizionamenti || !window.posizionamenti.updateUserSettings) return;
  const payload = {};
  if (settingsBrowserSelect) {
    payload.browser = settingsBrowserSelect.value || "system-default";
  }
  if (settingsProfileDirInput) {
    const value = settingsProfileDirInput.value.trim();
    payload.browserProfileDir =
      value && value !== "Nessuna cartella selezionata" ? value : null;
  }
  if (settingsShowBrowserCheckbox) {
    payload.headless = !settingsShowBrowserCheckbox.checked;
  }
  if (settingsLanguageSelect) {
    payload.language = settingsLanguageSelect.value || "auto";
  }
  if (settingsBackendBaseUrlInput) {
    const value = settingsBackendBaseUrlInput.value.trim();
    payload.backendBaseUrl = value || null;
  }
  if (settingsApiKeyInput) {
    const value = settingsApiKeyInput.value.trim();
    payload.apiKey = value || null;
  }
  try {
    const result = await window.posizionamenti.updateUserSettings(payload);
    if (!result || !result.success) {
      const message =
        (result && result.error) ||
        "Impossibile salvare le impostazioni. Riprova.";
      if (settingsErrorEl) {
        settingsErrorEl.textContent = message;
      }
      return;
    }
    appendLog(
      "Impostazioni salvate. Le prossime scansioni useranno il nuovo browser.",
    );
    await loadUserSettings();
    closeSettingsModal();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (settingsErrorEl) {
      settingsErrorEl.textContent = message;
    }
  }
}

async function handleChooseProfileDir() {
  if (!window.posizionamenti || !window.posizionamenti.chooseProfileDir) return;
  try {
    const result = await window.posizionamenti.chooseProfileDir();
    if (!result || !result.success || result.canceled) {
      return;
    }
    if (settingsProfileDirInput) {
      settingsProfileDirInput.value = result.path;
    }
  } catch {
    if (settingsErrorEl) {
      settingsErrorEl.textContent =
        "Impossibile aprire il selettore cartelle. Riprova.";
    }
  }
}
let currentResults = [];
let batchAccordionState = {};

function appendLog(message, isError) {
  const line = document.createElement("div");
  line.className = "log-line" + (isError ? " error" : "");
  const timestamp = new Date().toISOString();
  line.textContent = `[${timestamp}] ${message}`;
  logEl.appendChild(line);
  logEl.scrollTop = logEl.scrollHeight;
}

function setStatus(text) {
  statusEl.textContent = text;
}

function setSelectionSummary() {
  if (!selectedGroup) {
    selectionSummaryEl.textContent = "Nessun gruppo selezionato.";
    return;
  }
  const {
    clientName,
    keywordGroupName,
    domain,
    numeroContrattoInterno,
  } = selectedGroup;
  const contractPart = numeroContrattoInterno
    ? ` · Contratto interno: <span>${numeroContrattoInterno}</span>`
    : "";
  selectionSummaryEl.innerHTML = `Gruppo selezionato: <span>${clientName}</span> → <span>${keywordGroupName}</span> (dominio: <span>${domain}</span>${contractPart})`;
}

function groupMatchesFilter(client, group, filterLower) {
  if (!filterLower) return true;
  const clientStr = (
    client.clientName ||
    client.clienteId ||
    client.clientId ||
    ""
  ).toLowerCase();
  if (clientStr.includes(filterLower)) return true;
  const domainStr = (group.domain || "").toLowerCase();
  if (domainStr.includes(filterLower)) return true;
  const kws = Array.isArray(group.keywords) ? group.keywords : [];
  for (const kw of kws) {
    if (String(kw).toLowerCase().includes(filterLower)) return true;
  }
  return false;
}

function getFilteredClients() {
  const filterLower = clientFilter.trim().toLowerCase();
  if (!filterLower) return clientsData;
  return clientsData
    .map((client) => ({
      ...client,
      groups: client.groups.filter((g) =>
        groupMatchesFilter(client, g, filterLower),
      ),
    }))
    .filter((c) => c.groups.length > 0);
}

function renderSidebar() {
  sidebarEl.innerHTML = "";
  if (!clientsData || clientsData.length === 0) {
    const empty = document.createElement("div");
    empty.style.fontSize = "12px";
    empty.style.color = "#6b7280";
    empty.textContent = "Nessun cliente con gruppi di keyword disponibile.";
    sidebarEl.appendChild(empty);
    return;
  }

  const filteredClients = getFilteredClients();

  for (const client of filteredClients) {
    const section = document.createElement("div");
    section.className = "client-section";

    const nameEl = document.createElement("div");
    nameEl.className = "client-name";
    nameEl.textContent = client.clientName || client.clienteId || client.clientId;
    section.appendChild(nameEl);

    for (const group of client.groups) {
      const item = document.createElement("div");
      item.className = "group-item";
      item.dataset.clienteId = client.clienteId || client.clientId || "";
      item.dataset.clientName = client.clientName || "";
      item.dataset.keywordGroupId = group.keywordGroupId;
      item.dataset.keywordGroupName = group.keywordGroupName;
      item.dataset.contrattoId = group.contrattoId ?? "";
      item.dataset.numeroContrattoInterno =
        group.numeroContrattoInterno ?? "";
      item.dataset.domain = group.domain;

      const name = document.createElement("div");
      name.className = "group-name";
      name.textContent = group.keywordGroupName;

      const meta = document.createElement("div");
      meta.className = "group-meta";
      const numeroContrattoInterno = group.numeroContrattoInterno;
      meta.textContent = `Dominio: ${group.domain}${numeroContrattoInterno
        ? ` · Contratto interno: ${numeroContrattoInterno}`
        : ""
        }`;

      const keywordsPreview = document.createElement("div");
      keywordsPreview.className = "group-keywords-preview";
      const kws = Array.isArray(group.keywords) ? group.keywords : [];
      if (kws.length === 0) {
        keywordsPreview.textContent = "Nessuna keyword";
      } else {
        const maxToShow = 5;
        const visible = kws.slice(0, maxToShow);
        const rest = kws.length - visible.length;
        keywordsPreview.textContent = visible.join(", ");
        if (rest > 0) {
          keywordsPreview.textContent += ` … (+${rest})`;
        }
      }

      item.appendChild(name);
      item.appendChild(meta);
      item.appendChild(keywordsPreview);

      item.addEventListener("click", () => {
        const previouslySelected = sidebarEl.querySelector(
          ".group-item.selected",
        );
        if (previouslySelected) {
          previouslySelected.classList.remove("selected");
        }
        item.classList.add("selected");

        selectedGroup = {
          clienteId: item.dataset.clienteId,
          clientName: item.dataset.clientName,
          keywordGroupId: item.dataset.keywordGroupId,
          keywordGroupName: item.dataset.keywordGroupName,
          contrattoId: item.dataset.contrattoId || undefined,
          numeroContrattoInterno:
            item.dataset.numeroContrattoInterno || undefined,
          domain: item.dataset.domain,
        };
        setSelectionSummary();
        void loadResultsForSelectedGroup();
      });

      section.appendChild(item);
    }

    sidebarEl.appendChild(section);
  }

  const selectedCid = selectedGroup.clienteId || selectedGroup.clientId;
  const selectedStillVisible =
    selectedGroup &&
    selectedCid &&
    filteredClients.some(
      (c) =>
        (c.clienteId || c.clientId) === selectedCid &&
        c.groups.some(
          (g) => g.keywordGroupId === selectedGroup.keywordGroupId,
        ),
    );
  if (selectedStillVisible) {
    const items = sidebarEl.querySelectorAll(".group-item");
    for (const item of items) {
      const itemCid = item.dataset.clienteId || item.dataset.clientId;
      if (
        itemCid === selectedCid &&
        item.dataset.keywordGroupId === selectedGroup.keywordGroupId
      ) {
        item.classList.add("selected");
        break;
      }
    }
  } else if (selectedGroup) {
    selectedGroup = null;
    setSelectionSummary();
    void loadResultsForSelectedGroup();
  }
}

async function loadClients() {
  if (!window.posizionamenti || !window.posizionamenti.getClientsWithGroups) {
    // Sidebar API not available (e.g. preload not loaded). Show a soft message once.
    if (!sidebarLoadFailedOnce) {
      sidebarErrorEl.style.display = "block";
      sidebarErrorEl.textContent = "API sidebar non disponibile.";
      sidebarLoadFailedOnce = true;
    }
    return;
  }

  sidebarErrorEl.style.display = "none";
  sidebarErrorEl.textContent = "";

  try {
    const result = await window.posizionamenti.getClientsWithGroups();
    if (!result || !result.success) {
      const message = result && result.error ? result.error : "errore sconosciuto";
      // For non-critical errors (es. dati malformati su un target) non blocchiamo la UI.
      // Mostriamo un messaggio discreto una sola volta e logghiamo in background.
      // if (!sidebarLoadFailedOnce) {
      //   sidebarErrorEl.style.display = "block";
      //   sidebarErrorEl.textContent =
      //     "Impossibile caricare alcuni clienti. Verifica la configurazione solo se il problema persiste.";
      //   sidebarLoadFailedOnce = true;
      // }
      // Evita di spaventare l'utente con dettagli tecnici ripetuti nel log.
      if (!String(message).includes("clienteId")) {
        appendLog(
          `Errore caricando lista clienti/gruppi: ${message}`,
          true,
        );
      }
      return;
    }
    clientsData = result.clients || [];
    renderSidebar();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // if (!sidebarLoadFailedOnce) {
    //   sidebarErrorEl.style.display = "block";
    //   sidebarErrorEl.textContent =
    //     "Impossibile contattare l'API clienti. Riprova tra qualche minuto.";
    //   sidebarLoadFailedOnce = true;
    // }
    if (!String(message).includes("clienteId")) {
      appendLog(
        `Errore caricando lista clienti/gruppi: ${message}`,
        true,
      );
    }
  }
}

async function loadResultsForSelectedGroup() {
  if (!selectedGroup) {
    currentResults = [];
    renderResultsTable();
    updateResultsSummary();
    return;
  }
  if (!window.posizionamenti || !window.posizionamenti.getResults) {
    appendLog("API risultati non disponibile", true);
    return;
  }
  try {
    const rawClienteId = selectedGroup.clienteId;
    const rawContrattoId = selectedGroup.contrattoId;
    const clienteId =
      rawClienteId &&
        String(rawClienteId).trim() !== "" &&
        String(rawClienteId).toLowerCase() !== "undefined"
        ? String(rawClienteId).trim()
        : undefined;
    const contrattoId =
      rawContrattoId &&
        String(rawContrattoId).trim() !== "" &&
        String(rawContrattoId).toLowerCase() !== "undefined"
        ? String(rawContrattoId).trim()
        : null;
    const query = {
      clienteId: clienteId ?? null,
      contrattoId,
      keywordGroupId: selectedGroup.keywordGroupId || null,
    };
    const result = await window.posizionamenti.getResults(query);
    if (!result || !result.success) {
      const message = result && result.error ? result.error : "errore sconosciuto";
      appendLog(`Errore caricando risultati: ${message}`, true);
      return;
    }
    currentResults = result.results || [];
    const count = currentResults.length;
    if (count === 0) {
      appendLog(
        "Nessun risultato trovato per questo gruppo. Esegui una scansione o verifica che l'API restituisca risultati per clienteId/contrattoId/keywordGroupId.",
      );
    } else {
      appendLog(`Caricati ${count} risultati per il gruppo selezionato.`);
    }
    renderResultsTable();
    updateResultsSummary();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    appendLog(`Errore caricando risultati: ${message}`, true);
  }
}

function resolveScreenshotUrl(rawUrl) {
  const raw = String(rawUrl);
  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }
  if (!apiBaseUrl) {
    return raw;
  }
  const base = apiBaseUrl.replace(/\/+$/, "");
  if (raw.startsWith("/")) {
    return `${base}${raw}`;
  }
  return `${base}/${raw}`;
}

function createResultRow(result) {
  const tr = document.createElement("tr");

  const tdKeyword = document.createElement("td");
  tdKeyword.textContent = result.keyword;

  const tdDomain = document.createElement("td");
  tdDomain.textContent = result.searchedDomain;

  const tdPosition = document.createElement("td");
  if (result.position !== null && result.position !== undefined) {
    tdPosition.textContent = String(result.position);
    tdPosition.className = "position-found";
  } else {
    tdPosition.textContent = "–";
    tdPosition.className = "position-not-found";
  }

  const tdUrl = document.createElement("td");
  tdUrl.textContent = result.foundUrl || "";

  const tdGoogle = document.createElement("td");
  const googleUrl = result.serpUrl || "";
  if (googleUrl) {
    const link = document.createElement("a");
    link.href = googleUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Apri";
    tdGoogle.appendChild(link);
  } else {
    tdGoogle.textContent = "-";
  }

  const tdScreenshot = document.createElement("td");
  if (result.screenshotUrl) {
    const screenshotUrl = resolveScreenshotUrl(result.screenshotUrl);

    const openLink = document.createElement("span");
    openLink.className = "screenshot-link";
    openLink.textContent = "Apri";
    openLink.addEventListener("click", () => {
      window.open(screenshotUrl, "_blank");
    });

    const downloadLink = document.createElement("span");
    downloadLink.className = "screenshot-link";
    downloadLink.textContent = "Scarica";
    downloadLink.addEventListener("click", () => {
      const a = document.createElement("a");
      a.href = screenshotUrl;
      a.download = "";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    });

    tdScreenshot.appendChild(openLink);
    tdScreenshot.appendChild(downloadLink);
  } else {
    tdScreenshot.textContent = "-";
  }

  const tdDate = document.createElement("td");
  const d = new Date(result.runAt);
  tdDate.textContent = Number.isNaN(d.getTime())
    ? result.runAt
    : `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;

  tr.appendChild(tdKeyword);
  tr.appendChild(tdDomain);
  tr.appendChild(tdPosition);
  tr.appendChild(tdUrl);
  tr.appendChild(tdGoogle);
  tr.appendChild(tdScreenshot);
  tr.appendChild(tdDate);

  return tr;
}

function formatBatchTitle(runAtSample) {
  const d = new Date(runAtSample);
  if (Number.isNaN(d.getTime())) {
    return String(runAtSample);
  }
  const pad = (n) => String(n).padStart(2, "0");
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hour = pad(d.getHours());
  const minute = pad(d.getMinutes());
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function renderResultsTable() {
  if (!resultsBatchesContainer) return;

  // Accordion mode: one table per batch (always used).
  if (resultsMainTable) {
    resultsMainTable.style.display = "none";
  }
  resultsTableBody.innerHTML = "";
  resultsBatchesContainer.innerHTML = "";
  resultsBatchesContainer.style.display = "block";

  const batches = {};
  for (const r of currentResults) {
    const key = r.batchId || r.runAt || "unknown";
    if (!batches[key]) {
      batches[key] = [];
    }
    batches[key].push(r);
  }

  // Ensure every batch is closed by default unless we already have state.
  for (const batchId of Object.keys(batches)) {
    if (!(batchId in batchAccordionState)) {
      batchAccordionState[batchId] = false;
    }
  }

  const sortedBatchIds = Object.keys(batches).sort((a, b) => {
    const aDate = new Date(batches[a][0]?.runAt ?? 0).getTime();
    const bDate = new Date(batches[b][0]?.runAt ?? 0).getTime();
    return bDate - aDate;
  });

  for (const batchId of sortedBatchIds) {
    const results = batches[batchId];
    if (!results || results.length === 0) continue;

    const batchContainer = document.createElement("div");
    batchContainer.className = "batch-accordion";

    const header = document.createElement("div");
    header.className = "batch-accordion-header";
    header.setAttribute("data-batch-id", batchId);

    const headerLeft = document.createElement("button");
    headerLeft.type = "button";
    headerLeft.className = "batch-accordion-toggle";

    const isExpanded = !!batchAccordionState[batchId];
    headerLeft.setAttribute("aria-expanded", String(isExpanded));

    const iconSpan = document.createElement("span");
    iconSpan.className =
      "batch-accordion-icon" + (isExpanded ? " batch-accordion-icon-open" : "");
    iconSpan.textContent = isExpanded ? "▾" : "▸";

    const titleSpan = document.createElement("span");
    titleSpan.className = "batch-accordion-title";
    titleSpan.textContent = formatBatchTitle(results[0].runAt);

    const countSpan = document.createElement("span");
    countSpan.className = "batch-accordion-count";
    countSpan.textContent = `${results.length} risultati`;

    headerLeft.appendChild(iconSpan);
    headerLeft.appendChild(titleSpan);
    headerLeft.appendChild(countSpan);

    const headerRight = document.createElement("button");
    headerRight.type = "button";
    headerRight.className = "batch-accordion-download";
    headerRight.title = "Scarica ZIP batch";
    headerRight.innerText = "⬇︎";

    header.appendChild(headerLeft);
    header.appendChild(headerRight);

    const panel = document.createElement("div");
    panel.className =
      "batch-accordion-panel" + (isExpanded ? " batch-accordion-panel-open" : "");

    const table = document.createElement("table");
    table.className = "results-table";

    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    const headers = [
      "Keyword",
      "Dominio",
      "Posizione",
      "URL trovato",
      "Google",
      "Screenshot",
      "Data/ora",
    ];
    for (const h of headers) {
      const th = document.createElement("th");
      th.textContent = h;
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);

    const tbody = document.createElement("tbody");
    for (const r of results) {
      const tr = createResultRow(r);
      tbody.appendChild(tr);
    }

    table.appendChild(thead);
    table.appendChild(tbody);
    panel.appendChild(table);

    headerLeft.addEventListener("click", () => {
      const current = !!batchAccordionState[batchId];
      const next = !current;
      batchAccordionState[batchId] = next;

      headerLeft.setAttribute("aria-expanded", String(next));
      if (next) {
        iconSpan.textContent = "▾";
        iconSpan.classList.add("batch-accordion-icon-open");
        panel.classList.add("batch-accordion-panel-open");
      } else {
        iconSpan.textContent = "▸";
        iconSpan.classList.remove("batch-accordion-icon-open");
        panel.classList.remove("batch-accordion-panel-open");
      }
    });

    headerRight.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (
        !window.posizionamenti ||
        !window.posizionamenti.chooseBatchZipPath ||
        !window.posizionamenti.downloadBatchZip
      ) {
        appendLog("Funzione download ZIP batch non disponibile.", true);
        return;
      }
      try {
        const chooseResult = await window.posizionamenti.chooseBatchZipPath();
        if (!chooseResult || !chooseResult.success || chooseResult.canceled) {
          if (!chooseResult || !chooseResult.canceled) {
            appendLog(
              "Creazione ZIP annullata o non riuscita nella scelta del percorso.",
              true,
            );
          }
          return;
        }
        const payloadResults = results.map((r) => ({
          ...r,
          screenshotUrlResolved: r.screenshotUrl
            ? resolveScreenshotUrl(r.screenshotUrl)
            : "",
        }));
        const result = await window.posizionamenti.downloadBatchZip({
          outputPath: chooseResult.filePath,
          batchId,
          results: payloadResults,
        });
        if (!result || !result.success) {
          const message = result && result.error ? result.error : "errore sconosciuto";
          appendLog(`Errore scaricando ZIP per il batch: ${message}`, true);
        } else {
          appendLog("ZIP del batch creato con successo.");
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        appendLog(`Errore scaricando ZIP per il batch: ${message}`, true);
      }
    });

    batchContainer.appendChild(header);
    batchContainer.appendChild(panel);
    resultsBatchesContainer.appendChild(batchContainer);
  }
}

function updateResultsSummary() {
  const total = currentResults.length;
  let found = 0;
  let notFound = 0;
  let minDate = null;
  let maxDate = null;

  for (const r of currentResults) {
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

  if (resultsTotalEl) resultsTotalEl.textContent = String(total);
  if (resultsFoundEl) resultsFoundEl.textContent = String(found);
  if (resultsNotFoundEl) resultsNotFoundEl.textContent = String(notFound);
  if (resultsRangeEl) {
    if (!minDate || !maxDate) {
      resultsRangeEl.textContent = "-";
    } else {
      resultsRangeEl.textContent = `${minDate.toLocaleDateString()} → ${maxDate.toLocaleDateString()}`;
    }
  }
}

function exportResultsToCsv() {
  if (!currentResults || currentResults.length === 0) {
    appendLog("Nessun risultato da esportare.", true);
    return;
  }
  const headers = [
    "keyword",
    "searchedDomain",
    "position",
    "foundUrl",
    "serpUrl",
    "screenshotUrl",
    "runAt",
  ];
  const rows = currentResults.map((r) =>
    [
      r.keyword ?? "",
      r.searchedDomain ?? "",
      r.position ?? "",
      r.foundUrl ?? "",
      r.serpUrl ?? "",
      r.screenshotUrl ?? "",
      r.runAt ?? "",
    ].map((value) => {
      const str = String(value);
      if (str.includes('"') || str.includes(",") || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(","),
  );
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "scan-results.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

runOnceBtn.addEventListener("click", async () => {
  if (!window.posizionamenti) {
    appendLog("API posizionamenti non disponibile", true);
    return;
  }

  if (!selectedGroup) {
    appendLog(
      "Seleziona prima un gruppo di keyword nella sidebar per avviare la scansione.",
      true,
    );
    return;
  }

  runOnceBtn.disabled = true;
  setStatus("in esecuzione...");
  appendLog(
    `Avvio scansione run-once per cliente "${selectedGroup.clientName}", gruppo "${selectedGroup.keywordGroupName}".`,
  );

  const clienteId = selectedGroup.clienteId;
  const contrattoId = selectedGroup.contrattoId || undefined;
  const keywordGroupId = selectedGroup.keywordGroupId || undefined;

  try {
    const result = await window.posizionamenti.runScanOnce({
      clienteId,
      contrattoId,
      keywordGroupId,
    });

    if (!result || !result.success) {
      appendLog(
        `Scansione terminata con errore: ${result && result.error ? result.error : "errore sconosciuto"
        }`,
        true,
      );
      setStatus("errore");
    } else {
      appendLog("Scansione completata con successo.");
      setStatus("completata");
      // Dopo una scansione, ricarica i risultati per il gruppo selezionato
      await loadResultsForSelectedGroup();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    appendLog(`Errore eseguendo la scansione: ${message}`, true);
    setStatus("errore");
  } finally {
    runOnceBtn.disabled = false;
  }
});

if (refreshResultsBtn) {
  refreshResultsBtn.addEventListener("click", () => {
    void loadResultsForSelectedGroup();
  });
}

if (exportCsvBtn) {
  exportCsvBtn.addEventListener("click", () => {
    exportResultsToCsv();
  });
}

if (window.posizionamenti && window.posizionamenti.onLog) {
  window.posizionamenti.onLog((message) => {
    appendLog(message, false);
  });
}

if (clientSearchInput) {
  clientSearchInput.addEventListener("input", () => {
    clientFilter = clientSearchInput.value;
    renderSidebar();
  });
}

if (openSettingsBtn && settingsBackdrop) {
  openSettingsBtn.addEventListener("click", () => {
    void loadUserSettings().then(() => {
      openSettingsModal();
    });
  });
}

if (settingsCancelBtn) {
  settingsCancelBtn.addEventListener("click", () => {
    closeSettingsModal();
  });
}

if (settingsSaveBtn) {
  settingsSaveBtn.addEventListener("click", () => {
    void handleSaveSettings();
  });
}

if (settingsChooseProfileBtn) {
  settingsChooseProfileBtn.addEventListener("click", () => {
    void handleChooseProfileDir();
  });
}

if (settingsBackdrop) {
  settingsBackdrop.addEventListener("click", (event) => {
    if (event.target === settingsBackdrop) {
      closeSettingsModal();
    }
  });
}

// Carica config, impostazioni utente e clienti/gruppi all'avvio
Promise.all([loadConfig(), loadUserSettings()]).finally(() => {
  loadClients();
});

