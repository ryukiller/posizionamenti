## Playwright scanner configuration

The desktop app uses a Playwright-based scanner to open Google and collect SERP
positions. You can tune its behaviour using environment variables.

### Manual CAPTCHA mode

When Google shows a CAPTCHA, you may want to solve it manually before the scan
continues. Enable **manual CAPTCHA mode** to give yourself more time on each
SERP page:

- **`PLAYWRIGHT_MANUAL_CAPTCHA_MODE=true`** (preferred)  
  or
- **`MANUAL_CAPTCHA_MODE=true`**

Optional timing override:

- **`MANUAL_CAPTCHA_WAIT_MS=<milliseconds>`**  
  Default: `120000` (120 seconds).

With manual mode enabled:

- The browser is opened **in non-headless mode**.
- After navigating to the Google SERP, the scanner waits up to
  `MANUAL_CAPTCHA_WAIT_MS` before scraping results and taking a screenshot.
- Use that time window to solve any CAPTCHA that appears.

If manual mode is **disabled** (default), the scanner behaves as before:

- It waits only `DELAY_BETWEEN_QUERIES_MS` (default 1500 ms) after navigation.
- It does **not** provide extra time for manual CAPTCHA solving.

### Reusing a Chrome/Chromium profile

To reduce the number of CAPTCHAs, you can tell Playwright to reuse an existing
Chrome/Chromium profile. This lets Google see a more “normal” browsing pattern
with your usual cookies.

Set the following environment variables:

- **`PLAYWRIGHT_PROFILE_DIR=/absolute/path/to/your/profile`**  
  Example (macOS, Chrome stable):
  - `/Users/<you>/Library/Application Support/Google/Chrome/Default`
- Optional: **`PLAYWRIGHT_BROWSER_CHANNEL=chrome`**  
  (or `chromium`, depending on your installed browser).

When `PLAYWRIGHT_PROFILE_DIR` is set:

- The scanner launches Playwright using a **persistent context** based on that
  directory instead of a fresh browser for each run.
- Your cookies, logins, and browsing history from that profile are reused.

**Tradeoffs and caveats:**

- Make sure Chrome is **closed** before running the scanner with the same
  profile directory; using the same profile concurrently can cause corruption
  or failures.
- This ties the scanner to the specific browser/profile layout on your machine.
  If Chrome is moved or the profile path changes, you will need to update
  `PLAYWRIGHT_PROFILE_DIR`.
- Using your real, logged-in profile may reduce CAPTCHAs but does not remove
  them entirely; Google can still challenge automated behaviour.
