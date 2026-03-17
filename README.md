# Posizionamenti SERP Scanner

App desktop cross-platform (macOS e Windows) per verificare le posizioni sui motori di ricerca (Google). L'app scarica dalla webapp la lista di clienti/domini/keyword, esegue ricerche in browser visibile con Playwright, rileva la posizione del dominio target nella SERP, salva screenshot annotati e invia i risultati all'API backend.

## Requisiti

- **Node.js** 18+
- **MongoDB** (locale o remoto) per il backend
- **macOS** o **Windows** per l'app desktop

## Struttura

- `desktop/` — Applicazione Electron + Playwright (UI + scanner)
- `backend/` — API Express + MongoDB (auth, scan-targets, scan-runs, scan-results, upload)

## Setup Backend

1. Installa le dipendenze e configura l'ambiente:

   ```bash
   cd backend
   npm install
   cp .env.example .env
   ```

2. Modifica `.env` con:
   - `MONGODB_URI` — URI di connessione MongoDB (es. `mongodb://localhost:27017/posizionamenti`)
   - `AUTH_SECRET` — Token che l'app desktop userà per autenticarsi (es. una stringa lunga e segreta)
   - `PORT` — Porta API (default 3001)
   - `UPLOAD_DIR` — Cartella per upload screenshot (default `./uploads`)

3. Avvia MongoDB (se locale) e poi l'API:

   ```bash
   npm run dev
   ```

4. Popola i dati di esempio:

   ```bash
   npm run seed
   ```

   Questo crea alcuni clienti/domini/keyword nella collezione `scan_targets`.

## Setup Desktop (macOS / Windows)

1. Installa dipendenze, Electron e Playwright Chromium:

   ```bash
   cd desktop
   npm install
   npx playwright install chromium
   ```

   Se Electron non si avvia, prova: `rm -rf node_modules/electron && npm install`

2. Configura l'ambiente:

   ```bash
   cp .env.example .env
   ```

   Modifica `.env`:
   - `API_BASE_URL` — URL del backend (es. `http://localhost:3001`)
   - `AUTH_TOKEN` — Lo stesso valore di `AUTH_SECRET` del backend (per sviluppo)
   - `GOOGLE_COUNTRY` / `GOOGLE_LANG` — Paese e lingua per Google (es. `it`)
   - `SCREENSHOTS_DIR` — Cartella screenshot (default `./screenshots`)
   - `DELAY_BETWEEN_QUERIES_MS` — Pausa tra una ricerca e l’altra (ms)
   - `MAX_SERP_PAGES` — Numero massimo di pagine SERP da controllare (default 1)

3. Avvia l’app in sviluppo:

   ```bash
   npm run dev
   ```

4. Nell’app:
   - Inserisci il token (stesso di `AUTH_SECRET`) e clicca **Verifica token**
   - Clicca **Aggiorna lista** per caricare i target dall’API
   - Seleziona uno o più domini dalla lista (checkbox)
   - Clicca **Avvia scansione**

   Il browser Chromium si apre in modalità visibile; per ogni keyword viene effettuata una ricerca Google, viene rilevata la posizione del dominio target e salvato uno screenshot. Se compare un captcha o una pagina anomala, l’app va in pausa (**Riprendi scansione** dopo aver risolto manualmente).

## Script disponibili

### Backend

- `npm run dev` — Avvia l’API in sviluppo
- `npm run start` — Avvia l’API (produzione)
- `npm run seed` — Inserisce dati di esempio in MongoDB

### Desktop

- `npm run dev` — Avvia Electron in sviluppo
- `npm run package` — Crea il pacchetto con electron-builder (mac: `.dmg`, win: installer `.exe`)

## Packaging (macOS / Windows)

Da `desktop/`:

```bash
npm run package
```

- **macOS**: in `desktop/dist/` trovi il `.dmg`
- **Windows**: in `desktop/dist/` trovi l’installer NSIS

Requisiti per il build:

- macOS: Xcode Command Line Tools (per build mac)
- Windows: ambiente Windows (per build win); su Mac puoi fare solo build mac

## Stati della scansione

- **idle** — Nessuna scansione attiva
- **running** — Scansione in corso (ricerche sequenziali)
- **waiting_for_user** — In attesa di intervento (es. captcha): risolvi nel browser e clicca **Riprendi scansione**
- **resumed** — Ripresa dopo la pausa
- **completed** — Job completato; risultati salvati localmente e inviati all’API
- **failed** — Errore non recuperabile

## Note

- Il browser è sempre **visibile** (headed); l’utente può intervenire in caso di captcha.
- Le ricerche sono **sequenziali** (una keyword alla volta).
- Gli screenshot vengono salvati in `SCREENSHOTS_DIR`; opzionalmente è possibile caricarli tramite l’endpoint `POST /uploads/screenshot`.
- Il parser della SERP dipende dalla struttura HTML di Google; in caso di modifiche del markup potrebbe essere necessario aggiornare i selettori in `desktop/src/lib/playwright-scanner.js`.
