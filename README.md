# BetterSirius

BetterSirius is an unofficial, open-source browser extension that adds a responsive, read-only interface over UNIMET's legacy Sirius portal. SAP remains mounted underneath and remains the system of record.

The current MVP foundation is intentionally narrow but includes a functional grade-reading slice. Explicit actions for `Consulta Calificaciones Históricas` and `Consulta de Calificaciones Período` traverse their exact, allowlisted Sirius menu labels. Both entries use the same observed Web Dynpro application, so BetterSirius shares one safe reader for the visible program list, the read-only “include withdrawn courses” filter, the academic-period list, and the selected period's responsive course table. It does not yet display schedules, balances, registration-window values, statistics, or academic-offer results; submit forms; contact Sirius independently; persist student information; or delegate mutating SAP actions.

## Safety boundary

- Runs only on the observed `http://sirius.unimet.edu.ve/irj/*` scope.
- Has no background service worker, telemetry, remote code, or network API usage.
- Never persists complete URLs, cookies, hidden fields, SAP secure IDs, or Web Dynpro transport state.
- Keeps parsed academic-history values in memory only and removes them with the page.
- Delegates only explicit grade-reading interactions already visible in Sirius: either exact allowlisted grade-query entry, program selection, the withdrawn-course display filter, and one academic-period selection. It never submits forms, retries automatically, prefetches, or keeps a session alive.
- Falls back to Sirius original when the state is unknown.
- Uses only synthetic local HTML in automated tests.

Read [the threat model](docs/threat-model.md) before expanding the scope. The authenticated architecture observations are recorded in [the sanitized discovery report](docs/discovery-report.md).

## Local development

Requirements: Node.js 22 or newer.

```sh
npm install
npm run verify
npm run preview
```

The synthetic preview runs at `http://localhost:4173`. Open `?panel=history` for the functional synthetic history view, `?inquiry=period` for the period-grade view, or `?panel=academic` for the academic-process catalog. Query states are also available for local UI review: `?state=empty`, `?state=error`, and `?state=expired`. The preview contains no live portal content and makes no Sirius requests.

After `npm run build`, load `dist/` as an unpacked extension in a Chromium browser. Do not exercise it against a live account as part of automated testing.

Licensed under the [MIT License](LICENSE).
